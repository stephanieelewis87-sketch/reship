import type { ShipmentStatus } from "../../../src/lib/types";
import type { Connector, ImportedOrder, ShipmentUpdate } from "./types";

// Vinted's website loads a seller's sales from its own JSON addresses: /api/v2/my_orders lists
// them and /api/v2/transactions/<id> has each one's buyer, item and shipment. Labels Vinted
// bought for the seller come from /api/v2/shipments/<id>/label_url. All of it uses the seller's
// own logged-in session in this browser.
const ORIGIN = "https://www.vinted.com";
const PER_PAGE = 20;
const MAX_PAGES = 3;

type Money = { amount?: string | number; currency_code?: string } | string | number | null | undefined;

export interface VintedOrderSummary {
  transaction_id?: number | string;
  id?: number | string;
  title?: string;
  price?: Money;
  status?: string;
  transaction_user_status?: string;
  date?: string;
  photo?: { url?: string; thumbnails?: { url?: string }[] } | null;
}

export interface VintedTransaction {
  id: number | string;
  status?: string | number;
  status_title?: string;
  buyer?: { login?: string; id?: number };
  item_id?: number | string;
  item_ids?: (number | string)[];
  item?: { id?: number | string; title?: string; price?: Money; photos?: { url?: string }[] };
  order?: { items?: { id?: number | string; title?: string; price?: Money; photos?: { url?: string }[] }[] };
  offer_price?: Money;
  updated_at?: string;
  created_at?: string;
  shipment?: {
    id?: number | string;
    status?: string | number;
    status_title?: string;
    tracking_code?: string;
    carrier_name?: string;
    carrier?: { name?: string } | string;
    label_url?: string;
    shipping_address?: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country_iso_code?: string };
  } | null;
}

