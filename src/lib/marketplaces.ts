import type { Platform } from "./types";

// SellSync's one address book for every marketplace.
//
// Every link the app sends a seller to (a listing, an order page, a withdraw page, a search)
// is built here and nowhere else. When a marketplace moves a page, fix it once here and it's
// fixed everywhere. A weekly robot (scripts/check-links.ts) visits each address below and opens
// a GitHub issue when one stops working, so a broken link is caught before sellers hit it.
//
// Listing links are never stored the way a seller pastes them. SellSync keeps the marketplace's
// listing ID and builds the link from it when it's shown, so a change in a marketplace's link
// format is one edit to `listingUrl` below, and old listings pick up the fix too.

export interface Marketplace {
  name: string; // full name, for screens with room for it
  // The domains that belong to this marketplace. A pasted link from any other domain is refused.
  hosts: string[];
  // Always works: the marketplace's main page. Every other link falls back here.
  home: string;
  // Most photos the marketplace's sell form takes. SellSync sends the first this many.
  photosMax: number;
  photosNote?: string; // when the limit isn't published by the marketplace itself
  // Gets the plain cover photo, without SellSync's brand tag or sale banner, because the
  // marketplace removes or rejects photos with text or logos added on them.
  plainCover?: boolean;
  // The listing link, built from the marketplace's own listing ID. Left out when the
  // marketplace's links need more than the ID (a title slug), so the cleaned pasted link is kept.
  listingUrl?: (id: string) => string;
  // Pulls the listing ID out of a pasted link's path parts. Returns undefined when it isn't one.
  listingIdFrom?: (parts: string[], url: URL) => string | undefined;
  // Share links the marketplace's app makes, which hide the real address. SellSync can't open
  // them, so the seller is asked for the full link instead.
  shareHosts?: string[];
  orders?: string; // where the seller sees sold orders
  withdraw?: string; // where the seller moves earnings to their bank
  search?: (q: string) => string;
  soldSearch?: (q: string) => string;
}

const enc = encodeURIComponent;
const after = (parts: string[], word: string) => {
  const at = parts.indexOf(word);
  return at === -1 ? undefined : parts[at + 1];
};

