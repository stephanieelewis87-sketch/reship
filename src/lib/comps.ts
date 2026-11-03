import type { InventoryItem, Order, Platform } from "./types";

// Research: price comps for an item across marketplaces, from sources each marketplace allows.
//  - Your own sales in SellSync, always.
//  - eBay's official Browse API (active listings) and, once eBay approves the account, its
//    Marketplace Insights API (sold prices). Called by the comps-search Edge Function.
//  - Etsy's official Open API (active listings), also through comps-search.
//  - Everything else opens the marketplace's own search in a new tab, where the seller looks at it
//    themselves and can save a comp by hand. SellSync never scrapes a marketplace.

export type CompState = "sold" | "active";
export type CompSource = "yours" | "api" | "manual" | "sample";

export interface Comp {
  id: string;
  platform: Platform;
  title: string;
  price: number;
  state: CompState;
  date?: string; // YYYY-MM-DD: sold date, or listed date for active
  url?: string;
  image?: string;
  condition?: string;
  source: CompSource;
}

// One saved search, with the comps the seller chose to keep (kept in Settings, per account).
export interface SavedResearch {
  id: string;
  query: string;
  comps: Comp[];
  note?: string;
  savedAt: string; // ISO
}

// What the live search returned for each marketplace it tried.
export interface LiveSourceStatus {
  platform: Platform;
  state: CompState;
  status: "ok" | "off" | "error";
  message?: string;
}

export interface LiveCompsResult {
  comps: Comp[];
  sources: LiveSourceStatus[];
}

export interface CompsApi {
  search(query: string): Promise<LiveCompsResult>;
}

// How each marketplace's comps reach the Research tab. `inApp` is what SellSync can show on the
// page itself; anything else is a button to the marketplace's own search.
export interface CompCoverage {
  platform: Platform;
  inApp: { sold: "yes" | "approval" | "no"; active: "yes" | "no" };
  why: string; // shown when data can't be pulled in
  soldUrl?: (q: string) => string; // the marketplace's own sold search, if it has one
  activeUrl: (q: string) => string;
}

const enc = encodeURIComponent;

export const COMP_COVERAGE: CompCoverage[] = [
  {
    platform: "eBay",
    inApp: { sold: "approval", active: "yes" },
    why: "Active listings come from eBay's official Browse API. Sold prices need eBay's Marketplace Insights API, which eBay only opens to approved apps, so until then use the sold search on eBay.",
    soldUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&LH_Sold=1&LH_Complete=1`,
    activeUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}`,
  },
  {
    platform: "Etsy",
    inApp: { sold: "no", active: "yes" },
    why: "Active listings come from Etsy's official Open API. Etsy doesn't share other shops' sold prices.",
    activeUrl: (q) => `https://www.etsy.com/search?q=${enc(q)}`,
  },
  {
    platform: "Poshmark",
    inApp: { sold: "no", active: "no" },
    why: "Poshmark has no public API for searching listings, so SellSync opens Poshmark's own sold search for you.",
    soldUrl: (q) => `https://poshmark.com/search?query=${enc(q)}&availability=sold_out`,
    activeUrl: (q) => `https://poshmark.com/search?query=${enc(q)}&availability=available`,
  },
  {
    platform: "Mercari",
    inApp: { sold: "no", active: "no" },
    why: "Mercari has no public API for searching listings, so SellSync opens Mercari's own sold search for you.",
    soldUrl: (q) => `https://www.mercari.com/search/?keyword=${enc(q)}&itemStatuses=2`,
    activeUrl: (q) => `https://www.mercari.com/search/?keyword=${enc(q)}`,
  },
  {
    platform: "Depop",
    inApp: { sold: "no", active: "no" },
    why: "Depop has no public API for searching listings, and its search shows items for sale, not sold prices.",
    activeUrl: (q) => `https://www.depop.com/search/?q=${enc(q)}`,
  },
  {
    platform: "Vinted",
    inApp: { sold: "no", active: "no" },
    why: "Vinted has no public API and its terms don't allow tools to read its site, so SellSync only opens Vinted's search. Vinted doesn't show sold prices.",
    activeUrl: (q) => `https://www.vinted.com/catalog?search_text=${enc(q)}`,
  },
  {
    platform: "WhatNot",
    inApp: { sold: "no", active: "no" },
    why: "Whatnot has no public API for searching listings, so SellSync opens Whatnot's search.",
    activeUrl: (q) => `https://www.whatnot.com/search?query=${enc(q)}`,
  },
  {
    platform: "Facebook",
    inApp: { sold: "no", active: "no" },
    why: "Facebook has no API for Marketplace listings. Its search opens in Facebook, signed in as you.",
    activeUrl: (q) => `https://www.facebook.com/marketplace/search/?query=${enc(q)}`,
  },
  {
    platform: "ThredUp",
    inApp: { sold: "no", active: "no" },
    why: "ThredUp has no public API for searching listings, so SellSync opens ThredUp's search.",
    activeUrl: (q) => `https://www.thredup.com/search?search_text=${enc(q)}`,
  },
];

const STOP = new Set(["a", "an", "and", "the", "for", "with", "of", "in", "on", "to", "by", "size", "sz", "womens", "mens", "women", "men", "s"]);

