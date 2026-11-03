import Papa from "papaparse";
import type { InventoryItem, ItemChange, Listing, Order } from "./types";
import { ALL_PLATFORMS } from "./types";
import { duplicateSkus, isPartiallyDelisted } from "./inventory";

// Inventory Guardian: Reship's own record of every item is the master copy. It keeps dated
// backups of it, a history of every change, watches for listings that lost their link to an
// item, and pauses big destructive changes until the owner says yes. Restoring only changes
// Reship's records; it never edits or relists anything on a marketplace.

// ---- Change history ----

const FIELDS: [keyof InventoryItem, string][] = [
  ["sku", "SKU"],
  ["title", "Title"],
  ["status", "Status"],
  ["listPrice", "Price"],
  ["cost", "Cost"],
  ["quantity", "Quantity"],
  ["location", "Location"],
  ["brand", "Brand"],
  ["category", "Category"],
  ["size", "Size"],
  ["color", "Color"],
  ["condition", "Condition"],
  ["description", "Description"],
  ["notes", "Notes"],
  ["source", "Bought at"],
  ["soldAt", "Sold on"],
];

const show = (v: unknown) => {
  if (v == null || v === "") return "";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};

const listingText = (l?: Listing) => (l ? [l.status, l.price != null ? `$${l.price}` : "", l.listingId ? `#${l.listingId}` : ""].filter(Boolean).join(" ") : "");

// What changed between two versions of one item, in words.
export function diffItem(before: InventoryItem, after: InventoryItem): ItemChange["changes"] {
  const out: ItemChange["changes"] = [];
  for (const [k, label] of FIELDS) {
    const a = show(before[k]);
    const b = show(after[k]);
    if (a !== b) out.push({ field: label, from: a, to: b });
  }
  for (const p of ALL_PLATFORMS) {
    const a = listingText(before.listings.find((l) => l.platform === p));
    const b = listingText(after.listings.find((l) => l.platform === p));
    if (a !== b) out.push({ field: `${p} listing`, from: a, to: b });
  }
  if ((before.photos ?? []).join() !== (after.photos ?? []).join() && (before.photos?.length || after.photos?.length))
    out.push({ field: "Photos", from: `${before.photos?.length ?? 0} photos`, to: `${after.photos?.length ?? 0} photos` });
  if ((before.labels ?? []).join() !== (after.labels ?? []).join()) out.push({ field: "Labels", from: `${before.labels?.length ?? 0}`, to: `${after.labels?.length ?? 0}` });
  return out;
}

// History entries for a save: one per item that's new or actually changed.
export function changesForSave(prev: InventoryItem[], changed: InventoryItem[], source: string, at = new Date().toISOString()): ItemChange[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  return changed.flatMap((item): ItemChange[] => {
    const before = byId.get(item.id);
    if (!before) return [{ id: crypto.randomUUID(), itemId: item.id, sku: item.sku, at, source, kind: "created", changes: [] }];
    const changes = diffItem(before, item);
    return changes.length ? [{ id: crypto.randomUUID(), itemId: item.id, sku: item.sku, at, source, kind: "edited", changes }] : [];
  });
}

export const changesForDelete = (items: InventoryItem[], source: string, at = new Date().toISOString()): ItemChange[] =>
  items.map((i) => ({ id: crypto.randomUUID(), itemId: i.id, sku: i.sku, at, source, kind: "deleted", changes: [{ field: "Item", from: i.title, to: "" }] }));

// ---- Sync protection ----

// A change that loses information: an item's SKU changes, it's marked sold or delisted, a
// listing disappears or stops being active, or a field is emptied.
export function isDestructive(before: InventoryItem, after: InventoryItem): boolean {
  if (before.sku.trim() !== after.sku.trim()) return true;
  if (before.status !== after.status && after.status !== "listed") return true;
  for (const l of before.listings) {
    const now = after.listings.find((x) => x.platform === l.platform);
    if (!now) return true;
    if (l.status === "active" && now.status !== "active") return true;
    if (l.listingId && now.listingId !== l.listingId) return true;
  }
  return FIELDS.some(([k]) => show(before[k]) !== "" && show(after[k]) === "");
}

// How many existing items a save would change destructively.
export function destructiveCount(prev: InventoryItem[], changed: InventoryItem[]): number {
  const byId = new Map(prev.map((i) => [i.id, i]));
  return changed.filter((i) => byId.has(i.id) && isDestructive(byId.get(i.id)!, i)).length;
}

// ---- Listing monitoring ----

