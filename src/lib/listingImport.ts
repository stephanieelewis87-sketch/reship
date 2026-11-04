import { guessColumns, parseCsv } from "./csvImport";
import { MARKETPLACES, MAX_LISTING_PHOTOS, parseListingLink, platformOfUrl } from "./marketplaces";
import { nextSku } from "./sku";
import type { Condition, InventoryItem, Platform, SkuFormat } from "./types";
import { CONDITIONS } from "./types";

// Bringing listings a seller already has on a marketplace into SellSync's inventory, two ways:
//  - A spreadsheet the marketplace exports (eBay Seller Hub's active listings report, Etsy's
//    listings CSV, Shopify's products export), or any sheet the seller made.
//  - Listing links pasted one per line, for marketplaces with no export (Poshmark, Mercari, Depop,
//    OfferUp, Curtsy and others). SellSync doesn't read those sites, so the item comes in with its
//    link and ID and the seller fills in the rest.
// Either way, a listing already in SellSync is skipped, and a listing whose SKU matches an item
// already in SellSync is linked to that item instead of making a duplicate.

export const LISTING_CSV_FIELDS = [
  { key: "title", label: "Title", required: true },
  { key: "price", label: "Price" },
  { key: "sku", label: "SKU" },
  { key: "listing", label: "Listing link or ID" },
  { key: "description", label: "Description" },
  { key: "brand", label: "Brand" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "condition", label: "Condition" },
  { key: "quantity", label: "Quantity" },
  { key: "photos", label: "Photo links" },
] as const;

export type ListingCsvField = (typeof LISTING_CSV_FIELDS)[number]["key"];
export type ListingMapping = Partial<Record<ListingCsvField, string>>;

// Header names in eBay's active listings report, Etsy's listings CSV, Shopify's products export,
// and common hand-made sheets.
const ALIASES: Record<ListingCsvField, string[]> = {
  title: ["title", "item title", "listing title", "product title", "name", "item name", "product name"],
  price: ["price", "current price", "start price", "variant price", "list price", "listing price", "buy it now price"],
  sku: ["sku", "custom label (sku)", "custom label", "variant sku", "item sku"],
  listing: ["item number", "listing id", "item id", "listing url", "url", "link", "handle", "product id"],
  description: ["description", "body (html)", "body html", "item description"],
  brand: ["brand", "vendor", "manufacturer"],
  size: ["size", "option1 value"],
  color: ["color", "colour", "option2 value"],
  condition: ["condition", "item condition"],
  quantity: ["quantity", "available quantity", "variant inventory qty", "qty", "stock"],
  photos: ["photos", "photo links", "image src", "image url", "images", "picture url", "item photo url"],
};

export const guessListingMapping = (headers: string[]): ListingMapping => guessColumns(headers, LISTING_CSV_FIELDS, ALIASES);

export { parseCsv };

const price = (v: string) => {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
};

const strip = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

// Maps marketplace condition words onto SellSync's scale.
export function toCondition(text: string): Condition | undefined {
  const t = text.toLowerCase();
  if (!t) return undefined;
  const exact = CONDITIONS.find((c) => c.toLowerCase() === t);
  if (exact) return exact;
  if (/with tags|nwt|brand new/.test(t)) return "New with tags";
  if (/new/.test(t)) return /without|no tags|nwot|other/.test(t) ? "New without tags" : "New with tags";
  if (/like new|excellent|very good|mint/.test(t)) return "Like new";
  if (/good|used|pre-owned|preowned/.test(t)) return "Good";
  if (/fair|acceptable|satisfactory|worn|flaw/.test(t)) return "Fair";
  return undefined;
}