// Photo limits as each marketplace's sell form or help pages stated them in November 2026.
// Limits marked with photosNote aren't published by the marketplace, so they're set low on purpose:
// sending fewer photos than a marketplace takes is safe, sending more makes the listing fail.
export const MARKETPLACES: Record<Platform, Marketplace> = {
  Poshmark: {
    name: "Poshmark",
    hosts: ["poshmark.com"],
    shareHosts: ["posh.mk"],
    home: "https://poshmark.com/",
    photosMax: 16,
    // poshmark.com/listing/Levis-501-Jeans-65a1b2c3d4 → 65a1b2c3d4
    listingIdFrom: (p) => after(p, "listing")?.split("-").pop(),
    listingUrl: (id) => `https://poshmark.com/listing/${enc(id)}`,
    orders: "https://poshmark.com/order/sales",
    withdraw: "https://poshmark.com/account/payout-options",
    search: (q) => `https://poshmark.com/search?query=${enc(q)}&availability=available`,
    soldSearch: (q) => `https://poshmark.com/search?query=${enc(q)}&availability=sold_out`,
  },
  Mercari: {
    name: "Mercari",
    hosts: ["mercari.com"],
    shareHosts: ["merc.li"],
    home: "https://www.mercari.com/",
    photosMax: 12,
    plainCover: true, // Mercari rejects photos with text or watermarks added
    listingIdFrom: (p) => after(p, "item"),
    listingUrl: (id) => `https://www.mercari.com/us/item/${enc(id)}/`,
    orders: "https://www.mercari.com/mypage/listings/in_progress/",
    withdraw: "https://www.mercari.com/mypage/sales/bank_account/",
    search: (q) => `https://www.mercari.com/search/?keyword=${enc(q)}`,
    soldSearch: (q) => `https://www.mercari.com/search/?keyword=${enc(q)}&itemStatuses=2`,
  },
  eBay: {
    name: "eBay",
    hosts: ["ebay.com"],
    shareHosts: ["ebay.us"],
    home: "https://www.ebay.com/",
    photosMax: 24,
    plainCover: true, // eBay bans text, logos, banners and watermarks added to photos
    // ebay.com/itm/123456789012, or the older ebay.com/itm/title-words/123456789012
    listingIdFrom: (p) => (p.includes("itm") ? p.slice(p.indexOf("itm") + 1).find((s) => /^\d{9,}$/.test(s)) : undefined),
    listingUrl: (id) => `https://www.ebay.com/itm/${enc(id)}`,
    orders: "https://www.ebay.com/sh/ord",
    search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}`,
    soldSearch: (q) => `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&LH_Sold=1&LH_Complete=1`,
  },
  Etsy: {
    name: "Etsy",
    hosts: ["etsy.com"],
    shareHosts: ["etsy.me"],
    home: "https://www.etsy.com/",
    photosMax: 20,
    listingIdFrom: (p) => after(p, "listing"),
    listingUrl: (id) => `https://www.etsy.com/listing/${enc(id)}`,
    orders: "https://www.etsy.com/your/orders/sold",
    search: (q) => `https://www.etsy.com/search?q=${enc(q)}`,
  },
  Depop: {
    name: "Depop",
    hosts: ["depop.com"],
    shareHosts: ["depop.app.link"],
    home: "https://www.depop.com/",
    photosMax: 4,
    // Depop's links are the listing's slug (shop-name-title-ab12), which is also its ID.
    listingIdFrom: (p) => after(p, "products"),
    listingUrl: (id) => `https://www.depop.com/products/${enc(id)}/`,
    orders: "https://www.depop.com/sellinghub/sold-items/",
    search: (q) => `https://www.depop.com/search/?q=${enc(q)}`,
  },
  Vinted: {
    name: "Vinted",
    hosts: ["vinted.com"],
    home: "https://www.vinted.com/",
    photosMax: 20,
    // vinted.com/items/4567-levis-jeans → 4567
    listingIdFrom: (p) => after(p, "items")?.split("-")[0],
    listingUrl: (id) => `https://www.vinted.com/items/${enc(id)}`,
    orders: "https://www.vinted.com/my_orders/sold",
    search: (q) => `https://www.vinted.com/catalog?search_text=${enc(q)}`,
  },
  WhatNot: {
    name: "Whatnot",
    hosts: ["whatnot.com"],
    home: "https://www.whatnot.com/",
    photosMax: 8,
    photosNote: "Whatnot doesn't publish its photo limit, so SellSync sends the first 8.",
    listingIdFrom: (p) => after(p, "listing"),
    listingUrl: (id) => `https://www.whatnot.com/listing/${enc(id)}`,
    orders: "https://www.whatnot.com/dashboard/orders",
    search: (q) => `https://www.whatnot.com/search?query=${enc(q)}`,
  },
  Facebook: {
    name: "Facebook Marketplace",
    hosts: ["facebook.com"],
    shareHosts: ["fb.me"],
    home: "https://www.facebook.com/marketplace/",
    photosMax: 10,
    photosNote: "Facebook doesn't publish a Marketplace photo limit, so SellSync sends the first 10.",
    listingIdFrom: (p) => after(p, "item"),
    listingUrl: (id) => `https://www.facebook.com/marketplace/item/${enc(id)}/`,
    orders: "https://www.facebook.com/marketplace/you/selling",
    search: (q) => `https://www.facebook.com/marketplace/search/?query=${enc(q)}`,
  },
  ThredUp: {
    name: "ThredUp",
    hosts: ["thredup.com"],
    home: "https://www.thredup.com/",
    photosMax: 8,
    photosNote: "ThredUp doesn't publish its Direct Listing photo limit, so SellSync sends the first 8.",
    // thredup.com/product/women-levis-blue-jeans/223344556 → 223344556. The link needs the title
    // too, so the cleaned pasted link is kept.
    listingIdFrom: (p) => (p[0] === "product" ? p[p.length - 1] : undefined),
    search: (q) => `https://www.thredup.com/search?search_text=${enc(q)}`,
  },
  OfferUp: {
    name: "OfferUp",
    hosts: ["offerup.com"],
    shareHosts: ["offerup.co", "ofr.ly"],
    home: "https://offerup.com/",
    photosMax: 12, // OfferUp's listing rules: 1 to 12 photos
    // offerup.com/item/detail/1234567890
    listingIdFrom: (p) => after(p, "detail"),
    listingUrl: (id) => `https://offerup.com/item/detail/${enc(id)}`,
    search: (q) => `https://offerup.com/search?q=${enc(q)}`,
  },
  Curtsy: {
    name: "Curtsy",
    hosts: ["curtsyapp.com"],
    shareHosts: ["curtsy.app.link"],
    home: "https://curtsyapp.com/",
    photosMax: 8,
    photosNote: "Curtsy doesn't publish its photo limit, so SellSync sends the first 8.",
    // Curtsy is an app first; its web links vary, so the cleaned pasted link is kept as is.
    listingIdFrom: (p) => p[p.length - 1],
  },
  Grailed: {
    name: "Grailed",
    hosts: ["grailed.com"],
    shareHosts: ["grailed.app.link"],
    home: "https://www.grailed.com/",
    photosMax: 8,
    photosNote: "Grailed doesn't publish its photo limit, so SellSync sends the first 8.",
    // grailed.com/listings/12345678-carhartt-detroit-jacket → 12345678
    listingIdFrom: (p) => after(p, "listings")?.split("-")[0],
    listingUrl: (id) => `https://www.grailed.com/listings/${enc(id)}`,
    search: (q) => `https://www.grailed.com/shop?query=${enc(q)}`,
  },
  Vestiaire: {
    name: "Vestiaire Collective",
    hosts: ["vestiairecollective.com"],
    home: "https://us.vestiairecollective.com/",
    photosMax: 8,
    photosNote: "Vestiaire doesn't publish its photo limit, so SellSync sends the first 8.",
    // .../women-bags/handbags/chanel/black-leather-chanel-handbag-41234567.shtml → 41234567.
    // The link needs the whole path, so the cleaned pasted link is kept.
    listingIdFrom: (p) => p[p.length - 1]?.match(/-(\d+)\.shtml$/)?.[1],
    search: (q) => `https://us.vestiairecollective.com/search/?q=${enc(q)}`,
  },
  Shopify: {
    name: "Shopify store",
    hosts: [], // a seller's own store can be on any domain
    home: "https://admin.shopify.com/",
    photosMax: 24, // Shopify takes far more; 24 is the most any marketplace here takes
    // your-store.com/products/handle → handle
    listingIdFrom: (p) => after(p, "products"),
    orders: "https://admin.shopify.com/orders",
  },
  Other: {
    name: "Other",
    hosts: [],
    home: "",
    photosMax: 24,
  },
};

