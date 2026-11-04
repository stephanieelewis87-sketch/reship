import Papa from "papaparse";
import type { InventoryItem, Listing, ListingStatsPoint, Platform } from "./types";

// Views and watchers for each marketplace listing, so a seller can see what buyers are looking at
// without opening every marketplace. The numbers come only from routes the marketplace allows:
// its own reports (eBay's Seller Hub downloads), its official API once SellSync's app key is
// approved (eBay, Etsy), or the seller typing in what the marketplace shows them.

export interface StatsReading {
  views?: number;
  watchers?: number;
}

// What each marketplace calls the people keeping an eye on a listing.
export const WATCHER_WORD: Record<Platform, { one: string; many: string }> = {
  eBay: { one: "watcher", many: "watchers" },
  Etsy: { one: "favorite", many: "favorites" },
  Poshmark: { one: "like", many: "likes" },
  Mercari: { one: "like", many: "likes" },
  Depop: { one: "like", many: "likes" },
  Vinted: { one: "favorite", many: "favorites" },
  WhatNot: { one: "save", many: "saves" },
  Facebook: { one: "save", many: "saves" },
  ThredUp: { one: "favorite", many: "favorites" },
  OfferUp: { one: "save", many: "saves" },
  Curtsy: { one: "like", many: "likes" },
  Grailed: { one: "favorite", many: "favorites" },
  Vestiaire: { one: "like", many: "likes" },
  Shopify: { one: "favorite", many: "favorites" },
  Other: { one: "watcher", many: "watchers" },
};
export const watcherWord = (p: Platform, n: number) => (n === 1 ? WATCHER_WORD[p].one : WATCHER_WORD[p].many);

// Where each marketplace's numbers can come from today. Shown when the seller opens the numbers.
export const STATS_SOURCE: Record<Platform, string> = {
  eBay: "Import eBay's Seller Hub reports: the listings traffic report has page views, and the active listings download has watchers. Automatic updates come with eBay's official API connection, a later step.",
  Etsy: "Type in the views and favorites from Shop Manager. Etsy's official API has both, so they'll update on their own once SellSync's Etsy app key is approved.",
  Poshmark: "Type in what your listing shows. Poshmark has no seller API.",
  Mercari: "Type in what your listing shows. Mercari has no seller API for this.",
  Depop: "Type in what your listing shows. Depop's API is only open to approved business partners.",
  Vinted: "Type in what your listing shows. Vinted has no public seller API, and SellSync doesn't scrape Vinted.",
  WhatNot: "Type in what your listing shows. Whatnot has no seller API for this.",
  Facebook: "Type in what your listing shows. Facebook has no API for personal Marketplace sellers.",
  ThredUp: "Type in what your listing shows. ThredUp has no seller API.",
  OfferUp: "Type in what your listing shows. OfferUp has no API for personal sellers.",
  Curtsy: "Type in what your listing shows in the Curtsy app. Curtsy has no seller API.",
  Grailed: "Type in what your listing shows. Grailed has no public seller API.",
  Vestiaire: "Type in what your listing shows. Vestiaire has no public seller API.",
  Shopify: "Type in what your Shopify analytics show for the product. Shopify's API can share these once SellSync connects to your store, a later step.",
  Other: "Type in what the marketplace shows you.",
};

const HISTORY_LIMIT = 30;

// Saves a new reading on a listing. The reading it replaces moves into the history, unless it's
// from the same day. A number the reading leaves out keeps its last value (eBay's traffic report
// has views but no watchers, for example).
export function recordStats(listing: Listing, reading: StatsReading, date: string): Listing {
  const views = reading.views ?? listing.views;
  const watchers = reading.watchers ?? listing.watchers;
  if (views === listing.views && watchers === listing.watchers && listing.statsAt === date) return listing;
  let history = listing.statsHistory ?? [];
  if (listing.statsAt && listing.statsAt !== date && (listing.views != null || listing.watchers != null)) {
    history = [...history.filter((h) => h.date !== listing.statsAt), { date: listing.statsAt, views: listing.views, watchers: listing.watchers }].slice(-HISTORY_LIMIT);
  }
  return { ...listing, views, watchers, statsAt: date, statsHistory: history.length ? history : undefined };
}

export const hasStats = (l: Listing) => l.views != null || l.watchers != null;

export interface ListingStatsRow {
  listing: Listing;
  views?: number;
  watchers?: number;
  // Change since the reading before this one.
  viewsUp?: number;
  watchersUp?: number;
  since?: string;
}

export interface ItemStats {
  views: number;
  watchers: number;
  hasViews: boolean;
  hasWatchers: boolean;
  rows: ListingStatsRow[];
  viewsUp: number;
  watchersUp: number;
  since?: string; // earliest date the changes are counted from
  statsAt?: string; // latest date any number is from
}

const previous = (l: Listing): ListingStatsPoint | undefined => l.statsHistory?.[l.statsHistory.length - 1];

