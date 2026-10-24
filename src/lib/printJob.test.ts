import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { buildPrintJob, stampSku } from "./printJob";
import type { Order } from "./types";

async function fakeLabel(pages = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([288, 432]);
  return doc.save();
}

const order = (id: string, sku?: string, platform: Order["platform"] = "Mercari"): Order => ({
  id,
  platform,
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

  it("skips Reship's slip when a Poshmark label already includes Poshmark's", async () => {
    const labels = new Map([
      ["p2", await fakeLabel(2)],
      ["p1", await fakeLabel(1)],
    ]);
    const res = await buildPrintJob({
      orders: [order("p2", undefined, "Poshmark"), order("p1", undefined, "Poshmark")],
      labels,
      skuOnLabel: false,
      packingSlip: true,
      settings,
    });
    expect(res.pageCount).toBe(2 + 1 + 1);
  });

  it("stamps the SKU inside labels whose page doesn't start at (0, 0)", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = { getCropBox: () => ({ x: 160, y: 322, width: 292, height: 436 }), drawRectangle: vi.fn(), drawText: vi.fn() };
    stampSku(page as unknown as PDFPage, font, ["N-104-C"]);
    expect(page.drawRectangle.mock.calls[0][0]).toMatchObject({ x: 166, y: 326 });
    expect(page.drawText.mock.calls[0]).toEqual(["SKU: N-104-C", expect.objectContaining({ x: 170, y: 329 })]);
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
