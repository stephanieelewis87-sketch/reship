import { describe, expect, it } from "vitest";
import { syncAll, type OrderSink } from "./sync";
import { NotReadyError, type Connector, type ImportedOrder } from "./connectors/types";

const order = (n: string): ImportedOrder => ({
  platform: "Poshmark",
  orderNumber: n,
  buyer: "jess",
  date: "2026-10-24",
  items: [{ name: "Jeans" }],
  carrier: "USPS Priority",
});

function fakeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    platform: "Poshmark",
    loginUrl: "https://poshmark.com/login",
    isLoggedIn: async () => true,
    listOrdersToShip: async () => [order("A1"), order("A2"), order("A3")],
    downloadLabel: async (o) => (o.orderNumber === "A3" ? null : new Blob(["%PDF"])),
    ...overrides,
  };
}

function memorySink(known: [string, boolean][] = []) {
  const saved: { order: ImportedOrder; label: Blob | null }[] = [];
  const attached: string[] = [];
  const sink: OrderSink = {
    knownOrders: async () => new Map(known),
    saveOrder: async (order, label) => {
      saved.push({ order, label });
    },
    attachLabel: async (order) => {
      attached.push(order.orderNumber);
    },
  };
  return { sink, saved, attached };
}

describe("syncAll", () => {
  it("imports only new orders and counts the labels it found", async () => {
    const { sink, saved } = memorySink([["A1", true]]);
    const [res] = await syncAll([fakeConnector()], new Set(["Poshmark"]), sink);
    expect(res).toMatchObject({ status: "ok", imported: 2, labels: 1 });
    expect(saved.map((s) => s.order.orderNumber)).toEqual(["A2", "A3"]);
  });

  it("keeps an order when its label download fails", async () => {
    const { sink, saved } = memorySink();
    const c = fakeConnector({
      listOrdersToShip: async () => [order("B1")],
      downloadLabel: async () => {
        throw new Error("label not ready");
      },
    });
    const [res] = await syncAll([c], new Set(["Poshmark"]), sink);
    expect(res).toMatchObject({ status: "ok", imported: 1, labels: 0 });
    expect(saved[0].label).toBeNull();
  });

  it("retries the label for orders imported earlier without one", async () => {
    const { sink, saved, attached } = memorySink([["A1", false], ["A2", true]]);
    const [res] = await syncAll([fakeConnector({ listOrdersToShip: async () => [order("A1"), order("A2")] })], new Set(["Poshmark"]), sink);
    expect(saved).toHaveLength(0);
    expect(attached).toEqual(["A1"]);
    expect(res).toMatchObject({ imported: 0, labels: 1 });
  });

  it("reports logged-out, not-ready and skipped marketplaces without stopping the rest", async () => {
    const { sink } = memorySink();
    const results = await syncAll(
      [
        fakeConnector({ platform: "Mercari", isLoggedIn: async () => false }),
        fakeConnector({
          platform: "Depop",
          listOrdersToShip: async () => {
            throw new NotReadyError("Depop");
          },
        }),
        fakeConnector({ platform: "Vinted" }),
        fakeConnector({ platform: "Poshmark" }),
      ],
      new Set(["Mercari", "Depop", "Poshmark"]),
      sink,
    );
    expect(results.map((r) => [r.platform, r.status])).toEqual([
      ["Mercari", "logged-out"],
      ["Depop", "not-ready"],
      ["Poshmark", "ok"],
    ]);
  });
});
