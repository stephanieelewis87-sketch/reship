import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPrintJob } from "./printJob";
import type { Order } from "./types";

async function fakeLabel(pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([288, 432]);
  return doc.save();
}

const order = (id: string, sku?: string): Order => ({
  id,
  platform: "Poshmark",
  orderId: `PM-${id}`,
  buyer: "jessica_m",
  items: [{ name: "Levi’s 501 Jeans — W28", sku, price: 32 }],
  date: "2026-10-24",
  status: "pending",
  carrier: "USPS Priority",
  shipTo: { name: "Jess M", street1: "1 Elm St", city: "Portland", state: "OR", zip: "97201", country: "US" },
  source: "manual",
});

const settings = { labelFormat: "4x6" as const, shipFrom: null };

describe("print job", () => {
  it("puts each label first, then its packing slip", async () => {
    const labels = new Map([
      ["a", await fakeLabel(1)],
      ["b", await fakeLabel(2)],
    ]);
    const res = await buildPrintJob({ orders: [order("a", "LV-1"), order("b")], labels, skuOnLabel: true, packingSlip: true, settings });
    expect(res.pageCount).toBe(1 + 1 + 2 + 1);
    expect(res.printedOrderIds).toEqual(["a", "b"]);
    const out = await PDFDocument.load(res.pdf);
    expect(out.getPage(1).getSize()).toEqual({ width: 288, height: 432 });
  });

  it("reports orders without a label or with a broken file, and still prints their slips", async () => {
    const labels = new Map([["bad", new TextEncoder().encode("not a pdf")]]);
    const res = await buildPrintJob({ orders: [order("none"), order("bad")], labels, skuOnLabel: false, packingSlip: true, settings });
    expect(res.missingLabelIds).toEqual(["none"]);
    expect(res.unreadableLabelIds).toEqual(["bad"]);
    expect(res.printedOrderIds).toEqual([]);
    expect(res.pageCount).toBe(2);
  });

  it("prints labels only when slips are off", async () => {
    const res = await buildPrintJob({
      orders: [order("a")],
      labels: new Map([["a", await fakeLabel(1)]]),
      skuOnLabel: false,
      packingSlip: false,
      settings: { labelFormat: "letter", shipFrom: null },
    });
    expect(res.pageCount).toBe(1);
  });
});
