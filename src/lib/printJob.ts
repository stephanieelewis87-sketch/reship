import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Address, LabelFormat, Order, Settings } from "./types";

const PAGE_SIZES: Record<LabelFormat, [number, number]> = {
  "4x6": [288, 432],
  letter: [612, 792],
  a4: [595.28, 841.89],
};

export interface PrintJobInput {
  orders: Order[];
  labels: Map<string, Blob | ArrayBuffer | Uint8Array>;
  skuOnLabel: boolean;
  packingSlip: boolean;
  settings: Pick<Settings, "labelFormat" | "shipFrom">;
}

export interface PrintJobResult {
  pdf: Uint8Array;
  pageCount: number;
  printedOrderIds: string[]; // orders whose marketplace label made it into the file
  missingLabelIds: string[];
  unreadableLabelIds: string[];
}

const toBytes = async (b: Blob | ArrayBuffer | Uint8Array) =>
  b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(await b.arrayBuffer());

// The standard PDF fonts only cover basic Latin, so swap anything else for a close plain character.
const safe = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");

// Stamps the SKUs in the label's bottom-left corner. Marketplace labels often place the visible
// page away from (0, 0) (Poshmark's starts at 160, 322), so positions follow the crop box.
export function stampSku(page: PDFPage, font: PDFFont, skus: string[]) {
  const text = safe(`SKU: ${skus.join(", ")}`);
  const { x, y, width } = page.getCropBox();
  const size = Math.max(7, Math.min(10, width / 40));
  const textWidth = Math.min(font.widthOfTextAtSize(text, size), width - 16);
  page.drawRectangle({ x: x + 6, y: y + 4, width: textWidth + 8, height: size + 6, color: rgb(1, 1, 1) });
  page.drawText(text, { x: x + 10, y: y + 7, size, font, color: rgb(0, 0, 0), maxWidth: width - 20 });
}

// Poshmark's label download already ends with its own packing slip page, so Reship's would be a
// second one for the same order.
export const labelIncludesSlip = (order: Pick<Order, "platform">, labelPages: number) => order.platform === "Poshmark" && labelPages > 1;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const addressLines = (a?: Address | null) =>
  a ? [a.name, a.street1, a.street2, `${a.city}, ${a.state} ${a.zip}`, a.country].filter((l): l is string => !!l && !!l.trim()) : ["No address on file"];

function drawSlip(doc: PDFDocument, order: Order, input: PrintJobInput, font: PDFFont, bold: PDFFont) {
  const [w, h] = PAGE_SIZES[input.settings.labelFormat];
  const page = doc.addPage([w, h]);
  const m = w < 400 ? 18 : 40;
  const base = w < 400 ? 9 : 11;
  let y = h - m;
  const line = (text: string, opts: { size?: number; f?: PDFFont; x?: number; maxWidth?: number } = {}) => {
    const size = opts.size ?? base;
    for (const l of wrap(text, opts.f ?? font, size, opts.maxWidth ?? w - 2 * m)) {
      page.drawText(l, { x: opts.x ?? m, y: y - size, size, font: opts.f ?? font, color: rgb(0.07, 0.07, 0.07) });
      y -= size * 1.35;
    }
  };

  line("Packing slip", { size: base + 5, f: bold });
  line(`${order.platform} order ${order.orderId}  -  ${order.date}`, { size: base - 0.5 });
  y -= 6;
  page.drawLine({ start: { x: m, y }, end: { x: w - m, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
  y -= 10;

  line("SHIP TO", { size: base - 2, f: bold });
  addressLines(order.shipTo).forEach((l) => line(l));
  y -= 6;
  if (input.settings.shipFrom) {
    line("FROM", { size: base - 2, f: bold });
    addressLines(input.settings.shipFrom).forEach((l) => line(l));
    y -= 6;
  }

  line("ITEMS", { size: base - 2, f: bold });
  for (const item of order.items) {
    const price = item.price !== undefined ? `$${item.price.toFixed(2)}` : "";
    const priceWidth = price ? font.widthOfTextAtSize(price, base) : 0;
    const top = y;
    line(`${item.name}${item.sku ? `  (SKU ${item.sku})` : ""}`, { maxWidth: w - 2 * m - priceWidth - 10 });
    if (price) page.drawText(price, { x: w - m - priceWidth, y: top - base, size: base, font });
    if (y < m + 40) break;
  }
  y -= 10;
  line(`Thank you for your order${order.buyer ? `, @${order.buyer}` : ""}!`, { size: base - 1 });
}

// Builds one PDF to print: each order's marketplace label (optionally stamped with its SKUs),
// followed by its packing slip when asked for (unless the label already brings the marketplace's own).
export async function buildPrintJob(input: PrintJobInput): Promise<PrintJobResult> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const printedOrderIds: string[] = [];
  const missingLabelIds: string[] = [];
  const unreadableLabelIds: string[] = [];

  for (const order of input.orders) {
    let hasOwnSlip = false;
    const raw = input.labels.get(order.id);
    if (!raw) missingLabelIds.push(order.id);
    else {
      try {
        const src = await PDFDocument.load(await toBytes(raw), { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
        const skus = order.items.map((i) => i.sku).filter((s): s is string => !!s);
        if (input.skuOnLabel && skus.length && pages[0]) stampSku(pages[0], font, skus);
        hasOwnSlip = labelIncludesSlip(order, pages.length);
        printedOrderIds.push(order.id);
      } catch {
        unreadableLabelIds.push(order.id);
      }
    }
    if (input.packingSlip && !hasOwnSlip) drawSlip(doc, order, input, font, bold);
  }

  return { pdf: await doc.save(), pageCount: doc.getPageCount(), printedOrderIds, missingLabelIds, unreadableLabelIds };
}