export function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[’']/g, "")
        .split(/[^a-z0-9.]+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ""))
        .filter((t) => t && !STOP.has(t)),
    ),
  ];
}

// The search to run for an inventory item: its brand and title, without saying the brand twice.
export function compQuery(item: Pick<InventoryItem, "brand" | "title">): string {
  const title = item.title.trim();
  const brand = item.brand?.trim();
  if (!brand || /^(unbranded|no brand|none|n\/?a|other|unknown)$/i.test(brand) || title.toLowerCase().includes(brand.toLowerCase())) return title;
  return `${brand} ${title}`;
}

// Share of the query's words found in a title (0 to 1).
export function matchScore(query: string[], text: string): number {
  if (!query.length) return 0;
  const words = new Set(tokens(text));
  return query.filter((q) => words.has(q)).length / query.length;
}

// Your own sold items that match the search: every word, or, when nothing matches every word,
// most of them.
export function yourSales(query: string, orders: Order[]): Comp[] {
  const q = tokens(query);
  if (!q.length) return [];
  const all: (Comp & { score: number })[] = [];
  for (const o of orders) {
    o.items.forEach((it, i) => {
      if (!it.price || it.price <= 0) return;
      const score = matchScore(q, [it.name, it.brand, it.category].filter(Boolean).join(" "));
      if (score > 0) all.push({ id: `yours-${o.id}-${i}`, platform: o.platform, title: it.name, price: it.price, state: "sold", date: o.date, image: it.photo, source: "yours", score });
    });
  }
  const exact = all.filter((c) => c.score === 1);
  const picked = exact.length ? exact : all.filter((c) => c.score >= 0.6 && q.length >= 2);
  return picked.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map(({ score: _s, ...c }) => c);
}

export interface PriceStats {
  count: number;
  low: number;
  high: number;
  median: number;
  p25: number;
  p75: number;
}

function quantile(sorted: number[], p: number) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function priceStats(prices: number[]): PriceStats | null {
  const s = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { count: s.length, low: s[0], high: s[s.length - 1], median: r(quantile(s, 0.5)), p25: r(quantile(s, 0.25)), p75: r(quantile(s, 0.75)) };
}

export interface CompSummary {
  sold: PriceStats | null;
  active: PriceStats | null;
  // A price range to list at: the middle half of sold prices, or of asking prices when there are
  // fewer than three sales to go on.
  suggested: { low: number; high: number; basis: "sold" | "asking" } | null;
}

export function summarize(comps: Comp[]): CompSummary {
  const sold = priceStats(comps.filter((c) => c.state === "sold").map((c) => c.price));
  const active = priceStats(comps.filter((c) => c.state === "active").map((c) => c.price));
  const roundDollar = (n: number) => Math.max(1, Math.round(n));
  let suggested: CompSummary["suggested"] = null;
  if (sold && sold.count >= 3) suggested = { low: roundDollar(sold.p25), high: roundDollar(sold.p75), basis: "sold" };
  else if (active && active.count >= 3) suggested = { low: roundDollar(active.p25), high: roundDollar(active.p75), basis: "asking" };
  return { sold, active, suggested };
}

// Sold and active prices per marketplace, for the side-by-side table.
export function byPlatform(comps: Comp[]): { platform: Platform; sold: PriceStats | null; active: PriceStats | null }[] {
  const platforms = [...new Set(comps.map((c) => c.platform))];
  return platforms
    .map((platform) => {
      const mine = comps.filter((c) => c.platform === platform);
      return {
        platform,
        sold: priceStats(mine.filter((c) => c.state === "sold").map((c) => c.price)),
        active: priceStats(mine.filter((c) => c.state === "active").map((c) => c.price)),
      };
    })
    .sort((a, b) => (b.sold?.count ?? 0) + (b.active?.count ?? 0) - ((a.sold?.count ?? 0) + (a.active?.count ?? 0)));
}

// Demo mode has no backend, so it shows made-up eBay and Etsy results, clearly marked as samples,
// built from the search words so the page has something to show.
export function sampleLiveComps(query: string): LiveCompsResult {
  const q = query.trim();
  if (!q) return { comps: [], sources: [] };
  let seed = [...q.toLowerCase()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 10000) / 10000;
  const base = 18 + Math.round(rand() * 50);
  const title = q.replace(/\b\w/g, (c) => c.toUpperCase());
  const extras = ["", " EUC", " NWT", " Size M", " Vintage", " Excellent condition", " Size 9", " Like new"];
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const comps: Comp[] = [];
  const add = (platform: Platform, state: CompState, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const price = Math.round(base * (1 - spread / 2 + rand() * spread) * (state === "active" ? 1.15 : 1));
      comps.push({ id: `sample-${platform}-${state}-${i}`, platform, title: `${title}${extras[Math.floor(rand() * extras.length)]}`, price, state, date: day(Math.floor(rand() * 60)), source: "sample" });
    }
  };
  add("eBay", "active", 8, 0.7);
  add("eBay", "sold", 6, 0.5);
  add("Etsy", "active", 4, 0.8);
  return {
    comps,
    sources: [
      { platform: "eBay", state: "active", status: "ok" },
      { platform: "eBay", state: "sold", status: "ok" },
      { platform: "Etsy", state: "active", status: "ok" },
    ],  };
}