// The most photos a listing can have in SellSync: the most any marketplace takes (eBay's 24).
// Each marketplace gets its first photosMax of them, cover photo first.
export const MAX_LISTING_PHOTOS = Math.max(...Object.values(MARKETPLACES).map((m) => m.photosMax));

// The photos a marketplace gets: its first photosMax, cover first. Marketplaces that ban added
// text or logos get the plain cover (before the brand tag and sale banner) in place of the edited one.
export function photosFor(platform: Platform, photos: string[], plainCover?: string): string[] {
  const m = MARKETPLACES[platform];
  const list = m.plainCover && plainCover && photos.length ? [plainCover, ...photos.slice(1)] : photos;
  return list.slice(0, m.photosMax);
}

export const PLAIN_COVER_PLATFORMS = (Object.keys(MARKETPLACES) as Platform[]).filter((p) => MARKETPLACES[p].plainCover);

const hostMatches = (host: string, hosts: string[]) => {
  const h = host.toLowerCase().replace(/^www\.|^m\.|^mobile\./, "");
  return hosts.some((d) => h === d || h.endsWith(`.${d}`));
};

// Which marketplace a link belongs to, if SellSync knows it.
export function platformOfUrl(text: string): Platform | undefined {
  try {
    const host = new URL(text.trim()).hostname;
    return (Object.keys(MARKETPLACES) as Platform[]).find((p) => hostMatches(host, [...MARKETPLACES[p].hosts, ...(MARKETPLACES[p].shareHosts ?? [])]));
  } catch {
    return undefined;
  }
}