// Photo links in a row: the mapped column (which may hold several links) plus Etsy-style
// IMAGE1…IMAGE10 columns.
function photosOf(row: Record<string, string>, column: string | undefined): string[] {
  const cells = [column ? row[column] ?? "" : "", ...Object.keys(row).filter((h) => /^(image|photo|picture)\s*_?\d+$/i.test(h.trim())).sort((a, b) => num(a) - num(b)).map((h) => row[h] ?? "")];
  return cells.flatMap((c) => c.split(/[\s,|]+/)).filter((u) => /^https:\/\//i.test(u));
}
const num = (h: string) => Number(h.match(/\d+/)?.[0] ?? 0);

export interface ImportResult {
  items: InventoryItem[]; // new items, plus existing items with a listing linked
  added: number;
  linked: number; // listings attached to an item already in SellSync by SKU
  skipped: number; // listings already in SellSync
  problems: string[]; // links that couldn't be used, with why
}

const key = (platform: Platform, id: string) => `${platform}|${id.toLowerCase()}`;

// Adds one imported listing to the running result, linking or skipping as needed.
function place(
  draft: Omit<InventoryItem, "id" | "sku" | "listings" | "status"> & { sku?: string },
  platform: Platform,
  listing: { listingId?: string; url?: string; price?: number },
  state: { all: InventoryItem[]; byListing: Set<string>; bySku: Map<string, InventoryItem>; result: ImportResult; skuFormat?: SkuFormat; today: string; now: string },
) {
  const { result } = state;
  if (listing.listingId && state.byListing.has(key(platform, listing.listingId))) {
    result.skipped++;
    return;
  }
  const entry = { platform, status: "active" as const, listedAt: state.today, ...listing };
  const sku = draft.sku?.trim();
  const match = sku ? state.bySku.get(sku.toUpperCase()) : undefined;
  if (match) {
    if (match.listings.some((l) => l.platform === platform && l.status === "active")) {
      result.skipped++;
      return;
    }
    const updated: InventoryItem = { ...match, status: match.status === "sold" ? match.status : "listed", listings: [...match.listings, entry], updatedAt: state.now };
    state.bySku.set(sku!.toUpperCase(), updated);
    state.all = state.all.map((i) => (i.id === match.id ? updated : i));
    const at = result.items.findIndex((i) => i.id === match.id);
    if (at === -1) result.items.push(updated);
    else result.items[at] = updated;
    result.linked++;
  } else {
    const item: InventoryItem = {
      ...draft,
      id: crypto.randomUUID(),
      sku: sku || nextSku(state.all, state.skuFormat),
      status: "listed",
      listings: [entry],
      listedAt: state.today,
      createdAt: state.now,
      updatedAt: state.now,
    };
    state.all = [...state.all, item];
    state.bySku.set(item.sku.toUpperCase(), item);
    result.items.push(item);
    result.added++;
  }
  if (listing.listingId) state.byListing.add(key(platform, listing.listingId));
}

function startState(existing: InventoryItem[], skuFormat: SkuFormat | undefined, now: Date) {
  const byListing = new Set<string>();
  const bySku = new Map<string, InventoryItem>();
  for (const i of existing) {
    if (i.sku) bySku.set(i.sku.toUpperCase(), i);
    for (const l of i.listings) if (l.listingId) byListing.add(key(l.platform, l.listingId));
  }
  const result: ImportResult = { items: [], added: 0, linked: 0, skipped: 0, problems: [] };
  return { all: [...existing], byListing, bySku, result, skuFormat, today: now.toISOString().slice(0, 10), now: now.toISOString() };
}

// Rows from a marketplace's spreadsheet. Rows that share a listing ID with an earlier row and have
// no title (Shopify puts each extra photo on its own row) add their photos to that listing.
export function rowsToItems(
  rows: Record<string, string>[],
  mapping: ListingMapping,
  platform: Platform,
  existing: InventoryItem[],
  skuFormat?: SkuFormat,
  now = new Date(),
): ImportResult {
  const get = (row: Record<string, string>, f: ListingCsvField) => (mapping[f] ? (row[mapping[f]!] ?? "").trim() : "");
  type Pending = { draft: Parameters<typeof place>[0]; listing: { listingId?: string; url?: string; price?: number } };
  const pending: Pending[] = [];
  const byId = new Map<string, Pending>();
  for (const row of rows) {
    const ref = get(row, "listing");
    const parsed: ReturnType<typeof parseListingLink> = ref ? parseListingLink(platform, ref) : { ok: true };
    const listing = parsed.ok ? { listingId: parsed.listingId, url: parsed.url } : {};
    const title = get(row, "title");
    const photos = photosOf(row, mapping.photos);
    const earlier = listing.listingId ? byId.get(listing.listingId) : undefined;
    if (!title) {
      if (earlier) earlier.draft.photos = [...new Set([...(earlier.draft.photos ?? []), ...photos])].slice(0, MAX_LISTING_PHOTOS);
      continue;
    }
    const p = price(get(row, "price"));
    const qty = parseInt(get(row, "quantity"), 10);
    const description = get(row, "description");
    const kept = photos.slice(0, MAX_LISTING_PHOTOS);
    const entry: Pending = {
      draft: {
        title: title.slice(0, 200),
        sku: get(row, "sku") || undefined,
        description: description ? (/<[a-z][\s\S]*>/i.test(description) ? strip(description) : description) : undefined,
        brand: get(row, "brand") || undefined,
        size: get(row, "size") || undefined,
        color: get(row, "color") || undefined,
        condition: toCondition(get(row, "condition")),
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        listPrice: p,
        photos: kept,
        photo: kept[0],
        notes: `Imported from ${MARKETPLACES[platform].name}.`,
      },
      listing: { ...listing, price: p },
    };
    if (!parsed.ok) entry.draft.notes += ` The listing link couldn't be used: ${parsed.problem}`;
    pending.push(entry);
    if (listing.listingId) byId.set(listing.listingId, entry);
  }
  const state = startState(existing, skuFormat, now);
  for (const p of pending) place({ ...p.draft, photo: p.draft.photos?.[0] }, platform, p.listing, state);
  return state.result;
}

// Listing links pasted one per line, from any mix of marketplaces. Each becomes an item listed on
// the marketplace the link belongs to, waiting for its title, price and photos.
export function linksToItems(text: string, existing: InventoryItem[], skuFormat?: SkuFormat, now = new Date()): ImportResult {
  const state = startState(existing, skuFormat, now);
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const platform = platformOfUrl(line);
    if (!platform) {
      state.result.problems.push(`${short(line)}: SellSync doesn't recognize this marketplace. Use a spreadsheet import for your own store.`);
      continue;
    }
    const parsed = parseListingLink(platform, line);
    if (!parsed.ok || !parsed.listingId) {
      state.result.problems.push(`${short(line)}: ${parsed.ok ? "That isn't a listing link." : parsed.problem}`);
      continue;
    }
    const name = MARKETPLACES[platform].name;
    place(
      {
        title: `${name} listing ${parsed.listingId}`,
        quantity: 1,
        readyToList: false,
        notes: `Imported from a ${name} link. Add the title, price and photos from the listing.`,
      },
      platform,
      { listingId: parsed.listingId, url: parsed.url },
      state,
    );
  }
  return state.result;
}