// The item's numbers across all its listings, live or not, with what changed since the last reading.
export function itemStats(item: InventoryItem): ItemStats {
  const rows: ListingStatsRow[] = [];
  let views = 0;
  let watchers = 0;
  let viewsUp = 0;
  let watchersUp = 0;
  let since: string | undefined;
  let statsAt: string | undefined;
  for (const l of item.listings) {
    if (!hasStats(l)) continue;
    const prev = previous(l);
    const row: ListingStatsRow = { listing: l, views: l.views, watchers: l.watchers };
    if (prev) {
      if (l.views != null && prev.views != null) row.viewsUp = l.views - prev.views;
      if (l.watchers != null && prev.watchers != null) row.watchersUp = l.watchers - prev.watchers;
      row.since = prev.date;
      if (!since || prev.date < since) since = prev.date;
    }
    views += l.views ?? 0;
    watchers += l.watchers ?? 0;
    viewsUp += row.viewsUp ?? 0;
    watchersUp += row.watchersUp ?? 0;
    if (l.statsAt && (!statsAt || l.statsAt > statsAt)) statsAt = l.statsAt;
    rows.push(row);
  }
  return {
    views,
    watchers,
    hasViews: rows.some((r) => r.views != null),
    hasWatchers: rows.some((r) => r.watchers != null),
    rows,
    viewsUp,
    watchersUp,
    since,
    statsAt,
  };
}

// 1234 -> "1.2k", so the list stays narrow.
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

// ---- eBay Seller Hub reports ----

export interface ReportRow extends StatsReading {
  listingId: string;
}

const toCount = (v: string | undefined): number | undefined => {
  if (v == null) return undefined;
  const t = v.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Math.round(Number(t));
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

// Reads eBay's Seller Hub downloads: the listings traffic report (Performance > Traffic >
// Download, which has "eBay item ID" and "Total page views" after a few lines of report details)
// and the active listings download (Listings > Active > Download, "Item number" and "Watchers").
// Either one, or a sheet with both, works. Returns nothing it can't match to a listing ID.
export function parseEbayStatsReport(text: string): { rows: ReportRow[]; hasViews: boolean; hasWatchers: boolean } {
  const grid = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true }).data;
  const isId = (h: string) => /\bitem (id|number)\b/.test(h) || h === "item id" || h === "listing id";
  const headerAt = grid.findIndex((row) => row.some((c) => isId(norm(c ?? ""))));
  if (headerAt < 0) return { rows: [], hasViews: false, hasWatchers: false };
  const headers = grid[headerAt].map((c) => norm(c ?? ""));
  const idCol = headers.findIndex(isId);
  const exactViews = headers.findIndex((h) => h === "total page views" || h === "page views" || h === "views");
  const viewsCol = exactViews >= 0 ? exactViews : headers.findIndex((h) => h.includes("page views") && !/promoted|click|%|rate|from/.test(h));
  const watchCol = headers.findIndex((h) => /^watch(ers|ing|es)?$/.test(h) || h === "watch count" || h === "watchers count");
  const rows: ReportRow[] = [];
  for (const cells of grid.slice(headerAt + 1)) {
    const id = (cells[idCol] ?? "").replace(/[^0-9A-Za-z-]/g, "");
    if (!id) continue;
    const row: ReportRow = { listingId: id };
    if (viewsCol >= 0) row.views = toCount(cells[viewsCol]);
    if (watchCol >= 0) row.watchers = toCount(cells[watchCol]);
    if (row.views == null && row.watchers == null) continue;
    rows.push(row);
  }
  return { rows, hasViews: viewsCol >= 0, hasWatchers: watchCol >= 0 };
}

// True when the listing is the one the marketplace calls `id`: by its saved listing ID, or by
// the ID at the end of its link (eBay links look like ebay.com/itm/123456789012).
export function listingMatches(l: Listing, id: string): boolean {
  if (l.listingId && l.listingId.trim() === id) return true;
  if (!l.url) return false;
  return new RegExp(`(^|[^0-9A-Za-z])${id.replace(/[-]/g, "\\-")}([^0-9A-Za-z]|$)`).test(l.url);
}

// Puts a report's numbers on the matching listings. Returns the changed items, and the report's
// listing IDs that match nothing in SellSync (so the seller can link them in Guardian).
export function applyStatsReport(
  inventory: InventoryItem[],
  platform: Platform,
  rows: ReportRow[],
  date: string,
): { changed: InventoryItem[]; matched: number; unmatched: string[] } {
  const byId = new Map(rows.map((r) => [r.listingId, r]));
  const used = new Set<string>();
  const changed: InventoryItem[] = [];
  for (const item of inventory) {
    let touched = false;
    const listings = item.listings.map((l) => {
      if (l.platform !== platform) return l;
      for (const [id, row] of byId) {
        if (!listingMatches(l, id)) continue;
        used.add(id);
        const next = recordStats(l, row, date);
        if (next !== l) touched = true;
        return next;
      }
      return l;
    });
    if (touched) changed.push({ ...item, listings, updatedAt: new Date().toISOString() });
  }
  return { changed, matched: used.size, unmatched: rows.map((r) => r.listingId).filter((id) => !used.has(id)) };
}
