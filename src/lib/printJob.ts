import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
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
  // Orders with a drop-off QR code get that instead of their label (the rest still get labels).
  qrCodes?: boolean;
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

// Mercari's label download is a letter page with the 4x6 label turned sideways in its top half
// (inside the dashed cut line). On a 4x6 label printer, that part is cut out and turned upright.
const MERCARI_LETTER_LABEL = { left: 54, bottom: 425, right: 558, top: 764 };
const isLetterPage = (page: PDFPage) => {
  const { width, height } = page.getSize();
  return Math.abs(width - 612) < 2 && Math.abs(height - 792) < 2;
};

async function addUprightLabel(doc: PDFDocument, src: PDFPage): Promise<PDFPage> {
  const box = MERCARI_LETTER_LABEL;
  const embedded = await doc.embedPage(src, box);
  const [pageW, pageH] = PAGE_SIZES["4x6"];
  const w = box.right - box.left;
  const h = box.top - box.bottom;
  // Turned a quarter-turn counterclockwise, the label is h wide and w tall.
  const scale = Math.min(pageW / h, pageH / w);
  const page = doc.addPage([pageW, pageH]);
  const x = (pageW - h * scale) / 2 + h * scale;
  const y = (pageH - w * scale) / 2;
  page.drawPage(embedded, { x, y, width: w * scale, height: h * scale, rotate: degrees(90) });
  return page;
}

const QR_PER_SHEET = { cols: 2, rows: 3 };

const dataUrlBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

// One drop-off QR code with what's needed to match it to its package. On 4x6 paper each code gets
// its own label; on letter or A4 they're laid out six to a sheet.
async function embedQrCode(doc: PDFDocument, qr: string): Promise<PDFImage | null> {
  try {
    return qr.startsWith("data:image/png") ? await doc.embedPng(dataUrlBytes(qr)) : await doc.embedJpg(dataUrlBytes(qr));
  } catch {
    return null;
  }
}

// Cuts text to fit one line, since the standard fonts don't wrap on their own.
const fit = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
};

function drawQrCodes(doc: PDFDocument, codes: { order: Order; image: PDFImage }[], input: PrintJobInput, font: PDFFont, bold: PDFFont) {
  const [pageW, pageH] = PAGE_SIZES[input.settings.labelFormat];
  const perPage = input.settings.labelFormat === "4x6" ? { cols: 1, rows: 1 } : QR_PER_SHEET;
  const margin = input.settings.labelFormat === "4x6" ? 12 : 36;
  const cellW = (pageW - margin * 2) / perPage.cols;
  const cellH = (pageH - margin * 2) / perPage.rows;
  let page: PDFPage | undefined;
  for (const [i, { order, image }] of codes.entries()) {
    const slot = i % (perPage.cols * perPage.rows);
    if (slot === 0) page = doc.addPage([pageW, pageH]);
    const x = margin + (slot % perPage.cols) * cellW;
    const top = pageH - margin - Math.floor(slot / perPage.cols) * cellH;
    const textSize = perPage.cols === 1 ? 11 : 9;
    const textLines = 4;
    const size = Math.min(cellW - 16, cellH - 16 - textLines * (textSize + 4));
    page!.drawRectangle({ x: x + 4, y: top - cellH + 4, width: cellW - 8, height: cellH - 8, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.75 });
    page!.drawImage(image, { x: x + (cellW - size) / 2, y: top - 8 - size, width: size, height: size });
    const skus = order.items.map((it) => it.sku).filter(Boolean).join(", ");
    const lines: [string, PDFFont][] = [
      [`${order.platform} - ${order.orderId}`, bold],
      [order.items.length > 1 ? `${order.items[0].name} + ${order.items.length - 1} more` : (order.items[0]?.name ?? ""), font],
      [skus ? `SKU: ${skus}` : "", bold],
      [`${order.carrier}${order.buyer ? ` - @${order.buyer}` : ""}`, font],
    ];
    let y = top - 8 - size - textSize - 6;
    for (const [text, f] of lines) {
      if (text) page!.drawText(fit(text, f, textSize, cellW - 24), { x: x + 12, y, size: textSize, font: f });
      y -= textSize + 4;
    }
  }
}

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

  // QR codes go first, together, so a sheet of them isn't split up by labels. An order whose code
  // can't be read gets its label instead.
  const codes: { order: Order; image: PDFImage }[] = [];
  if (input.qrCodes) {
    for (const order of input.orders) {
      const image = order.label?.qrCode ? await embedQrCode(doc, order.label.qrCode) : null;
      if (image) codes.push({ order, image });
    }
  }
  if (codes.length) {
    drawQrCodes(doc, codes, input, font, bold);
    printedOrderIds.push(...codes.map((c) => c.order.id));
    if (input.packingSlip) codes.forEach((c) => drawSlip(doc, c.order, input, font, bold));
  }
  const asQr = new Set(printedOrderIds);

  for (const order of input.orders.filter((o) => !asQr.has(o.id))) {
    let hasOwnSlip = false;
    const raw = input.labels.get(order.id);
    if (!raw) missingLabelIds.push(order.id);
    else {
      try {
        const src = await PDFDocument.load(await toBytes(raw), { ignoreEncryption: true });
        let pages: PDFPage[];
        if (order.platform === "Mercari" && input.settings.labelFormat === "4x6" && src.getPageCount() === 1 && isLetterPage(src.getPage(0))) {
          pages = [await addUprightLabel(doc, src.getPage(0))];
        } else {
          pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p) => doc.addPage(p));
        }
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
