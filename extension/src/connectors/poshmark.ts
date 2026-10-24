import type { ShipmentStatus } from "../../../src/lib/types";
import type { Connector, ImportedOrder, ShipmentUpdate } from "./types";

// Poshmark's web app loads a seller's sales from /vm-rest/users/<id>/orders/sales. Each sale
// carries the ship-to address and a shipping_label_download_url, which redirects (with the
// seller's session) to the prepaid label PDF that Poshmark already bought.
const ORIGIN = "https://poshmark.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 3;

interface Money {
  val?: string;
}

export interface PoshmarkSale {
  id: string;
  title?: string;
  display_status?: string;
  state?: string;
  inventory_booked_at?: string;
  bundle_size?: number;
  is_bundle?: boolean;
  picture_url?: string;
  size?: string;
  buyer?: { username?: string; display_handle?: string; full_name?: string };
  shipping_address?: { name?: string; street?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string };
  shipping_label_download_url?: string;
  shipping_method_info?: { shipping_carrier?: string; service_info?: { carrier_service_level?: string } };
  total_price_amount?: Money;
}

interface SalesPage {
  data?: { sales_summary?: PoshmarkSale[] };
  meta?: { next_max_id?: string };
}

// A sale still needs shipping while Poshmark shows it as "Sold" (it changes to Shipped,
// Delivered, Cancelled and so on afterwards) and has a label to download.
export function needsShipping(sale: PoshmarkSale): boolean {
  const status = (sale.display_status || sale.state || "").trim().toLowerCase();
  return status === "sold" && !!sale.shipping_label_download_url;
}

// Poshmark's order status as Reship tracks it, or null for states Reship doesn't follow.
export function shipmentStatus(sale: PoshmarkSale): ShipmentStatus | null {
  const status = (sale.display_status || sale.state || "").trim().toLowerCase();
  if (status === "sold") return "label_created";
  if (status === "shipped" || status.includes("transit")) return "in_transit";
  if (status === "delivered" || status.includes("complete")) return "delivered";
  if (status.includes("cancel")) return "cancelled";
  return null;
}

export function toImportedOrder(sale: PoshmarkSale): ImportedOrder {
  const price = Number.parseFloat(sale.total_price_amount?.val ?? "");
  const extra = (sale.bundle_size ?? 1) - 1;
  const name = [sale.title?.trim() || "Poshmark item", sale.size ? `(Size ${sale.size})` : "", extra > 0 ? `+ ${extra} more` : ""]
    .filter(Boolean)
    .join(" ");
  const method = sale.shipping_method_info;
  const carrier = [method?.shipping_carrier, method?.service_info?.carrier_service_level].filter(Boolean).join(" ") || "USPS";
  const a = sale.shipping_address;
  return {
    platform: "Poshmark",
    orderNumber: sale.id,
    buyer: sale.buyer?.username || sale.buyer?.display_handle || sale.shipping_address?.name || "",
    date: (sale.inventory_booked_at ?? new Date().toISOString()).slice(0, 10),
    items: [{ name, photo: sale.picture_url, price: Number.isFinite(price) ? price : undefined }],
    carrier,
    shipTo: a
      ? { name: a.name ?? "", street1: a.street ?? "", street2: a.street2 || undefined, city: a.city ?? "", state: a.state ?? "", zip: a.zip ?? "", country: a.country || "US" }
      : undefined,
    labelUrl: sale.shipping_label_download_url,
  };
}

