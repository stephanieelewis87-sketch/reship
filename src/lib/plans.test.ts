import { describe, expect, it } from "vitest";
import type { InventoryItem } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { PLANS, PLAN_IDS, hasFeature, listingRoom, marketplacesInUse, planOf } from "./plans";
import { applySales } from "./inventory";

const item = (id: string, platforms: InventoryItem["listings"][number]["platform"][], listedAt?: string): InventoryItem => ({
  id,
  sku: id,
  title: id,
  status: "listed",
  listedAt,
  listings: platforms.map((platform) => ({ platform, status: "active" })),
});

describe("plans", () => {
  it("costs $12, $25, $35, $50 and $100, in order", () => {
    expect(PLAN_IDS.map((p) => PLANS[p].cents)).toEqual([1200, 2500, 3500, 5000, 10000]);
  });

  it("includes everything in the plans below", () => {
    expect(hasFeature("sell", "inventory")).toBe(true);
    expect(hasFeature("sell", "labels")).toBe(false);
    expect(hasFeature("ship", "labels")).toBe(true);
    expect(hasFeature("ship", "crosslisting")).toBe(false);
    expect(hasFeature("grow", "crosslisting")).toBe(true);
    expect(hasFeature("grow", "delisting")).toBe(true);
    expect(hasFeature("grow", "videoListing")).toBe(false);
    for (const f of ["automations", "videoListing", "backups", "ai", "labels"] as const) expect(hasFeature("flow", f)).toBe(true);
  });

  it("falls back to Flow for a missing or unknown plan during early access", () => {
    expect(planOf(undefined)).toBe("flow");
    expect(planOf("pro")).toBe("flow");
    expect(planOf("ship")).toBe("ship");
  });

  it("caps Sell at 20 new listings a day and 2 marketplaces", () => {
    const today = "2026-11-03";
    const inv = Array.from({ length: 19 }, (_, i) => item(`a${i}`, ["Poshmark"], today));
    expect(listingRoom("sell", inv, today)).toEqual({ cap: 20, left: 1 });
    expect(listingRoom("sell", [...inv, item("b", ["Mercari"], today)], today).left).toBe(0);
    expect(listingRoom("grow", inv, today).cap).toBeNull();
    expect([...marketplacesInUse([item("c", ["Poshmark", "Mercari"]), item("d", ["eBay"])])].sort()).toEqual(["Mercari", "Poshmark", "eBay"]);
    expect(PLANS.sell.marketplaces).toBe(2);
    expect(PLANS.grow.marketplaces).toBeNull();
  });

  it("only lowers the count after a sale on Sync and up", () => {
    const stock = { ...item("e", ["Poshmark"]), quantity: 3 };
    const order = { id: "o1", platform: "Poshmark", items: [{ sku: "e" }] } as unknown as Parameters<typeof applySales>[1][number];
    expect(applySales([stock], [order], { ...DEFAULT_SETTINGS, plan: "sync" })[0].quantity).toBe(2);
    expect(applySales([stock], [order], { ...DEFAULT_SETTINGS, plan: "ship" })[0].status).toBe("sold");
  });
});