const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

// What each marketplace offers for bringing listings in, shown in the import window.
export const IMPORT_HOW: Partial<Record<Platform, string>> = {
  eBay: "Seller Hub > Reports > Downloads > Create a report > Active listings. Upload the CSV here.",
  Etsy: "Shop Manager > Settings > Options > Download Data > Download CSV (Currently for Sale Listings).",
  Shopify: "Products > Export > All products, as a plain CSV.",
  Poshmark: "Poshmark has no listings export. Paste your listing links instead.",
  Mercari: "Mercari has no listings export. Paste your listing links instead.",
  Depop: "Depop has no listings export for most sellers. Paste your listing links instead.",
  Vinted: "Vinted has no listings export. Paste your listing links instead.",
  OfferUp: "OfferUp has no listings export. Paste your listing links instead.",
  Curtsy: "Curtsy is app-only. Use Share on each listing, open it in a browser, and paste the full link.",
  Grailed: "Grailed has no listings export. Paste your listing links instead.",
  Vestiaire: "Vestiaire has no listings export. Paste your listing links instead.",
  Facebook: "Facebook has no listings export. Paste your Marketplace listing links instead.",
  WhatNot: "Paste your Whatnot listing links, or upload a sheet you keep.",
  ThredUp: "ThredUp has no listings export. Paste your Direct Listing links instead.",
};
