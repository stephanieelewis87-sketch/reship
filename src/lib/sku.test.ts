import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { code128, formatSku, highestSkuNumber, labelsFor, nextSku, skuLabelsPdf, skuNumber } from "./sku";
import type { InventoryItem, SkuFormat } from "./types";

const item = (sku: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({ id: sku, sku, title: `Item ${sku}`, status: "draft", listings: [], ...extra });
const fmt = (prefix: string, digits = 5, counters: Record<string, number> = {}): SkuFormat => ({ prefix, digits, counters });

describe("automatic SKUs", () => {
  it("counts up from the highest SKU with the prefix", () => {
    expect(nextSku([item("BB-00007"), item("BB-00002"), item("XX-00900")], fmt("BB"))).toBe("BB-00008");
    expect(nextSku([], fmt("BB"))).toBe("BB-00001");
  });

  it("never reuses a number, even after the item is deleted", () => {
    expect(nextSku([item("BB-00002")], fmt("BB", 5, { BB: 41 }))).toBe("BB-00042");
  });

  it("keeps each prefix's count apart", () => {
    expect(highestSkuNumber([item("RS-1004")], fmt("BB", 5, { RS: 1500 }))).toBe(0);
  });

  it("reads numbers whatever the padding, and cleans the prefix", () => {
    expect(skuNumber("bb-0012", "BB")).toBe(12);
    expect(skuNumber("BBX-0012", "BB")).toBeNull();
    expect(formatSku({ prefix: "b-b!", digits: 4 }, 3)).toBe("BB-0003");
  });
});

describe("Code 128 barcodes", () => {
  it("encodes start B, the data, a check symbol and stop", () => {
    // "A": start B (104) + A (33) → check (104 + 33) % 103 = 34.
    const widths = code128("A");
    expect(widths.length).toBe(6 * 3 + 7);
    expect(widths.slice(0, 6).join("")).toBe("211214");
    expect(widths.slice(6, 12).join("")).toBe("111323");
    expect(widths.slice(12, 18).join("")).toBe("131123");
    expect(widths.slice(18).join("")).toBe("2331112");
  });

  it("is 11 modules a symbol plus 13 for stop", () => {
    expect(code128("BB-00001").reduce((a, b) => a + b, 0)).toBe(11 * 10 + 13);
  });

  it("refuses characters a barcode can't hold", () => {
    expect(() => code128("café")).toThrow();
  });
});

describe("SKU labels", () => {
  it("makes one per item, or one per unit in stock, and skips items without a SKU", () => {
    const items = [item("BB-00001", { quantity: 3 }), item("")];
    expect(labelsFor(items, false)).toHaveLength(1);
    expect(labelsFor(items, true)).toHaveLength(3);
  });

  it("makes a PDF for roll labels and for sheets", async () => {
    const items = Array.from({ length: 31 }, (_, n) => item(`BB-${String(n + 1).padStart(5, "0")}`, { title: "A very long title that will not fit on one small label at all", size: "M", listPrice: 25, location: "Bin 4" }));
    const roll = await skuLabelsPdf(items.slice(0, 2), "roll");
    const sheet = await skuLabelsPdf(items, "sheet");
    expect(new TextDecoder().decode(roll.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(sheet)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(roll)).getPageCount()).toBe(2);
  });
});
