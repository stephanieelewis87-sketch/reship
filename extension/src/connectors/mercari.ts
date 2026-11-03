import type { ShipmentStatus } from "../../../src/lib/types";
import type { Connector, ImportedOrder, ShipmentUpdate } from "./types";

// Mercari's seller pages are drawn in the browser from its private API, so the connector reads
// them the way the seller sees them: it opens each page in a minimized window, reads the finished
// page, and closes the window. The label itself is a plain PDF link on the order page.
const ORIGIN = "https://www.mercari.com";
const IN_PROGRESS_URL = `${ORIGIN}/mypage/listings/in_progress/`;
const orderStatusUrl = (itemId: string) => `${ORIGIN}/transaction/order_status/${itemId}/`;
const PAGE_WAIT_MS = 20_000;

// What the order status page shows, read inside the page by readOrderPage.
export interface MercariOrderPage {
  itemId: string;
  step: string; // the active timeline step, e.g. "Send this order"
  steps: string[]; // every step name, in order
  labelUrl?: string;
  hasQrCode: boolean;
  buyer: string;
  carrier: string;
  soldOn: string; // "Sold on 10/22/26"
  shipToLine: string; // Mercari only shows "City, ST" here; the full address is on the label
  items: { name: string; photo?: string; price?: string }[];
}

// Runs inside the order status page. It must not use anything from outside this function.
export function readOrderPage(): MercariOrderPage | null {
  const q = (id: string, root: ParentNode = document) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (el: Element | null | undefined) => (el?.textContent ?? "").trim();
  const timeline = [...document.querySelectorAll<HTMLElement>('[data-testid="TimelineStep"]')];
  if (!timeline.length) return null;
  const active = timeline.find((s) => s.getAttribute("aria-label") === "active");
  const summary = q("OrderSummary") ?? document;
  const items = [...summary.querySelectorAll<HTMLElement>('[data-testid="ItemInfo"]')].map((info) => {
    const thumb = q("ItemThumbImage", info)?.querySelector<HTMLElement>("[style]");
    const photo = thumb?.style.backgroundImage.match(/url\("?([^")]+)"?\)/)?.[1];
    return { name: text(q("ItemNameLink", info)), photo, price: text(q("ItemPrice", info)) || undefined };
  });
  const itemId =
    text(q("OrderDetails-Value")) || location.pathname.match(/order_status\/(m\d+)/)?.[1] || "";
  const carrierEl = q("CarrierBlock-Text");
  return {
    itemId,
    step: text(q("TimelineStepName", active ?? document)),
    steps: timeline.map((s) => text(q("TimelineStepName", s))),
    labelUrl: q("ShippingCTAButton")?.getAttribute("href") ?? undefined,
    hasQrCode: !!q("TimelineActionButton-qr_code_modal"),
    buyer: text(q("UserNameLink")),
    carrier: (carrierEl?.firstChild?.textContent ?? text(carrierEl)).trim(),
    soldOn: text(q("ItemSoldTime", summary)),
    shipToLine: text(q("ArrivalAddressBlock-Line")),
    items,
  };
}

// Runs inside the in-progress listings page: the item ids of sales still being worked on.
export function readInProgressIds(): string[] {
  const ids = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .map((a) => a.getAttribute("href")!.match(/\/(?:transaction\/order_status|us\/item|item)\/(m\d{6,})/)?.[1])
    .filter((id): id is string => !!id);
  return [...new Set(ids)];
}

