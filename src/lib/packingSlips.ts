import type { Address, Order, Settings } from "./types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const addressHtml = (a?: Address | null) =>
  a
    ? [a.name, a.street1, a.street2, `${a.city}, ${a.state} ${a.zip}`, a.country]
        .filter(Boolean)
        .map((l) => esc(l!))
        .join("<br>")
    : "<em>No address yet</em>";

// Opens a print dialog with one packing slip per order, sized to the label format from Settings.
export function printPackingSlips(orders: Order[], settings: Settings, showSku: boolean) {
  const page = settings.labelFormat === "4x6" ? "4in 6in" : settings.labelFormat === "a4" ? "A4" : "letter";
  const slips = orders
    .map(
      (o) => `
    <section class="slip">
      <header>
        <div><strong>${esc(o.platform)}</strong> · ${esc(o.orderId)}</div>
        <div>${esc(o.date)}</div>
      </header>
      <div class="cols">
        <div><h3>Ship to</h3><p>${addressHtml(o.shipTo)}</p></div>
        <div><h3>From</h3><p>${addressHtml(settings.shipFrom)}</p></div>
      </div>
      <table>
        <thead><tr><th>Item</th>${showSku ? "<th>SKU</th>" : ""}<th class="r">Price</th></tr></thead>
        <tbody>
          ${o.items
            .map(
              (i) =>
                `<tr><td>${esc(i.name)}</td>${showSku ? `<td class="mono">${esc(i.sku ?? "")}</td>` : ""}<td class="r">${
                  i.price !== undefined ? `$${i.price.toFixed(2)}` : ""
                }</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <footer>Thank you for your order, @${esc(o.buyer)}!</footer>
    </section>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Packing slips</title>
  <style>
    @page { size: ${page}; margin: 0.3in; }
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }
    .slip { page-break-after: always; padding: 4px; }
    .slip:last-child { page-break-after: auto; }
    header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    .cols { display: flex; gap: 16px; margin-bottom: 12px; }
    .cols > div { flex: 1; }
    h3 { font-size: 9pt; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 4px; color: #555; }
    p { margin: 0; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 4px 2px; border-bottom: 1px solid #ddd; vertical-align: top; }
    th { font-size: 9pt; color: #555; }
    .r { text-align: right; }
    .mono { font-family: ui-monospace, Menlo, monospace; font-size: 9.5pt; }
    footer { margin-top: 14px; font-size: 10pt; color: #444; }
  </style></head><body>${slips}<script>window.onload = () => { window.print(); };</script></body></html>`;

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
