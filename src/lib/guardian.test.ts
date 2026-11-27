import { describe, expect, it } from "vitest";
import { backupsToPrune, changesForSave, checkInventory, destructiveCount, diffItem, inventoryCsv, mergeItems, parseListingRef, planRestore, DAILY } from "./guardian";
import type { InventoryItem, Order } from "./types";

const item = (id: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({ id, sku: `BB-${id}`, title: `Item ${id}`, status: "listed", listings: [{ platform: "Poshmark", status: "active" }], ...extra });

describe("change history", () => {
  it("lists the fields that changed, in words", () => {
    const a = item("1", { listPrice: 20 });
    const b = { ...a, listPrice: 25, location: "Bin 4", listings: [{ platform: "Poshmark" as const, status: "delisted" as const }] };
    expect(diffItem(a, b).map((c) => c.field)).toEqual(["Price", "Location", "Poshmark listing"]);
  });

  it("records new items and skips saves that changed nothing", () => {
    const a = item("1");
    const out = changesForSave([a], [a, item("2")], "You");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: "2", kind: "created", source: "You" });
  });
});

describe("sync protection", () => {
  it("counts only changes that lose something", () => {
    const prev = [item("1"), item("2"), item("3", { cost: 4 })];
    const changed = [
      { ...prev[0], listPrice: 30 }, // a price change is fine
      { ...prev[1], listings: [{ platform: "Poshmark" as const, status: "delisted" as const }] }, // delisted
      { ...prev[2], cost: undefined }, // emptied
      item("4"), // new
    ];
    expect(destructiveCount(prev, changed)).toBe(2);
  });
});

describe("listing checks", () => {
  it("finds duplicate SKUs, shared listing IDs, look-alikes and unlinked sales", () => {
    const inv = [
      item("1", { sku: "BB-1", title: "Levi's 501", size: "28", listings: [{ platform: "eBay", status: "active", listingId: "99" }] }),
      item("2", { sku: "BB-1", title: "Other" }),
      item("3", { sku: "BB-3", title: "Levi's 501 ", size: "28", listings: [{ platform: "eBay", status: "active", listingId: "99" }] }),
    ];
    const orders = [{ id: "o1", platform: "eBay", orderId: "1", buyer: "x", items: [{ name: "Thing", sku: "NOPE" }], date: "2026-01-01", status: "pending", carrier: "", source: "manual" } as Order];
    const kinds = checkInventory(inv, orders).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["duplicate-sku", "duplicate-listing", "possible-duplicate", "sale-not-linked", "not-connected"]));
  });

  it("is quiet for a healthy inventory", () => {
    expect(checkInventory([item("1", { listings: [{ platform: "eBay", status: "active", listingId: "5" }] })], [])).toEqual([]);
  });
});

describe("merging", () => {
  it("keeps the first item's SKU and takes listings and missing details from the other", () => {
    const a = item("1", { brand: undefined, listings: [{ platform: "Poshmark", status: "active" }] });
    const b = item("2", { brand: "Levi's", listings: [{ platform: "eBay", status: "active" }] });
    const m = mergeItems(a, b);
    expect(m.sku).toBe("BB-1");
    expect(m.brand).toBe("Levi's");
    expect(m.listings.map((l) => l.platform)).toEqual(["Poshmark", "eBay"]);
  });
});

describe("backups", () => {
  it("plans a restore: deleted items come back, changed ones are put back, new ones stay", () => {
    const backup = [item("1"), item("2", { listPrice: 10 })];
    const now = [{ ...backup[1], listPrice: 99 }, item("3")];
    const plan = planRestore(backup, now);
    expect(plan.missing.map((i) => i.id)).toEqual(["1"]);
    expect(plan.changed[0].changes[0]).toEqual({ field: "Price", from: "99", to: "10" });
    expect(plan.added.map((i) => i.id)).toEqual(["3"]);
  });

  it("keeps 30 daily backups and every other one", () => {
    const list = Array.from({ length: 33 }, (_, n) => ({ id: `d${n}`, reason: DAILY, createdAt: `2026-01-${String(n + 1).padStart(2, "0")}` }));
    list.push({ id: "manual", reason: "Backup", createdAt: "2025-01-01" });
    expect(backupsToPrune(list).sort()).toEqual(["d0", "d1", "d2"]);
  });

  it("exports a spreadsheet with a column per marketplace listing", () => {
    const csv = inventoryCsv([item("1", { location: "Bin 4", listings: [{ platform: "eBay", status: "active", listingId: "123" }] })]);
    expect(csv.split("\n")[0]).toContain("eBay listing ID");
    expect(csv).toContain("Bin 4");
    expect(csv).toContain("123");
  });
});

describe("listing links", () => {
  it("pulls the listing ID out of marketplace links", () => {
    expect(parseListingRef("https://www.ebay.com/itm/1234567890")).toMatchObject({ listingId: "1234567890" });
    expect(parseListingRef("https://www.mercari.com/us/item/m12345/")).toMatchObject({ listingId: "m12345" });
    expect(parseListingRef("https://poshmark.com/listing/Levis-501-Jeans-65a1b2c3d4")).toMatchObject({ listingId: "65a1b2c3d4" });
    expect(parseListingRef("https://www.vinted.com/items/4567-levis-jeans")).toMatchObject({ listingId: "4567" });
    expect(parseListingRef("https://www.etsy.com/listing/998877/vintage-top")).toMatchObject({ listingId: "998877" });
    expect(parseListingRef("https://www.facebook.com/marketplace/item/1122334455/?ref=share")).toMatchObject({ listingId: "1122334455" });
    expect(parseListingRef("https://www.thredup.com/product/women-levis-blue-jeans/223344556")).toMatchObject({ listingId: "223344556" });
    expect(parseListingRef(" 42 ")).toEqual({ listingId: "42" });
  });
});
