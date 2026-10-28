import { describe, expect, it } from "vitest";
import type { InventoryItem, Order } from "./types";
import { activeOn, aging, breakdown, estimateFees, goalPace, metrics, presetRange, previousRange, saleLines, series, soldDates } from "./analytics";
import { sampleHistory } from "./sampleHistory";

const order = (o: Partial<Order>): Order => ({
  id: "o1",
  platform: "Poshmark",
  orderId: "PM-1",
  buyer: "b",
  items: [{ name: "Lululemon Align Leggings", sku: "LUL-1", price: 50 }],
  date: "2026-10-10",
  status: "shipped",
  carrier: "USPS Priority",
  source: "manual",
  ...o,
});

const inv = (i: Partial<InventoryItem>): InventoryItem => ({
  id: "i1",
  sku: "LUL-1",
  title: "Lululemon Align Leggings",
  cost: 8,
  listPrice: 60,
  listedAt: "2026-10-01",
  status: "listed",
  platforms: ["Poshmark"],
  ...i,
});

describe("saleLines", () => {
  it("takes cost and listing date from the inventory item with the same SKU", () => {
    const [line] = saleLines([order({})], [inv({})]);
    expect(line.cost).toBe(8);
    expect(line.daysToSell).toBe(9);
    expect(line.fees).toBe(10); // Poshmark 20%
    expect(line.feesEstimated).toBe(true);
    expect(line.profit).toBe(32);
    expect(line.brand).toBe("Lululemon");
    expect(line.category).toBe("Bottoms");
  });

  it("splits an order's real fees and shipping across a bundle by price", () => {
    const lines = saleLines(
      [
        order({
          fees: 12,
          shippingCost: 6,
          items: [
            { name: "A", price: 30, cost: 5 },
            { name: "B", price: 10, cost: 1 },
          ],
        }),
      ],
      [],
    );
    expect(lines.map((l) => l.fees)).toEqual([9, 3]);
    expect(lines.map((l) => l.shipping)).toEqual([4.5, 1.5]);
    expect(lines[0].feesEstimated).toBe(false);
  });

  it("leaves out cancelled orders", () => {
    expect(saleLines([order({ shipment: { status: "cancelled", updatedAt: "" } })], [])).toHaveLength(0);
  });
});

describe("estimateFees", () => {
  it("uses Poshmark's flat fee under $15", () => {
    expect(estimateFees("Poshmark", 10)).toBe(2.95);
    expect(estimateFees("Vinted", 40)).toBe(0);
  });
});

describe("metrics", () => {
  it("counts sell-through against what was still listed at the end", () => {
    const lines = saleLines([order({})], [inv({})]);
    const m = metrics(lines, 3);
    expect(m.sellThrough).toBe(0.25);
    expect(m.roi).toBe(4); // $32 profit on $8 cost
    expect(m.missingCost).toBe(0);
  });

  it("flags sales with no cost", () => {
    expect(metrics(saleLines([order({})], []), null).missingCost).toBe(1);
  });
});

describe("ranges and series", () => {
  it("compares with the same number of days just before", () => {
    const r = presetRange("30d", "2026-10-28");
    expect(r).toEqual({ start: "2026-09-29", end: "2026-10-28" });
    expect(previousRange(r)).toEqual({ start: "2026-08-30", end: "2026-09-28" });
  });

  it("buckets by day for short ranges and by month for long ones", () => {
    const lines = saleLines([order({})], [inv({})]);
    const days = series(lines, { start: "2026-10-01", end: "2026-10-28" });
    expect(days).toHaveLength(28);
    expect(days.find((p) => p.start === "2026-10-10")!.units).toBe(1);
    const months = series(lines, presetRange("12m", "2026-10-28"));
    expect(months.length).toBeGreaterThanOrEqual(12);
    expect(months.reduce((a, p) => a + p.units, 0)).toBe(1);
  });
});

describe("inventory", () => {
  it("knows what was listed on a given day", () => {
    const items = [inv({}), inv({ id: "i2", sku: "X-2", listedAt: "2026-06-01" }), inv({ id: "i3", sku: "X-3", status: "draft", listedAt: undefined })];
    const sold = soldDates(items, [order({})]);
    expect(activeOn(items, sold, "2026-10-05").map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(activeOn(items, sold, "2026-10-20").map((i) => i.id)).toEqual(["i2"]);
  });

  it("suggests markdowns for old listings, never below cost plus a margin", () => {
    const { buckets, stale } = aging([inv({ listedAt: "2026-06-01", cost: 40, listPrice: 50 })], "2026-10-28");
    expect(buckets[3].count).toBe(1);
    expect(stale[0].suggestedPrice).toBeNull(); // 20% off would be $40, under 1.25x the $40 cost
    const { stale: s2 } = aging([inv({ listedAt: "2026-06-01" })], "2026-10-28");
    expect(s2[0].suggestedPrice).toBe(48);
  });
});

describe("breakdown and goals", () => {
  it("groups by marketplace with listings counted per group", () => {
    const rows = breakdown(saleLines([order({}), order({ id: "o2", platform: "Mercari" })], [inv({})]), (l) => l.platform, {
      items: [inv({ id: "i9", platforms: ["Mercari", "eBay"] })],
      keyOf: (i) => i.platforms,
    });
    expect(rows.map((r) => r.key).sort()).toEqual(["Mercari", "Poshmark", "eBay"]);
    expect(rows.find((r) => r.key === "eBay")!.active).toBe(1);
  });

  it("projects the month from the pace so far", () => {
    const pace = goalPace(saleLines([order({ date: "2026-10-05" })], [inv({})]), "2026-10-10", 100);
    expect(pace.soFar).toBe(32);
    expect(Math.round(pace.projected)).toBe(99);
    expect(pace.onTrack).toBe(false);
  });
});

describe("sample history", () => {
  it("is the same every time and looks like a real shop", () => {
    const a = sampleHistory("2026-10-28");
    const b = sampleHistory("2026-10-28");
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.orders.length).toBeGreaterThan(300);
    const m = metrics(saleLines(a.orders, a.inventory), null);
    expect(m.margin!).toBeGreaterThan(0.4);
    expect(m.missingCost).toBe(0);
  });
});
