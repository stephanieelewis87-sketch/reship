import qrcode from "qrcode-generator";
import type { InventoryItem, SkuFormat } from "./types";
import { cleanPrefix, formatSku, highestSkuNumber } from "./sku";

// QR stickers. Each item sticker holds a link to its SKU, so it can be read by Hubby's own scanner
// or by any phone's camera app (which opens Hubby straight on that item). A blank sheet is a run of
// SKUs reserved ahead of time: scanning one that isn't on an item yet adds a new item with it.
// Bin stickers hold a link to the bin, so scanning one shows what's inside.

export type Scanned = { kind: "item"; code: string } | { kind: "bin"; bin: string };

const appBase = () => (typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`);

export const itemStickerLink = (sku: string, base = appBase()) => `${base}#/inventory?scan=${encodeURIComponent(sku.trim())}`;
export const binStickerLink = (bin: string, base = appBase()) => `${base}#/inventory?bin=${encodeURIComponent(bin.trim())}`;

// What a scan means: a sticker link (from any Hubby address), or a plain code from a barcode
// scanner, a printed SKU barcode or a typed SKU.
export function readScan(raw: string): Scanned | null {
  const text = raw.trim();
  if (!text) return null;
  const hash = text.indexOf("#/inventory?");
  if (hash >= 0) {
    const params = new URLSearchParams(text.slice(hash + "#/inventory?".length));
    const bin = params.get("bin")?.trim();
    if (bin) return { kind: "bin", bin };
    const code = params.get("scan")?.trim();
    if (code) return { kind: "item", code };
  }
  return { kind: "item", code: text };
}

// Reserves the next `count` SKUs for a blank sticker sheet. Returns the SKUs and the settings
// counter to save, so the same numbers are never handed out again.
export function reserveSkus(inventory: InventoryItem[], format: SkuFormat, count: number): { skus: string[]; skuFormat: SkuFormat } {
  const start = highestSkuNumber(inventory, format);
  const n = Math.max(0, Math.min(300, Math.floor(count)));
  const skus = Array.from({ length: n }, (_, i) => formatSku(format, start + i + 1));
  const key = cleanPrefix(format.prefix) || "RS";
  return { skus, skuFormat: { ...format, counters: { ...format.counters, [key]: start + n } } };
}

// The QR code's dark squares, row by row.
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

export interface Sticker {
  link: string; // what the QR code holds
  big: string; // printed large: the SKU or bin name
  small?: string; // a line under it: the item's title, or a hint
}

export const itemSticker = (item: Pick<InventoryItem, "sku" | "title" | "size">, base?: string): Sticker => ({
  link: itemStickerLink(item.sku, base),
  big: item.sku.trim(),
  small: [item.title, item.size && `Size ${item.size}`].filter(Boolean).join(" · ") || undefined,
});
export const blankSticker = (sku: string, base?: string): Sticker => ({ link: itemStickerLink(sku, base), big: sku, small: "Scan to add this item" });
export const binSticker = (bin: string, base?: string): Sticker => ({ link: binStickerLink(bin, base), big: bin.trim(), small: "Scan to see what's inside" });

export type StickerSize = "sheet" | "roll";
export const STICKER_SIZES: { key: StickerSize; label: string; perPage: number }[] = [
  { key: "sheet", label: 'Letter sheet, 30 per page (Avery 5160 or any 1 x 2.625" labels)', perPage: 30 },
  { key: "roll", label: '2.25 x 1.25" roll (Rollo, Dymo, Zebra)', perPage: 1 },
];

const IN = 72;

export async function stickersPdf(stickers: Sticker[], size: StickerSize): Promise<Uint8Array> {
  // Loaded on first use so the PDF library isn't part of the app's first download.
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  type Page = ReturnType<typeof pdf.addPage>;

  const fit = (text: string, f: typeof font, pt: number, width: number) => {
    const t = text.replace(/[^\x20-\x7E]/g, "");
    if (f.widthOfTextAtSize(t, pt) <= width) return t;
    let cut = t;
    while (cut && f.widthOfTextAtSize(`${cut}...`, pt) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  };

  const drawQr = (page: Page, text: string, x: number, y: number, side: number) => {
    const m = qrMatrix(text);
    const cell = side / m.length;
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) page.drawRectangle({ x: x + c * cell, y: y + side - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: black });
      }),
    );
  };

  // A wide label: the QR code on the left, the words on the right.
  const drawWide = (page: Page, s: Sticker, x: number, y: number, w: number, h: number) => {
    const pad = 0.08 * IN;
    const side = h - pad * 2;
    drawQr(page, s.link, x + pad, y + pad, side);
    const tx = x + pad * 2 + side;
    const tw = w - (tx - x) - pad;
    const bigPt = h > 80 ? 14 : 12;
    page.drawText(fit(s.big, bold, bigPt, tw), { x: tx, y: y + h / 2 + 2, size: bigPt, font: bold });
    if (s.small) page.drawText(fit(s.small, font, 7, tw), { x: tx, y: y + h / 2 - 10, size: 7, font });
  };

  if (size === "roll") {
    const w = 2.25 * IN;
    const h = 1.25 * IN;
    stickers.forEach((s) => drawWide(pdf.addPage([w, h]), s, 0, 0, w, h));
  } else {
    // Avery 5160: 3 across, 10 down, 2.625 x 1 in.
    const w = 2.625 * IN;
    const h = 1 * IN;
    for (let start = 0; start < stickers.length; start += 30) {
      const page = pdf.addPage([8.5 * IN, 11 * IN]);
      stickers.slice(start, start + 30).forEach((s, n) => {
        const col = n % 3;
        const row = Math.floor(n / 3);
        drawWide(page, s, 0.1875 * IN + col * 2.75 * IN, 11 * IN - 0.5 * IN - (row + 1) * h, w, h);
      });
    }
  }
  return pdf.save();
}

// Marks one sold: takes one off the count, and marks the item sold when it was the last one.
export function markOneSold(item: InventoryItem, today: string): InventoryItem {
  const qty = item.quantity ?? 1;
  const updatedAt = new Date().toISOString();
  if (qty > 1) return { ...item, quantity: qty - 1, updatedAt };
  return { ...item, status: "sold", soldAt: item.soldAt ?? today, updatedAt };
}

// Bins in use, with how many unsold items are in each, busiest first.
export function binsOf(inventory: InventoryItem[]): { bin: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of inventory) {
    const bin = i.location?.trim();
    if (!bin || i.status === "sold") continue;
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  return [...counts].map(([bin, count]) => ({ bin, count })).sort((a, b) => b.count - a.count || a.bin.localeCompare(b.bin, undefined, { numeric: true }));
}
