import type { InventoryItem, Listing, Order, Platform, Settings } from "./types";
import { daysBetween, isoDay } from "./analytics";

// Marketplaces where the item is up for sale right now.
export const listedOn = (item: InventoryItem): Platform[] => item.listings.filter((l) => l.status === "active").map((l) => l.platform);

export const listingOn = (item: InventoryItem, platform: Platform): Listing | undefined => item.listings.find((l) => l.platform === platform);

// A listing relisted in the last week, and one that hasn't been relisted in two months.
export const RECENT_RELIST_DAYS = 7;
export const STALE_RELIST_DAYS = 60;

export function relistState(l: Listing, today = isoDay(new Date())): "recent" | "stale" | null {
  if (l.status !== "active") return null;
  const last = l.relistedAt ?? l.listedAt;
  if (!last) return null;
  const age = daysBetween(last, today);
  if (l.relistedAt && age <= RECENT_RELIST_DAYS) return "recent";
  if (age > STALE_RELIST_DAYS) return "stale";
  return null;
}

// Sold on one marketplace but still listed on another: someone could buy it twice.
export const isPartiallyDelisted = (item: InventoryItem) => item.status === "sold" && item.listings.some((l) => l.status === "active");

const skuKey = (s?: string) => s?.trim().toLowerCase() || "";

// When an order comes in for an item, mark it sold on that marketplace. Its other listings stay
// active until they're really taken down (by the extension, or by hand), so the app shows them as
// partially delisted instead of pretending. Returns only the items that changed.
export function applySales(inventory: InventoryItem[], orders: Order[], settings: Settings): InventoryItem[] {
  const bySku = new Map(inventory.filter((i) => skuKey(i.sku)).map((i) => [skuKey(i.sku), i]));
  const changed = new Map<string, InventoryItem>();
  for (const order of orders) {
    if (order.shipment?.status === "cancelled") continue;
    for (const line of order.items) {
      const item = changed.get(bySku.get(skuKey(line.sku))?.id ?? "") ?? bySku.get(skuKey(line.sku));
      if (!item) continue;
      if (item.status === "sold" || item.soldOrders?.includes(order.id)) continue;
      const qty = item.quantity ?? 1;
      const soldOrders = [...(item.soldOrders ?? []), order.id];
      // With more than one on hand, a sale only lowers the count.
      if (qty > 1 && settings.autoAdjustQuantity) {
        changed.set(item.id, { ...item, quantity: qty - 1, soldOrders });
        continue;
      }
      const listings = item.listings.map((l): Listing => (l.platform === order.platform ? { ...l, status: "sold" } : l));
      if (!listings.some((l) => l.platform === order.platform)) listings.push({ platform: order.platform, status: "sold", listedAt: item.listedAt });
      const next: InventoryItem = { ...item, status: "sold", soldAt: item.soldAt ?? order.date, listings, soldOrders };
      changed.set(item.id, next);
    }
  }
  return [...changed.values()];
}

// SKUs used by more than one item.
export function duplicateSkus(inventory: InventoryItem[]): Set<string> {
  const seen = new Map<string, number>();
  inventory.forEach((i) => skuKey(i.sku) && seen.set(skuKey(i.sku), (seen.get(skuKey(i.sku)) ?? 0) + 1));
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

export const nextSku = (inventory: InventoryItem[], prefix = "RS") => {
  const nums = inventory.map((i) => Number(i.sku.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1] ?? 0));
  return `${prefix}-${String(Math.max(1000, ...nums) + 1)}`;
};

// The price for one marketplace after the seller's pricing rule, rounded to whole dollars.
export const priceFor = (base: number | undefined, platform: Platform, settings: Settings) =>
  base == null ? undefined : Math.round(base * (1 + (settings.pricingRules[platform] ?? 0) / 100));
