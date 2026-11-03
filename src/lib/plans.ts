// SellSync's plans (Sell $12, Ship $25, Sync $35, Grow $50, Flow $100), in one place: names, monthly prices, what each one includes, and the checks
// the app uses to lock features. Each plan includes everything in the plans before it.
// The homepage, the Subscription settings, the upgrade prompts and the affiliate math all read this.

import type { InventoryItem, Platform } from "./types";

export type PlanId = "sell" | "ship" | "sync" | "grow" | "flow";
export const PLAN_IDS: PlanId[] = ["sell", "ship", "sync", "grow", "flow"];

export interface Plan {
  name: string;
  cents: number; // monthly price
  pitch: string;
  // What this plan adds on top of the one before it, for the plan cards.
  adds: string[];
  // Per-day cap on new listings, and how many marketplaces you can list on; null means no limit.
  listingsPerDay: number | null;
  marketplaces: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  sell: {
    name: "Sell",
    cents: 1200,
    pitch: "Your inventory in one place, listed on up to two marketplaces.",
    adds: ["Inventory manager", "20 new listings a day", "Up to 2 marketplaces"],
    listingsPerDay: 20,
    marketplaces: 2,
  },
  ship: {
    name: "Ship",
    cents: 2500,
    pitch: "Everything in Sell, plus your shipping labels.",
    adds: ["Print every marketplace's labels in one batch", "Compare and buy labels", "Packing slips and SKU on labels"],
    listingsPerDay: 20,
    marketplaces: 2,
  },
  // PLACEHOLDER: Sync's price and what it adds are waiting on a decision. Change them here.
  sync: {
    name: "Sync",
    cents: 3500,
    pitch: "Everything in Ship, kept in step across more marketplaces.",
    adds: ["Up to 4 marketplaces", "50 new listings a day", "Quantities adjust everywhere after a sale"],
    listingsPerDay: 50,
    marketplaces: 4,
  },
  grow: {
    name: "Grow",
    cents: 5000,
    pitch: "List everywhere at once, and delist the moment it sells.",
    adds: ["Crosslisting to every marketplace", "Delisting everywhere when an item sells", "Unlimited listings and marketplaces"],
    listingsPerDay: null,
    marketplaces: null,
  },
  flow: {
    name: "Flow",
    cents: 10000,
    pitch: "Everything, running on its own.",
    adds: ["Automations", "Video listings", "Backups and restore", "Full AI: listings from photos, and AI writing in your style"],
    listingsPerDay: null,
    marketplaces: null,
  },
};

export type Feature = "inventory" | "labels" | "quantitySync" | "crosslisting" | "delisting" | "automations" | "videoListing" | "backups" | "ai";

// The first plan that has each feature.
export const FEATURE_PLAN: Record<Feature, PlanId> = {
  inventory: "sell",
  labels: "ship",
  quantitySync: "sync",
  crosslisting: "grow",
  delisting: "grow",
  automations: "flow",
  videoListing: "flow",
  backups: "flow",
  ai: "flow",
};

export const FEATURE_NAMES: Record<Feature, string> = {
  inventory: "The inventory manager",
  labels: "Printing shipping labels",
  quantitySync: "Quantity sync after a sale",
  crosslisting: "Crosslisting",
  delisting: "Delisting everywhere",
  automations: "Automations",
  videoListing: "Video listing",
  backups: "Backup and restore",
  ai: "Full AI access",
};

// Early access: until billing is switched on, everyone starts on Flow and can pick any plan.
export const DEFAULT_PLAN: PlanId = "flow";

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as string[]).includes(v);
export const planOf = (v: unknown): PlanId => (isPlanId(v) ? v : DEFAULT_PLAN);
export const planRank = (p: PlanId) => PLAN_IDS.indexOf(p);
export const hasFeature = (plan: PlanId, f: Feature) => planRank(plan) >= planRank(FEATURE_PLAN[f]);

export const priceLabel = (p: PlanId) => `$${(PLANS[p].cents / 100).toFixed(PLANS[p].cents % 100 ? 2 : 0)}`;

// Items first listed today count toward the daily cap, whichever marketplaces they went to.
export const listedToday = (inventory: InventoryItem[], today: string) => inventory.filter((i) => i.listedAt === today).length;

// Marketplaces you're using now: any with an active listing.
export const marketplacesInUse = (inventory: InventoryItem[]) => {
  const s = new Set<Platform>();
  for (const i of inventory) for (const l of i.listings) if (l.status === "active") s.add(l.platform);
  return s;
};

// Which marketplaces a listing can go to on this plan: all of them, or, once the plan's limit is
// reached, only the ones already in use.
export function allowedMarketplaces(plan: PlanId, inventory: InventoryItem[], all: Platform[]): { allowed: Set<Platform>; limit: number | null; inUse: Set<Platform> } {
  const limit = PLANS[plan].marketplaces;
  const inUse = marketplacesInUse(inventory);
  if (limit === null || inUse.size < limit) return { allowed: new Set(all), limit, inUse };
  return { allowed: inUse, limit, inUse };
}

// Whether `adding` more items can be listed today, and how many are left.
export function listingRoom(plan: PlanId, inventory: InventoryItem[], today: string) {
  const cap = PLANS[plan].listingsPerDay;
  if (cap === null) return { cap, left: Infinity };
  return { cap, left: Math.max(0, cap - listedToday(inventory, today)) };
}