export type ListingLinkResult =
  | { ok: true; listingId?: string; url?: string }
  | { ok: false; problem: string };

// Checks a listing link or ID a seller pasted for one marketplace, before it's saved.
// Refuses links from another marketplace, app share links, and anything that isn't a listing.
// Returns the listing ID, plus a cleaned link (no tracking codes) when the marketplace's links
// can't be rebuilt from the ID alone.
export function parseListingLink(platform: Platform, text: string): ListingLinkResult {
  const t = text.trim();
  if (!t) return { ok: true };
  const m = MARKETPLACES[platform];
  if (!/^https?:\/\//i.test(t)) {
    if (/\s/.test(t) || /^www\.|\.(com|co|me|ly|link)\b/i.test(t)) return { ok: false, problem: "Paste the whole link, starting with https://" };
    return { ok: true, listingId: t };
  }
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, problem: "That link isn't complete. Copy it again from the listing." };
  }
  if (m.shareHosts && hostMatches(u.hostname, m.shareHosts))
    return { ok: false, problem: `That's a share link from the ${m.name} app. Open it, then copy the full address from your browser.` };
  const other = platformOfUrl(t);
  if (other && other !== platform) return { ok: false, problem: `That's a ${MARKETPLACES[other].name} link, not ${m.name}.` };
  if (m.hosts.length && !hostMatches(u.hostname, m.hosts)) return { ok: false, problem: `That isn't a ${m.name} link.` };
  const parts = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const listingId = m.listingIdFrom?.(parts, u) || undefined;
  if (m.listingIdFrom && !listingId) return { ok: false, problem: `That's a ${m.name} page, but not a listing. Open the listing and copy its link.` };
  // Keep the pasted link only when the ID alone can't rebuild it, and drop tracking codes either way.
  return { ok: true, listingId, url: m.listingUrl ? undefined : `${u.origin}${u.pathname}` };
}

// The link to show for a listing: rebuilt from its ID when the marketplace allows, else the saved
// link if it still points at the marketplace, else the marketplace's main page. Never a dead end.
export function listingHref(platform: Platform, listing: { listingId?: string; url?: string }): string | undefined {
  const m = MARKETPLACES[platform];
  if (listing.listingId && m.listingUrl) return m.listingUrl(listing.listingId);
  if (listing.url) {
    try {
      const u = new URL(listing.url);
      if (!m.hosts.length || hostMatches(u.hostname, m.hosts)) return `${u.origin}${u.pathname}`;
    } catch {
      /* fall through to the main page */
    }
  }
  return listing.listingId || listing.url ? m.home || undefined : undefined;
}

// Every fixed address SellSync links to, for the weekly link check. Search links use a sample
// search, since those are built from what the seller types.
export function linksToCheck(): { platform: Platform; what: string; url: string }[] {
  const out: { platform: Platform; what: string; url: string }[] = [];
  for (const [platform, m] of Object.entries(MARKETPLACES) as [Platform, Marketplace][]) {
    const add = (what: string, url?: string) => url && out.push({ platform, what, url });
    add("main page", m.home);
    add("orders page", m.orders);
    add("withdraw page", m.withdraw);
    add("search", m.search?.("levis jeans"));
    add("sold search", m.soldSearch?.("levis jeans"));
  }
  return out;
}