// SKUs the seller set on the listings in an order, read from Poshmark's order page (its embedded
// page data, or the "SKU: ..." line it shows under each item).
export function findSkus(html: string): string[] {
  const fromData = [...html.matchAll(/"sku"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const fromText = [...html.matchAll(/SKU:\s*([^<\s][^<]*?)\s*</g)].map((m) => m[1]);
  return [...new Set((fromData.length ? fromData : fromText).map((s) => s.trim()).filter(Boolean))];
}

async function orderSkus(orderId: string): Promise<string[]> {
  try {
    const res = await fetch(`${ORIGIN}/order/sales/${orderId}`, { credentials: "include" });
    return res.ok ? findSkus(await res.text()) : [];
  } catch {
    return [];
  }
}

const USER_ID_PATTERNS = [
  /vm-rest\/users\/([0-9a-f]{24})\//,
  /"(?:user_id|userId|uid|lister_id)"\s*:\s*"([0-9a-f]{24})"/,
  /data-et-prop-lister_id="([0-9a-f]{24})"/,
];

export function findUserId(text: string): string | null {
  for (const pattern of USER_ID_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return null;
}

// The seller's Poshmark account id: from the "ui" cookie Poshmark sets at login, otherwise from
// the Seller Hub page. Returns null when the browser isn't logged in to Poshmark.
async function userId(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({ url: ORIGIN, name: "ui" });
    const uid = cookie && JSON.parse(decodeURIComponent(cookie.value)).uid;
    if (typeof uid === "string" && /^[0-9a-f]{24}$/.test(uid)) return uid;
  } catch {
    // Cookie missing or in another format; fall back to the page.
  }
  const res = await fetch(`${ORIGIN}/seller-hub/sales`, { credentials: "include" });
  if (!res.ok || /\/login/.test(res.url)) return null;
  return findUserId(await res.text());
}

async function salesPage(uid: string, maxId?: string): Promise<SalesPage> {
  const request = JSON.stringify({ filters: {}, count: PAGE_SIZE, ...(maxId ? { max_id: maxId } : {}) });
  const res = await fetch(`${ORIGIN}/vm-rest/users/${uid}/orders/sales?request=${encodeURIComponent(request)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Poshmark sales list returned ${res.status}`);
  return res.json();
}

// Describes what a label link answered, without any personal data, for the setup test.
export async function describeLabelResponse(url: string): Promise<string> {
  const pattern = (u: string) => {
    const x = new URL(u);
    return `${x.hostname}${x.pathname.replace(/[0-9a-f]{16,}/gi, ":id")}?${[...x.searchParams.keys()].join(",")}`;
  };
  try {
    const res = await fetch(url, { credentials: "include" });
    const type = res.headers.get("content-type") ?? "";
    let body = "";
    if (type.includes("json")) body = ` keys=${Object.keys(await res.json()).join(",")}`;
    else if (type.includes("html")) body = ` title=${(await res.text()).match(/<title>([^<]*)/)?.[1]?.trim() ?? ""}`;
    return `link=${pattern(url)} status=${res.status} type=${type} redirected=${res.redirected} final=${pattern(res.url)}${body}`;
  } catch (e) {
    return `link=${pattern(url)} error=${e instanceof Error ? e.message : e}`;
  }
}

const LABEL_FILE = /^https:\/\/labels-poshmark-production\.s3[.\w-]*\.amazonaws\.com\/.+\.pdf/;
const LABEL_WAIT_MS = 20_000;

// Poshmark's label link is a page that looks up the label and then downloads the PDF from
// Poshmark's label storage through a short-lived signed address. Reship opens that page in a
// background tab, catches the download as it starts, cancels it (so nothing lands in the
// seller's Downloads folder) and returns the signed address to fetch the PDF from.
function labelFileUrl(labelUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    let tabId: number | undefined;
    const finish = (url: string | null) => {
      clearTimeout(timer);
      chrome.downloads.onCreated.removeListener(onDownload);
      if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
      resolve(url);
    };
    const onDownload = (item: chrome.downloads.DownloadItem) => {
      const url = [item.finalUrl, item.url].find((u) => u && LABEL_FILE.test(u));
      if (!url) return;
      chrome.downloads.cancel(item.id).then(() => chrome.downloads.erase({ id: item.id })).catch(() => {});
      finish(url);
    };
    const timer = setTimeout(() => finish(null), LABEL_WAIT_MS);
    chrome.downloads.onCreated.addListener(onDownload);
    chrome.tabs.create({ url: labelUrl, active: false }).then(
      (tab) => (tabId = tab.id),
      () => finish(null),
    );
  });
}

export const poshmark: Connector = {
  platform: "Poshmark",
  loginUrl: `${ORIGIN}/login`,

  async isLoggedIn() {
    return (await userId()) !== null;
  },

  async listOrdersToShip() {
    const uid = await userId();
    if (!uid) return [];
    const orders: ImportedOrder[] = [];
    let maxId: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, meta } = await salesPage(uid, maxId);
      const toShip = (data?.sales_summary ?? []).filter(needsShipping);
      for (const sale of toShip) {
        const order = toImportedOrder(sale);
        const skus = await orderSkus(sale.id);
        if (skus.length) order.items[0].sku = skus.join(", ");
        orders.push(order);
      }
      maxId = meta?.next_max_id;
      // Sales come newest first, so a page with nothing left to ship means older pages are done.
      if (!maxId || toShip.length === 0) break;
    }
    return orders;
  },

  async listShipmentUpdates() {
    const uid = await userId();
    if (!uid) return [];
    const { data } = await salesPage(uid);
    const updates: ShipmentUpdate[] = [];
    for (const sale of data?.sales_summary ?? []) {
      const status = shipmentStatus(sale);
      if (status) updates.push({ orderNumber: sale.id, status });
    }
    return updates;
  },

  async downloadLabel(order) {
    if (!order.labelUrl) return null;
    const pdfUrl = await labelFileUrl(order.labelUrl);
    if (!pdfUrl) return null;
    const pdf = await fetch(pdfUrl);
    return pdf.ok ? pdf.blob() : null;
  },
};
