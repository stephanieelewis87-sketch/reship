import { apiListingsToItems, toCondition, type ApiListing, type ImportResult } from "./listingImport";
import { MAX_LISTING_PHOTOS } from "./marketplaces";
import type { Address, InventoryItem, Order, SkuFormat } from "./types";

// Turns what the `ebay` Edge Function reads from eBay's official APIs into Hubby orders and
// inventory. Kept apart from the function so it can be tested here.

export interface EbayOrder {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus?: string; // NOT_STARTED | IN_PROGRESS | FULFILLED
  orderPaymentStatus?: string;
  cancelState?: string; // NONE_REQUESTED | CANCEL_REQUESTED | CANCELED
  buyer?: string;
  total?: string;
  deliveryCost?: string;
  marketplaceFee?: string;
  shippingCarrier?: string;
  shipTo?: {
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    countryCode?: string;
  } | null;
  lineItems: { title?: string; sku?: string; legacyItemId?: string; quantity?: number; price?: string }[];
}

export interface EbayListing {
  itemId: string;
  title?: string;
  sku?: string;
  price?: number;
  quantity?: number;
  watchers?: number;
  startTime?: string;
  url?: string;
  photos?: string[];
  gallery?: string;
  condition?: string;
}

export interface EbayImport {
  orders: EbayOrder[];
  listings: EbayListing[];
  username: string | null;
}

const money = (v: string | number | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

function address(s: EbayOrder["shipTo"]): Address | undefined {
  if (!s?.addressLine1) return undefined;
  return {
    name: s.fullName ?? "",
    street1: s.addressLine1,
    street2: s.addressLine2 || undefined,
    city: s.city ?? "",
    state: s.stateOrProvince ?? "",
    zip: s.postalCode ?? "",
    country: s.countryCode ?? "US",
    phone: s.phone || undefined,
  };
}

export const ebayOrderKey = (orderId: string) => `ebay-${orderId}`;

export interface OrdersResult {
  fresh: Order[]; // orders Hubby didn't have
  updated: Order[]; // orders Hubby had that eBay now says have shipped
  skipped: number; // already in Hubby and unchanged, or cancelled
}

// eBay orders → Hubby orders. An order already in Hubby (from an earlier import or a Seller Hub CSV)
// is never duplicated; one that eBay now says has shipped is marked shipped. Cancelled orders are left out.
// Line items without a SKU get the SKU of the inventory item linked to that eBay listing, so the
// sale is matched to the item.
export function ebayOrdersToOrders(raw: EbayOrder[], existing: Order[], inventory: InventoryItem[]): OrdersResult {
  const have = new Map(existing.filter((o) => o.platform === "eBay").map((o) => [o.orderId, o]));
  const skuByListing = new Map<string, string>();
  for (const i of inventory) for (const l of i.listings) if (l.platform === "eBay" && l.listingId && i.sku) skuByListing.set(l.listingId, i.sku);
  const result: OrdersResult = { fresh: [], updated: [], skipped: 0 };
  for (const o of raw) {
    if (!o.orderId) continue;
    const shipped = o.orderFulfillmentStatus === "FULFILLED";
    const known = have.get(o.orderId);
    if (known) {
      if (shipped && known.status !== "shipped") result.updated.push({ ...known, status: "shipped" });
      else result.skipped++;
      continue;
    }
    if (o.cancelState === "CANCELED") {
      result.skipped++;
      continue;
    }
    const items = o.lineItems.map((li) => {
      const qty = li.quantity && li.quantity > 1 ? li.quantity : 1;
      return {
        name: `${li.title ?? "eBay item"}${qty > 1 ? ` (x${qty})` : ""}`,
        sku: li.sku || (li.legacyItemId ? skuByListing.get(li.legacyItemId) : undefined),
        price: money(li.price),
      };
    });
    const order: Order = {
      id: ebayOrderKey(o.orderId),
      platform: "eBay",
      orderId: o.orderId,
      buyer: o.buyer ?? o.shipTo?.fullName ?? "",
      items: items.length ? items : [{ name: "eBay order" }],
      date: (o.creationDate ?? new Date().toISOString()).slice(0, 10),
      status: shipped ? "shipped" : "pending",
      carrier: o.shippingCarrier ?? "",
      shipTo: address(o.shipTo),
      source: "sync",
      fees: money(o.marketplaceFee),
    };
    have.set(o.orderId, order);
    result.fresh.push(order);
  }
  return result;
}

// Active eBay listings → inventory. A listing already linked to an item is skipped; one whose
// Custom label (SKU) matches an item is linked to it; the rest become new listed items.
export function ebayListingsToItems(raw: EbayListing[], existing: InventoryItem[], skuFormat?: SkuFormat, now = new Date()): ImportResult {
  const today = now.toISOString().slice(0, 10);
  const listings: ApiListing[] = raw
    .filter((l) => l.itemId && l.title)
    .map((l) => {
      const photos = (l.photos?.length ? l.photos : l.gallery ? [l.gallery] : []).filter((u) => /^https:\/\//i.test(u)).slice(0, MAX_LISTING_PHOTOS);
      const price = money(l.price);
      return {
        draft: {
          title: l.title!.slice(0, 200),
          sku: l.sku?.trim() || undefined,
          condition: l.condition ? toCondition(l.condition) : undefined,
          quantity: l.quantity && l.quantity > 0 ? l.quantity : 1,
          listPrice: price,
          photos,
          photo: photos[0],
          notes: "Imported from eBay.",
        },
        listing: {
          listingId: l.itemId,
          url: l.url || `https://www.ebay.com/itm/${l.itemId}`,
          price,
          listedAt: l.startTime ? l.startTime.slice(0, 10) : today,
          ...(l.watchers != null ? { watchers: l.watchers, statsAt: today } : {}),
        },
      };
    });
  return apiListingsToItems("eBay", listings, existing, skuFormat, now);
}
