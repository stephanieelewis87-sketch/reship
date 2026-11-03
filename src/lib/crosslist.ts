import type { Platform } from "./types";

// One item, written once, that the extension fills into each marketplace's own sell form.
export interface ListingDraft {
  title: string;
  description: string;
  price: number;
  // Photo addresses (https or data URLs), first one is the cover photo.
  photos: string[];
  sku?: string;
  brand?: string;
  size?: string;
  color?: string;
  category?: string;
  condition?: Condition;
}

// Reship's own condition scale; each marketplace names these differently.
export type Condition = "new_with_tags" | "new_without_tags" | "like_new" | "good" | "fair" | "poor";

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "new_with_tags", label: "New with tags" },
  { value: "new_without_tags", label: "New without tags" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export interface MarketplaceRules {
  titleMax: number;
  descriptionMax: number;
  photosMax: number;
  priceMin: number;
  priceMax: number;
  // The option to pick on the marketplace's sell form for each Reship condition.
  conditions: Record<Condition, string>;
  // What the seller still picks on the marketplace's form, because it uses the marketplace's own lists.
  sellerPicks: string[];
}

// Limits as the marketplaces' sell forms enforced them in October 2026.
export const CROSSLIST_RULES: Partial<Record<Platform, MarketplaceRules>> = {
  Mercari: {
    titleMax: 80,
    descriptionMax: 1000,
    photosMax: 12,
    priceMin: 1,
    priceMax: 2000,
    conditions: {
      new_with_tags: "New",
      new_without_tags: "Like new",
      like_new: "Like new",
      good: "Good",
      fair: "Fair",
      poor: "Poor",
    },
    sellerPicks: ["category", "brand", "shipping"],
  },
  Vinted: {
    titleMax: 100,
    descriptionMax: 2000,
    photosMax: 20,
    priceMin: 1,
    priceMax: 5000,
    conditions: {
      new_with_tags: "New with tags",
      new_without_tags: "New without tags",
      like_new: "Very good",
      good: "Good",
      fair: "Satisfactory",
      poor: "Satisfactory",
    },
    sellerPicks: ["category", "brand", "size", "package size"],
  },
};

export const CROSSLIST_PLATFORMS = Object.keys(CROSSLIST_RULES) as Platform[];

export const canCrosslist = (platform: Platform) => platform in CROSSLIST_RULES;

// Problems that stop a draft from listing on this marketplace, in plain words. Anything the
// draft has too much of (title length, photos) is trimmed by fitDraft instead.
export function checkDraft(platform: Platform, draft: ListingDraft): string[] {
  const rules = CROSSLIST_RULES[platform];
  if (!rules) return [`Reship can't list on ${platform} yet.`];
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("Add a title.");
  if (!draft.description.trim()) problems.push("Add a description.");
  if (!draft.photos.length) problems.push("Add at least one photo.");
  if (!(draft.price >= rules.priceMin)) problems.push(`${platform} needs a price of at least $${rules.priceMin}.`);
  if (draft.price > rules.priceMax) problems.push(`${platform} doesn't allow prices over $${rules.priceMax.toLocaleString()}.`);
  return problems;
}

// The draft cut to fit the marketplace: title and description at a word break, extra photos left
// off, and the SKU added to the description when the marketplace has no SKU field.
export function fitDraft(platform: Platform, draft: ListingDraft): ListingDraft {
  const rules = CROSSLIST_RULES[platform];
  if (!rules) return draft;
  const sku = draft.sku ? `\n\nSKU: ${draft.sku}` : "";
  return {
    ...draft,
    title: clip(draft.title.trim(), rules.titleMax),
    description: clip(draft.description.trim(), rules.descriptionMax - sku.length) + sku,
    photos: draft.photos.slice(0, rules.photosMax),
    price: Math.round(draft.price * 100) / 100,
  };
}

export function conditionLabel(platform: Platform, condition: Condition | undefined): string | undefined {
  return condition ? CROSSLIST_RULES[platform]?.conditions[condition] : undefined;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

// A crosslist or delist request, queued by the app and carried out by the browser extension.
export type ListingJobStatus = "queued" | "running" | "needs_you" | "done" | "failed" | "cancelled";

export interface ListingJob {
  id: string;
  platform: Platform;
  action: "list" | "delist";
  draft?: ListingDraft;
  listingId?: string;
  inventoryItemId?: string;
  sku?: string;
  status: ListingJobStatus;
  message?: string;
  reason?: string;
  createdAt: string;
}

// A listing on one marketplace that Reship made or knows about.
export interface MarketplaceListing {
  platform: Platform;
  listingId: string;
  url?: string;
  sku?: string;
  inventoryItemId?: string;
  status: "active" | "delisted" | "sold";
}

export interface ListingJobRow {
  id: string;
  platform: string;
  action: "list" | "delist";
  draft: ListingDraft | null;
  listing_id: string | null;
  inventory_item_id: string | null;
  sku: string | null;
  status: ListingJobStatus;
  message: string | null;
  reason: string | null;
  created_at: string;
}

export const jobFromRow = (r: ListingJobRow): ListingJob => ({
  id: r.id,
  platform: r.platform as Platform,
  action: r.action,
  draft: r.draft ?? undefined,
  listingId: r.listing_id ?? undefined,
  inventoryItemId: r.inventory_item_id ?? undefined,
  sku: r.sku ?? undefined,
  status: r.status,
  message: r.message ?? undefined,
  reason: r.reason ?? undefined,
  createdAt: r.created_at,
});
