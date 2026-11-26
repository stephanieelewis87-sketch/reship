import type { Platform } from "./types";

// What each marketplace lets a reselling tool do, and how Hubby gets orders, labels and listings
// for it. Only routes the marketplace allows are listed: its official API, its own exports, the
// label it emails or shows the seller, or steps the seller does by hand. Shown in Settings > Connections.
export interface PlatformInfo {
  name: string; // full name, for screens with room for it
  orders: string; // how sold orders get into Hubby
  label: string; // who provides the shipping label
  listing: string; // how crosslisting and delisting work
  note?: string;
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  Poshmark: {
    name: "Poshmark",
    orders: "Synced by the browser extension, or Import CSV.",
    label: "Poshmark's prepaid label, downloaded with the order.",
    listing: "Link listings by hand for now.",
  },
  Mercari: {
    name: "Mercari",
    orders: "Synced by the browser extension, or Import CSV.",
    label: "Mercari's prepaid label, or ship on your own with a Hubby label.",
    listing: "Link listings by hand for now.",
  },
  eBay: {
    name: "eBay",
    orders: "Import CSV from Seller Hub.",
    label: "Buy a Hubby label, then add tracking in eBay.",
    listing: "Link listings by hand for now.",
  },
  Etsy: {
    name: "Etsy",
    orders: "Import Etsy's Orders CSV (Shop Manager > Settings > Options > Download Data).",
    label: "Buy a Hubby label or an Etsy label, then add tracking to the Etsy order.",
    listing: "Link listings by hand for now.",
    note: "Etsy has an official API for orders, tracking and listings. Connecting it needs a Hubby app key approved by Etsy, which is a later step.",
  },
  Depop: {
    name: "Depop",
    orders: "Import CSV, or add orders by hand. Extension sync is coming.",
    label: "Depop's label, or ship on your own with a Hubby label.",
    listing: "Link listings by hand for now.",
  },
  Vinted: {
    name: "Vinted",
    orders: "Add orders by hand, or Import CSV.",
    label: "Vinted's prepaid label from the order. Hubby never buys a second one.",
    listing: "Link listings by hand. Vinted has no public seller API.",
    note: "Hubby follows Vinted's terms: it doesn't scrape Vinted or work around its bot protection.",
  },
  WhatNot: {
    name: "Whatnot",
    orders: "Import CSV, or add orders by hand.",
    label: "Whatnot's prepaid label from the order.",
    listing: "Link listings by hand for now.",
  },
  Facebook: {
    name: "Facebook Marketplace",
    orders: "Add orders by hand, or Import CSV. Facebook has no API for personal Marketplace sellers.",
    label: "Facebook's prepaid label if your account has it, otherwise a Hubby label. Paste the tracking number into the Facebook order. Local pickup needs no label.",
    listing: "Link listings by hand. Facebook doesn't allow tools to post Marketplace listings for you.",
    note: "Shipped sales pay a 10% selling fee (at least $0.80). Local pickup sales have no fee.",
  },
  ThredUp: {
    name: "ThredUp",
    orders: "Add orders by hand. ThredUp has no seller API or export yet.",
    label: "Follow the shipping steps in the ThredUp order.",
    listing: "Link listings by hand.",
    note: "Only Direct Listing items, where you list and ship your own items (open beta since June 2026, 0% seller fees, ThredUp handles returns). Clean Out bag items are sold by ThredUp, not you, so they don't belong here.",
  },
  OfferUp: {
    name: "OfferUp",
    orders: "Add orders by hand, or Import CSV. OfferUp has no API for personal sellers.",
    label: "OfferUp's prepaid label for shipped sales. Local pickup needs no label.",
    listing: "Link listings by hand. OfferUp doesn't allow tools to post listings for you.",
    note: "Shipped sales pay about 12.9% (at least $1.99). Local pickup sales have no fee. Up to 12 photos per listing.",
  },
  Curtsy: {
    name: "Curtsy",
    orders: "Add orders by hand. Curtsy is app-only and has no seller API or export.",
    label: "Curtsy's prepaid label, emailed with each sale.",
    listing: "Link listings by hand.",
    note: "Curtsy shows your exact fee when you post. Hubby's fee estimate uses the commonly reported tiers.",
  },
  Grailed: {
    name: "Grailed",
    orders: "Add orders by hand, or Import CSV. Grailed has no public seller API.",
    label: "Grailed's prepaid label, or ship on your own with a Hubby label and add tracking in Grailed.",
    listing: "Link listings by hand.",
    note: "9% commission plus payment processing (3.49% + $0.49).",
  },
  Vestiaire: {
    name: "Vestiaire Collective",
    orders: "Add orders by hand. Vestiaire has no public seller API.",
    label: "Vestiaire's shipping label. Some items go to its authentication team before the buyer.",
    listing: "Link listings by hand.",
    note: "US items listed from Oct 15, 2026: $12 under $75, 17% up to $15,000, plus 3% processing ($3 minimum). Vestiaire won't take listings under $18.",
  },
  Shopify: {
    name: "Shopify store",
    orders: "Import Shopify's Orders CSV (Orders > Export). Connecting your store directly is a later step.",
    label: "Buy a Hubby label, then add tracking to the Shopify order.",
    listing: "Link products by hand for now.",
    note: "Your own store, so links can be on your own domain.",
  },
  SellSource: {
    name: "SellSource",
    orders: "Arrive by themselves when a buyer checks out on SellSource or in a live show.",
    label: "Buy a Hubby label or ship with your own, then add tracking to the order.",
    listing: "Turn on SellSource for an item and it's in your storefront right away.",
    note: "Hubby's own marketplace. 3% seller fee plus card processing.",
  },
  Other: {
    name: "Other",
    orders: "Add orders by hand, or Import CSV.",
    label: "Buy a Hubby label.",
    listing: "Track it by hand.",
  },
};