export const money = (m: Money): number | undefined => {
  const raw = typeof m === "object" && m !== null ? m.amount : m;
  const n = Number.parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

// Vinted describes each sale with a sentence ("Send the item", "Item shipped", "Order completed").
const statusText = (t: VintedTransaction, summary?: VintedOrderSummary) =>
  [summary?.transaction_user_status, summary?.status, t.status_title, t.shipment?.status_title, typeof t.status === "string" ? t.status : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const DONE = /deliver|complet|received|cancel|refund|shipped|on (its|the) way|in transit/;
const TO_SHIP = /send|ship|drop off|label|post (it|the item)|package/;

export function needsShipping(t: VintedTransaction, summary?: VintedOrderSummary): boolean {
  const text = statusText(t, summary);
  return TO_SHIP.test(text) && !DONE.test(text);
}

export function shipmentStatus(t: VintedTransaction, summary?: VintedOrderSummary): ShipmentStatus | null {
  const text = statusText(t, summary);
  if (/cancel|refund/.test(text)) return "cancelled";
  if (/deliver|complet|received/.test(text)) return "delivered";
  if (/shipped|on (its|the) way|in transit/.test(text)) return "in_transit";
  if (TO_SHIP.test(text)) return "label_created";
  return null;
}

export function toImportedOrder(t: VintedTransaction, summary?: VintedOrderSummary): ImportedOrder {
  const lines = t.order?.items?.length ? t.order.items : t.item ? [t.item] : [];
  const items = lines.length
    ? lines.map((i) => ({ name: i.title || "Vinted item", photo: i.photos?.[0]?.url, price: money(i.price) }))
    : [{ name: summary?.title || "Vinted item", photo: summary?.photo?.url ?? summary?.photo?.thumbnails?.[0]?.url, price: money(summary?.price ?? t.offer_price) }];
  const listingIds = [...(t.item_ids ?? []), t.item_id, t.item?.id, ...(t.order?.items ?? []).map((i) => i.id)]
    .filter((id) => id != null)
    .map(String);
  const s = t.shipment;
  const carrier = (typeof s?.carrier === "string" ? s.carrier : s?.carrier?.name) || s?.carrier_name || "USPS";
  const a = s?.shipping_address;
  return {
    platform: "Vinted",
    orderNumber: String(t.id),
    buyer: t.buyer?.login ?? "",
    date: (summary?.date ?? t.created_at ?? new Date().toISOString()).slice(0, 10),
    items,
    carrier,
    tracking: s?.tracking_code || undefined,
    shipTo: a?.line1
      ? { name: a.name ?? "", street1: a.line1, street2: a.line2 || undefined, city: a.city ?? "", state: a.state ?? "", zip: a.postal_code ?? "", country: a.country_iso_code || "US" }
      : undefined,
    labelUrl: s?.id != null ? `${ORIGIN}/api/v2/shipments/${s.id}/label_url` : s?.label_url,
    listingIds: [...new Set(listingIds)],
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ORIGIN}${path}`, { credentials: "include", headers: { Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new LoggedOut();
  if (!res.ok) throw new Error(`Vinted answered ${res.status} for ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

class LoggedOut extends Error {}

// What the last read found, without buyer details, for the popup's Test Vinted button.
export let lastRead = { listed: 0, read: 0, statuses: [] as string[], keys: [] as string[] };

let cached: { at: number; sales: { t: VintedTransaction; summary: VintedOrderSummary }[] } | undefined;
const CACHE_MS = 2 * 60_000;

async function sales() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.sales;
  const summaries: VintedOrderSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await getJson<{ my_orders?: VintedOrderSummary[]; orders?: VintedOrderSummary[] }>(
      `/api/v2/my_orders?type=sold&status=in_progress&per_page=${PER_PAGE}&page=${page}`,
    );
    const batch = data.my_orders ?? data.orders ?? [];
    summaries.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  const result: { t: VintedTransaction; summary: VintedOrderSummary }[] = [];
  for (const summary of summaries) {
    const id = summary.transaction_id ?? summary.id;
    if (id == null) continue;
    const data = await getJson<{ transaction?: VintedTransaction }>(`/api/v2/transactions/${id}`).catch(() => null);
    if (data?.transaction) result.push({ t: data.transaction, summary });
  }
  cached = { at: Date.now(), sales: result };
  lastRead = {
    listed: summaries.length,
    read: result.length,
    statuses: result.map(({ t, summary }) => statusText(t, summary)),
    keys: Object.keys(result[0]?.t ?? summaries[0] ?? {}),
  };
  return result;
}

export const vinted: Connector = {
  platform: "Vinted",
  loginUrl: `${ORIGIN}/member/login`,

  async isLoggedIn() {
    try {
      await getJson(`/api/v2/my_orders?type=sold&status=in_progress&per_page=1&page=1`);
      return true;
    } catch (e) {
      if (e instanceof LoggedOut) return false;
      throw e;
    }
  },

  async listOrdersToShip() {
    return (await sales()).filter(({ t, summary }) => needsShipping(t, summary)).map(({ t, summary }) => toImportedOrder(t, summary));
  },

  async listShipmentUpdates() {
    const updates: ShipmentUpdate[] = [];
    for (const { t, summary } of await sales()) {
      const status = shipmentStatus(t, summary);
      if (status) updates.push({ orderNumber: String(t.id), status });
    }
    return updates;
  },

  // The label address answers with where the PDF is; older shipments link the PDF directly.
  async downloadLabel(order) {
    if (!order.labelUrl) return null;
    let res = await fetch(order.labelUrl, { credentials: "include", headers: { Accept: "application/json, application/pdf" } });
    if (!res.ok) return null;
    if ((res.headers.get("content-type") ?? "").includes("json")) {
      const data = (await res.json()) as { label_url?: string; url?: string };
      const pdfUrl = data.label_url ?? data.url;
      if (!pdfUrl) return null;
      res = await fetch(pdfUrl, { credentials: "include" });
      if (!res.ok) return null;
    }
    return (res.headers.get("content-type") ?? "").includes("pdf") ? res.blob() : null;
  },
};
