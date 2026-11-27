import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import { binSticker, binsOf, blankSticker, customSkuRange, itemStickerLink, markOneSold, qrMatrix, readScan, reserveSkus, stickersPdf } from "./stickers";
import type { InventoryItem, SkuFormat } from "./types";

const item = (sku: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({ id: sku, sku, title: `Item ${sku}`, status: "draft", listings: [], ...extra });
const fmt = (prefix: string, counters: Record<string, number> = {}): SkuFormat => ({ prefix, digits: 5, counters });
const BASE = "https://hubby.example/";

describe("reading a scan", () => {
  it("reads an item sticker link from any address", () => {
    expect(readScan(itemStickerLink("BB-00042", BASE))).toEqual({ kind: "item", code: "BB-00042" });
    expect(readScan("https://preview.example/?demo#/inventory?scan=BB-00001")).toEqual({ kind: "item", code: "BB-00001" });
  });
  it("reads a bin sticker", () => {
    expect(readScan(binSticker("Bin 4", BASE).link)).toEqual({ kind: "bin", bin: "Bin 4" });
  });
  it("treats anything else as a typed or barcode code", () => {
    expect(readScan("  BB-00007 ")).toEqual({ kind: "item", code: "BB-00007" });
    expect(readScan("   ")).toBeNull();
  });
});

describe("blank sticker sheets", () => {
  it("saves the next SKUs so they're never handed out again", () => {
    const { skus, skuFormat } = reserveSkus([item("BB-00003")], fmt("BB", { BB: 5 }), 3);
    expect(skus).toEqual(["BB-00006", "BB-00007", "BB-00008"]);
    expect(skuFormat.counters.BB).toBe(8);
    expect(reserveSkus([], skuFormat, 1).skus).toEqual(["BB-00009"]);
  });
});

describe("QR codes", () => {
  it("round-trips through a QR reader", () => {
    const link = blankSticker("BB-00042", BASE).link;
    const m = qrMatrix(link);
    const cell = 4;
    const quiet = 4;
    const size = (m.length + quiet * 2) * cell;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (!dark) return;
        for (let y = 0; y < cell; y++)
          for (let x = 0; x < cell; x++) {
            const i = (((r + quiet) * cell + y) * size + (c + quiet) * cell + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
      }),
    );
    expect(jsQR(data, size, size)?.data).toBe(link);
  });

  it("makes a sticker PDF, 30 to a Letter page", async () => {
    const stickers = Array.from({ length: 31 }, (_, i) => blankSticker(`BB-${String(i + 1).padStart(5, "0")}`, BASE));
    const pdf = await PDFDocument.load(await stickersPdf(stickers, "sheet"));
    expect(pdf.getPageCount()).toBe(2);
    const roll = await PDFDocument.load(await stickersPdf(stickers.slice(0, 2), "roll"));
    expect(roll.getPageCount()).toBe(2);
  });
});

describe("selling and bins", () => {
  it("marks the last one sold, or takes one off the count", () => {
    expect(markOneSold(item("A"), "2026-11-27")).toMatchObject({ status: "sold", soldAt: "2026-11-27" });
    expect(markOneSold(item("A", { quantity: 3, status: "listed" }), "2026-11-27")).toMatchObject({ status: "listed", quantity: 2 });
  });
  it("counts unsold items in each bin", () => {
    const inv = [item("A", { location: "Bin 2" }), item("B", { location: "Bin 10" }), item("C", { location: "Bin 10" }), item("D", { location: "Bin 2", status: "sold" })];
    expect(binsOf(inv)).toEqual([
      { bin: "Bin 10", count: 2 },
      { bin: "Bin 2", count: 1 },
    ]);
  });
});

describe("choosing your own SKU range", () => {
  it("makes the range, keeps leading zeros, and moves the counter past it", () => {
    const r = customSkuRange([], fmt("RS"), "abc", "345", "374");
    expect(r.skus).toHaveLength(30);
    expect(r.skus[0]).toBe("ABC-345");
    expect(r.skus[29]).toBe("ABC-374");
    expect(r.skuFormat.counters.ABC).toBe(374);
    expect(customSkuRange([], fmt("RS"), "ABC", "0098", "0101").skus).toEqual(["ABC-0098", "ABC-0099", "ABC-0100", "ABC-0101"]);
  });
  it("flags SKUs already on an item and bad ranges", () => {
    expect(customSkuRange([item("ABC-350")], fmt("RS"), "ABC", "345", "374").taken).toEqual(["ABC-350"]);
    expect(customSkuRange([], fmt("RS"), "ABC", "374", "345").error).toBeTruthy();
    expect(customSkuRange([], fmt("RS"), "", "1", "2").error).toBeTruthy();
    expect(customSkuRange([], fmt("RS"), "ABC", "1", "500").error).toBeTruthy();
  });
  it("never lowers a counter", () => {
    expect(customSkuRange([], fmt("ABC", { ABC: 900 }), "ABC", "1", "5").skuFormat.counters.ABC).toBe(900);
  });
});