// "Sold on 10/22/26" → "2026-10-22".
export function soldDate(soldOn: string): string {
  const m = soldOn.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return new Date().toISOString().slice(0, 10);
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const SEND_STEP = /^send this order|^ship/i;

export function needsShipping(page: MercariOrderPage): boolean {
  return SEND_STEP.test(page.step) && !!page.labelUrl;
}

export function shipmentStatus(page: MercariOrderPage): ShipmentStatus | null {
  const step = page.step.toLowerCase();
  if (SEND_STEP.test(step)) return "label_created";
  if (/deliver|in transit|shipped|on (its|the) way/.test(step)) return "in_transit";
  if (/rating|review|complete|received/.test(step)) return "delivered";
  if (/^cancel+ed/.test(step)) return "cancelled";
  return null;
}

export function toImportedOrder(page: MercariOrderPage): ImportedOrder {
  const items = page.items.length ? page.items : [{ name: "Mercari item" }];
  return {
    platform: "Mercari",
    orderNumber: page.itemId,
    buyer: page.buyer,
    date: soldDate(page.soldOn),
    items: items.map((i) => {
      const price = Number.parseFloat((i.price ?? "").replace(/[^0-9.]/g, ""));
      return { name: i.name || "Mercari item", photo: i.photo, price: Number.isFinite(price) ? price : undefined };
    }),
    carrier: page.carrier.split("/")[0].trim() || "USPS",
    labelUrl: page.labelUrl ? new URL(page.labelUrl, ORIGIN).href : undefined,
    // A Mercari order is numbered by the listing that sold.
    listingIds: [page.itemId],
  };
}

// Reads pages in a minimized window of its own, so syncing doesn't open tabs among the seller's.
// Each page is loaded, given time to draw, read with `read` (run inside the page) and left for
// the next one. Returns null for a page that never shows what `read` looks for.
class PageReader {
  private window?: chrome.windows.Window;

  async read<T>(url: string, read: () => T | null): Promise<T | null> {
    const tabId = await this.tab(url);
    const deadline = Date.now() + PAGE_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const [result] = await chrome.scripting
        .executeScript({ target: { tabId }, func: read })
        .catch(() => [] as chrome.scripting.InjectionResult<T | null>[]);
      const value = result?.result as T | null | undefined;
      if (value && (!Array.isArray(value) || value.length)) return value;
    }
    return null;
  }

  async close() {
    if (this.window?.id !== undefined) await chrome.windows.remove(this.window.id).catch(() => {});
    this.window = undefined;
  }

  private async tab(url: string): Promise<number> {
    if (!this.window) {
      this.window = await chrome.windows.create({ url, state: "minimized", focused: false });
      return this.window.tabs![0].id!;
    }
    const tabId = this.window.tabs![0].id!;
    await chrome.tabs.update(tabId, { url });
    return tabId;
  }
}

// A sync asks for orders to ship and then for shipment updates; both come from the same pages,
// so they're read once and reused for a couple of minutes.
let cached: { at: number; pages: MercariOrderPage[] } | undefined;

// What the last read found, without any order details, for the popup's Test Mercari button.
export let lastRead = { listed: 0, read: 0, steps: [] as string[] };
const CACHE_MS = 2 * 60_000;

async function orderPages(): Promise<MercariOrderPage[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.pages;
  const reader = new PageReader();
  try {
    const ids = (await reader.read(IN_PROGRESS_URL, readInProgressIds)) ?? [];
    const pages: MercariOrderPage[] = [];
    for (const id of ids) {
      const page = await reader.read(orderStatusUrl(id), readOrderPage);
      if (page) pages.push({ ...page, itemId: page.itemId || id });
    }
    cached = { at: Date.now(), pages };
    lastRead = { listed: ids.length, read: pages.length, steps: pages.map((p) => p.step) };
    return pages;
  } finally {
    await reader.close();
  }
}

export const mercari: Connector = {
  platform: "Mercari",
  loginUrl: `${ORIGIN}/login/`,

  async isLoggedIn() {
    const res = await fetch(`${ORIGIN}/v1/initialize`, { credentials: "include", headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = (await res.json()) as { user?: { isLoggedIn?: boolean } };
    return !!data.user?.isLoggedIn;
  },

  async listOrdersToShip() {
    return (await orderPages()).filter(needsShipping).map(toImportedOrder);
  },

  async listShipmentUpdates() {
    const updates: ShipmentUpdate[] = [];
    for (const page of await orderPages()) {
      const status = shipmentStatus(page);
      if (status) updates.push({ orderNumber: page.itemId, status });
    }
    return updates;
  },

  async downloadLabel(order) {
    if (!order.labelUrl) return null;
    const res = await fetch(order.labelUrl, { credentials: "include" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) return null;
    return res.blob();
  },
};
