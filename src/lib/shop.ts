import { MARKETPLACES } from "./marketplaces";
import type { MarketListing } from "./sellsource";
import { isoDay } from "./analytics";
import type { InventoryItem, Platform } from "./types";

// Shop: search for things to buy across marketplaces from one box.
//
// What's possible, marketplace by marketplace (November 2026):
//  - SellSource (SellSync's own marketplace): searched and bought right inside SellSync.
//  - eBay: its official Browse API lets any approved-key app search live listings, so results show
//    in SellSync. Paying happens on eBay: eBay's Order API, which would let an app check out, is
//    only open to a few partners eBay picks. Links carry SellSync's eBay Partner Network ID when
//    one is set up, so SellSync earns a small commission at no cost to the buyer.
//  - Etsy: its Open API lets apps search active listings, so results show in SellSync. Buying
//    happens on Etsy; Etsy has no checkout API for other apps.
//  - Poshmark, Mercari, Depop, Vinted, Facebook Marketplace, ThredUp, Grailed, Curtsy, OfferUp and
//    Vestiaire have no public search or buying API. Shop opens their own search for the same words
//    in a new tab. Reading their pages from SellSync would break their terms, so SellSync doesn't.

export type ShopSource = "sellsource" | "api" | "sample";

export interface ShopResult {
  id: string;
  platform: Platform;
  title: string;
  price: number;
  shipping?: number; // undefined when the marketplace didn't say
  url: string;
  image?: string;
  condition?: string;
  seller?: string;
  source: ShopSource;
  listingId?: string; // SellSource listing id, for buying inside SellSync
}

export interface ShopFilters {
  maxPrice?: number;
  condition?: "new" | "used";
}

export interface ShopSourceStatus {
  platform: Platform;
  status: "ok" | "off" | "error";
  message?: string;
}

export interface ShopSearch {
  results: ShopResult[];
  sources: ShopSourceStatus[];
}

export interface ShopApi {
  // Marketplaces with an official search API (eBay and Etsy), through the shop-search function.
  search(q: string, filters: ShopFilters): Promise<ShopSearch>;
}

// Marketplaces Shop can only open in a new tab, in the order resellers use them most.
export const LINK_ONLY: Platform[] = ["Poshmark", "Mercari", "Depop", "Vinted", "Facebook", "ThredUp", "Grailed", "Curtsy", "OfferUp", "Vestiaire"];

export const searchLinks = (q: string): { platform: Platform; url: string }[] =>
  LINK_ONLY.flatMap((p) => {
    const search = MARKETPLACES[p].search;
    return search ? [{ platform: p, url: search(q) }] : [];
  });

export const fromMarket = (l: MarketListing): ShopResult => ({
  id: `ss-${l.id}`,
  platform: "SellSource",
  title: l.title,
  price: l.price,
  shipping: l.shippingPrice,
  url: `/?market&item=${encodeURIComponent(l.id)}`,
  image: l.photos[0],
  condition: l.condition,
  seller: l.shopName,
  source: "sellsource",
  listingId: l.id,
});

export function applyFilters(results: ShopResult[], f: ShopFilters): ShopResult[] {
  return results.filter((r) => {
    if (f.maxPrice && r.price > f.maxPrice) return false;
    if (f.condition) {
      const isNew = /^new/i.test(r.condition ?? "");
      if (f.condition === "new" ? !isNew : isNew) return false;
    }
    return true;
  });
}

export type ShopSort = "best" | "low" | "high";
export const delivered = (r: ShopResult) => r.price + (r.shipping ?? 0);

export function sortResults(results: ShopResult[], sort: ShopSort): ShopResult[] {
  if (sort === "best") return results;
  const dir = sort === "low" ? 1 : -1;
  return [...results].sort((a, b) => dir * (delivered(a) - delivered(b)));
}

// "I bought this": turns a purchase into an inventory draft, with what it cost and where it came
// from, so its profit counts the day it sells.
export function itemFromPurchase(r: ShopResult, paid: number, sku: string, id: string, today = isoDay(new Date())): InventoryItem {
  return {
    id,
    sku,
    title: r.title.slice(0, 80),
    cost: Math.round(paid * 100) / 100,
    source: MARKETPLACES[r.platform]?.name ?? r.platform,
    purchasedAt: today,
    status: "draft",
    listings: [],
    photo: r.image,
    photos: r.image ? [r.image] : undefined,
    notes: `Bought on ${MARKETPLACES[r.platform]?.name ?? r.platform}: ${r.url}`,
    createdAt: new Date().toISOString(),
  };
}

// Demo mode: made-up results, marked as samples on the page.
const SAMPLE_ROWS: [Platform, string, number, number | undefined, string][] = [
  ["eBay", "Patagonia Better Sweater fleece jacket", 48, 0, "Pre-owned"],
  ["eBay", "Levi's 501 vintage jeans 32x30", 39.99, 6.5, "Pre-owned"],
  ["eBay", "Lululemon Align leggings 25in size 6", 52, 0, "New with tags"],
  ["Etsy", "Vintage 90s Carhartt work jacket", 85, 12, "Used"],
  ["eBay", "Nike Air Max 90 men's 10", 74.5, 0, "Pre-owned"],
  ["Etsy", "Y2K Coach shoulder bag, signature canvas", 64, 8, "Used"],
  ["eBay", "Free People oversized sweater, cream, S", 29, 5.99, "Pre-owned"],
  ["eBay", "Madewell Transport leather tote", 68, 0, "Pre-owned"],
];

export function sampleShop(q: string): ShopSearch {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (t: string) => words.some((w) => t.toLowerCase().includes(w));
  const rows = SAMPLE_ROWS.filter(([, t]) => hit(t));
  const list = rows.length ? rows : SAMPLE_ROWS;
  return {
    results: list.map(([platform, title, price, shipping, condition], i) => ({
      id: `sample-${i}`,
      platform,
      title,
      price,
      shipping,
      condition,
      url: MARKETPLACES[platform].search!(title),
      source: "sample",
    })),
    sources: [
      { platform: "eBay", status: "ok", message: "Sample results in demo mode." },
      { platform: "Etsy", status: "ok", message: "Sample results in demo mode." },
    ],
  };
}