export type IssueKind = "duplicate-sku" | "no-sku" | "duplicate-listing" | "possible-duplicate" | "sale-not-linked" | "still-listed" | "not-connected";

export interface GuardianIssue {
  kind: IssueKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  itemIds: string[];
  orderIds?: string[];
  groups?: string[][]; // look-alike items, one group per item they might all be
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Things that suggest a listing has come apart from its item, or an item has been entered twice.
export function checkInventory(inventory: InventoryItem[], orders: Order[]): GuardianIssue[] {
  const issues: GuardianIssue[] = [];

  const dupes = duplicateSkus(inventory);
  for (const sku of dupes) {
    const items = inventory.filter((i) => norm(i.sku) === sku);
    issues.push({ kind: "duplicate-sku", severity: "high", title: `SKU ${items[0].sku} is on ${items.length} items`, detail: "Sales can be matched to the wrong item. Give each one its own SKU.", itemIds: items.map((i) => i.id) });
  }

  const noSku = inventory.filter((i) => !i.sku.trim());
  if (noSku.length) issues.push({ kind: "no-sku", severity: "high", title: `${noSku.length} item${noSku.length > 1 ? "s have" : " has"} no SKU`, detail: "Without a SKU, Reship can't match a sale to the item.", itemIds: noSku.map((i) => i.id) });

  // The same marketplace listing linked to two items.
  const byListing = new Map<string, InventoryItem[]>();
  for (const i of inventory)
    for (const l of i.listings)
      if (l.listingId?.trim()) {
        const key = `${l.platform}:${l.listingId.trim()}`;
        byListing.set(key, [...(byListing.get(key) ?? []), i]);
      }
  for (const [key, items] of byListing)
    if (items.length > 1) {
      const [platform, id] = key.split(/:(.*)/);
      issues.push({ kind: "duplicate-listing", severity: "high", title: `${platform} listing ${id} is linked to ${items.length} items`, detail: "One listing should belong to one item. Merge them or fix the listing ID.", itemIds: items.map((i) => i.id) });
    }

  // Unsold items that look the same: probably one item imported once per marketplace.
  const groups = new Map<string, InventoryItem[]>();
  for (const i of inventory)
    if (i.status !== "sold" && norm(i.title)) {
      const key = [norm(i.title), norm(i.brand), norm(i.size)].join("|");
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
  const lookAlikes = [...groups.values()].filter((items) => items.length > 1 && new Set(items.map((i) => norm(i.sku))).size > 1);
  if (lookAlikes.length)
    issues.push({
      kind: "possible-duplicate",
      severity: "medium",
      title: `${lookAlikes.length} item${lookAlikes.length > 1 ? "s look" : " looks"} like ${lookAlikes.length > 1 ? "they were" : "it was"} entered more than once`,
      detail: "Same title, brand and size under different SKUs. If one is a single item listed on several marketplaces, merge them so a sale takes it down everywhere.",
      itemIds: lookAlikes.flat().map((i) => i.id),
      groups: lookAlikes.map((g) => g.map((i) => i.id)),
    });

  // Sales whose SKU matches no item.
  const skus = new Set(inventory.map((i) => norm(i.sku)).filter(Boolean));
  const unlinked = orders.filter((o) => o.shipment?.status !== "cancelled" && o.status !== "shipped" && o.items.some((l) => !l.sku?.trim() || !skus.has(norm(l.sku))));
  if (unlinked.length)
    issues.push({ kind: "sale-not-linked", severity: "medium", title: `${unlinked.length} open order${unlinked.length > 1 ? "s don't" : " doesn't"} match an item`, detail: "Their SKU is missing or isn't in Inventory, so the item won't be marked sold or taken down elsewhere.", itemIds: [], orderIds: unlinked.map((o) => o.id) });

  const partial = inventory.filter(isPartiallyDelisted);
  if (partial.length) issues.push({ kind: "still-listed", severity: "high", title: `${partial.length} sold item${partial.length > 1 ? "s are" : " is"} still listed elsewhere`, detail: "Someone could buy it twice. Take the other listings down.", itemIds: partial.map((i) => i.id) });

  const loose = inventory.filter((i) => i.listings.some((l) => l.status === "active" && !l.listingId && !l.url));
  if (loose.length)
    issues.push({ kind: "not-connected", severity: "low", title: `${loose.length} item${loose.length > 1 ? "s have" : " has"} listings without a marketplace link`, detail: "Add the listing link or ID so SellSync can always find the listing again.", itemIds: loose.map((i) => i.id) });

  const rank = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// Folds `other` into `keep`: listings from both, quantities added, empty fields filled.
export function mergeItems(keep: InventoryItem, other: InventoryItem): InventoryItem {
  const listings = [...keep.listings];
  for (const l of other.listings) if (!listings.some((x) => x.platform === l.platform)) listings.push(l);
  const has = (v: unknown) => v != null && v !== "";
  const kept = Object.fromEntries(Object.entries(keep).filter(([, v]) => has(v))) as unknown as InventoryItem;
  return {
    ...other,
    ...kept,
    id: keep.id,
    sku: keep.sku,
    listings,
    quantity: keep.status === "sold" ? keep.quantity : Math.max(1, keep.quantity ?? 1),
    photos: [...new Set([...(keep.photos ?? []), ...(other.photos ?? [])])],
    labels: [...new Set([...(keep.labels ?? []), ...(other.labels ?? [])])],
    status: listings.some((l) => l.status === "active") && keep.status !== "sold" ? "listed" : keep.status,
    updatedAt: new Date().toISOString(),
  };
}

// ---- Backups and recovery ----

export interface RestorePlan {
  missing: InventoryItem[]; // in the backup, gone now: will be added back
  changed: { backup: InventoryItem; current: InventoryItem; changes: ItemChange["changes"] }[]; // will be put back
  added: InventoryItem[]; // new since the backup: left alone
}

export function planRestore(backup: InventoryItem[], current: InventoryItem[]): RestorePlan {
  const now = new Map(current.map((i) => [i.id, i]));
  const then = new Set(backup.map((i) => i.id));
  const plan: RestorePlan = { missing: [], changed: [], added: current.filter((i) => !then.has(i.id)) };
  for (const b of backup) {
    const c = now.get(b.id);
    if (!c) plan.missing.push(b);
    else {
      const changes = diffItem(c, b);
      if (changes.length) plan.changed.push({ backup: b, current: c, changes });
    }
  }
  return plan;
}

// Keep every manual backup, and the newest 30 automatic ones.
export function backupsToPrune(backups: { id: string; reason: string; createdAt: string }[], keep = 30): string[] {
  return backups
    .filter((b) => b.reason === DAILY)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(keep)
    .map((b) => b.id);
}
export const DAILY = "Daily backup";

export const needsDailyBackup = (latest: string | undefined, now = new Date()) => !latest || now.getTime() - new Date(latest).getTime() > 20 * 3600 * 1000;

// ---- Export ----

export function inventoryCsv(items: InventoryItem[]): string {
  return Papa.unparse(
    items.map((i) => ({
      SKU: i.sku,
      Title: i.title,
      Status: i.status,
      Location: i.location ?? "",
      Quantity: i.quantity ?? 1,
      Price: i.listPrice ?? "",
      Cost: i.cost ?? "",
      Brand: i.brand ?? "",
      Category: i.category ?? "",
      Size: i.size ?? "",
      Color: i.color ?? "",
      Condition: i.condition ?? "",
      "Bought at": i.source ?? "",
      "Bought on": i.purchasedAt ?? "",
      "Listed on": i.listedAt ?? "",
      "Sold on": i.soldAt ?? "",
      ...Object.fromEntries(
        ALL_PLATFORMS.flatMap((p) => {
          const l = i.listings.find((x) => x.platform === p);
          return [
            [`${p} status`, l?.status ?? ""],
            [`${p} listing ID`, l?.listingId ?? ""],
            [`${p} link`, l?.url ?? ""],
          ];
        }),
      ),
      Description: i.description ?? "",
      Notes: i.notes ?? "",
      "Reship ID": i.id,
    })),
  );
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Pulls a listing ID out of a pasted marketplace link, or keeps a pasted ID as it is.
export function parseListingRef(text: string): { listingId?: string; url?: string } {
  const t = text.trim();
  if (!t) return {};
  if (!/^https?:\/\//i.test(t)) return { listingId: t };
  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    // eBay /itm/123, Mercari /item/m123, Poshmark /listing/title-abc123, Etsy /listing/123/title, Depop /products/x, Vinted /items/123-title,
    // Facebook /marketplace/item/123, ThredUp /product/title/123
    const after = (w: string) => (parts.includes(w) ? parts[parts.indexOf(w) + 1] : undefined);
    const raw = after("itm") ?? after("item") ?? after("items") ?? after("listing") ?? after("products") ?? parts[parts.length - 1];
    let id = raw ?? "";
    if (u.hostname.includes("poshmark")) id = id.split("-").pop() ?? id;
    else if (u.hostname.includes("vinted")) id = id.split("-")[0];
    return { url: t, listingId: id || undefined };
  } catch {
    return { listingId: t };
  }
}
