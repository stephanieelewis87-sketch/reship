import type { InventoryItem, SkuFormat } from "./types";
import { DEFAULT_SETTINGS } from "./types";

// Automatic SKUs: PREFIX-00001, counting up. The highest number ever used for each prefix is kept
// in settings (counters), so a deleted item's SKU is never handed to a new one.

export const cleanPrefix = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const formatSku = (f: Pick<SkuFormat, "prefix" | "digits">, n: number) => `${cleanPrefix(f.prefix) || "RS"}-${String(n).padStart(f.digits, "0")}`;

// The number in a SKU made with this prefix, or null for any other SKU.
export function skuNumber(sku: string, prefix: string): number | null {
  const m = sku.trim().toUpperCase().match(/^([A-Z0-9]+)-(\d+)$/);
  return m && m[1] === cleanPrefix(prefix) ? Number(m[2]) : null;
}

export const highestSkuNumber = (inventory: InventoryItem[], f: SkuFormat) =>
  Math.max(f.counters?.[cleanPrefix(f.prefix)] ?? 0, ...inventory.map((i) => skuNumber(i.sku, f.prefix) ?? 0));

export const nextSku = (inventory: InventoryItem[], f: SkuFormat = DEFAULT_SETTINGS.skuFormat) => formatSku(f, highestSkuNumber(inventory, f) + 1);

// ---- Code 128 barcodes (code set B: letters, digits and punctuation) ----

// Bar and space widths for each Code 128 symbol, 0–106 (106 is the stop symbol).
const PATTERNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");
const START_B = 104;
const STOP = 106;

export const canEncode = (text: string) => text.length > 0 && [...text].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);

// The widths, in modules, of the bars and spaces that draw `text`, starting with a bar.
export function code128(text: string): number[] {
  if (!canEncode(text)) throw new Error(`Can't make a barcode for "${text}". Use letters, numbers and dashes.`);
  const values = [...text].map((c) => c.charCodeAt(0) - 32);
  const check = (START_B + values.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;
  return [START_B, ...values, check, STOP].flatMap((v) => [...PATTERNS[v]].map(Number));
}

// Bars as [x, width] in modules, for drawing.
export function barRects(text: string): { bars: [number, number][]; modules: number } {
  const widths = code128(text);
  const bars: [number, number][] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push([x, w]);
    x += w;
  });
  return { bars, modules: x };
}

// ---- Printable SKU labels ----

export type SkuLabelSize = "roll" | "sheet";
export const SKU_LABEL_SIZES: { key: SkuLabelSize; label: string }[] = [
  { key: "roll", label: '2.25 x 1.25" roll (Rollo, Dymo, Zebra)' },
  { key: "sheet", label: 'Letter sheet, 30 per page (Avery 5160)' },
];

const IN = 72;

// One label per item, or one per unit in stock.
export function labelsFor(items: InventoryItem[], perUnit: boolean): InventoryItem[] {
  return items.filter((i) => canEncode(i.sku.trim())).flatMap((i) => Array.from({ length: perUnit ? Math.max(1, i.quantity ?? 1) : 1 }, () => i));
}

export async function skuLabelsPdf(items: InventoryItem[], size: SkuLabelSize): Promise<Uint8Array> {
  // Loaded on first use so the PDF library isn't part of the app's first download.
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  // Fits text to a width by trimming it.
  const fit = (text: string, f = font, pt = 7, width = 100) => {
    const t = text.replace(/[^\x20-\x7E]/g, "");
    if (f.widthOfTextAtSize(t, pt) <= width) return t;
    let cut = t;
    while (cut && f.widthOfTextAtSize(`${cut}...`, pt) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  };

  const draw = (page: ReturnType<typeof pdf.addPage>, item: InventoryItem, x: number, y: number, w: number, h: number) => {
    const pad = 6;
    const sku = item.sku.trim();
    const { bars, modules } = barRects(sku);
    const quiet = 10;
    const unit = Math.min(1.6, (w - pad * 2) / (modules + quiet * 2));
    const barW = unit * modules;
    const barH = h * 0.42;
    const bx = x + (w - barW) / 2;
    const by = y + h - pad - barH;
    bars.forEach(([bxm, bw]) => page.drawRectangle({ x: bx + bxm * unit, y: by, width: bw * unit, height: barH, color: black }));
    const skuPt = h > 80 ? 11 : 9;
    page.drawText(sku, { x: x + (w - bold.widthOfTextAtSize(sku, skuPt)) / 2, y: by - skuPt - 2, size: skuPt, font: bold });
    const line2 = [item.size && `Size ${item.size}`, item.listPrice != null && `$${item.listPrice}`, item.location && `Loc ${item.location}`].filter(Boolean).join("  ·  ");
    const title = fit(item.title || "", font, 7, w - pad * 2);
    page.drawText(title, { x: x + (w - font.widthOfTextAtSize(title, 7)) / 2, y: by - skuPt - 11, size: 7, font });
    if (line2) {
      const l2 = fit(line2, font, 7, w - pad * 2);
      page.drawText(l2, { x: x + (w - font.widthOfTextAtSize(l2, 7)) / 2, y: by - skuPt - 19, size: 7, font });
    }
  };

  if (size === "roll") {
    const w = 2.25 * IN;
    const h = 1.25 * IN;
    items.forEach((item) => draw(pdf.addPage([w, h]), item, 0, 0, w, h));
  } else {
    // Avery 5160: 3 across, 10 down, 2.625 x 1 in.
    const w = 2.625 * IN;
    const h = 1 * IN;
    for (let start = 0; start < items.length; start += 30) {
      const page = pdf.addPage([8.5 * IN, 11 * IN]);
      items.slice(start, start + 30).forEach((item, n) => {
        const col = n % 3;
        const row = Math.floor(n / 3);
        draw(page, item, 0.1875 * IN + col * 2.75 * IN, 11 * IN - 0.5 * IN - (row + 1) * h, w, h);
      });
    }
  }
  return pdf.save();
}
