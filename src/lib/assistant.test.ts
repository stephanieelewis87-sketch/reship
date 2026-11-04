import { describe, expect, it } from "vitest";
import { assistantAccess, demoAnswer, shopSnapshot } from "./assistant";
import { DEFAULT_SETTINGS, type InventoryItem, type Order } from "./types";

const today = "2026-11-03";
const inventory: InventoryItem[] = [
  { id: "1", sku: "BB-1", title: "Lululemon Align leggings", brand: "Lululemon", status: "listed", listedAt: "2026-07-01", listPrice: 48, cost: 6, location: "Bin 4", listings: [{ platform: "Poshmark", status: "active", views: 30, watchers: 4 }] },
  { id: "2", sku: "BB-2", title: "Nike hoodie", brand: "Nike", status: "listed", listedAt: "2026-10-25", listPrice: 30, cost: 5, listings: [{ platform: "Mercari", status: "active" }] },
  { id: "3", sku: "BB-3", title: "Madewell jeans", brand: "Madewell", status: "sold", soldAt: "2026-11-01", listPrice: 40, cost: 4, listings: [{ platform: "Depop", status: "sold" }] },
];
const orders: Order[] = [
  { id: "o1", platform: "Depop", orderId: "D1", buyer: "sam", items: [{ name: "Madewell jeans", sku: "BB-3", price: 40, brand: "Madewell" }], date: "2026-11-01", status: "pending", carrier: "USPS", source: "manual", fees: 4, shippingCost: 0 },
];
const shop = { inventory, orders, settings: { ...DEFAULT_SETTINGS, displayName: "Bin Babe", plan: "flow" as const } };

describe("AI helper", () => {
  it("answers how-to questions on Ship to Grow, and knows the shop on Flow", () => {
    for (const p of ["ship", "sell", "sync", "grow"] as const) expect(assistantAccess(p)).toEqual({ level: "helper", daily: 15, seesShop: false });
    expect(assistantAccess("flow")).toEqual({ level: "full", daily: 200, seesShop: true });
  });

  it("summarizes the shop with stale items, orders to ship and one line per item", () => {
    const s = shopSnapshot(shop, today);
    expect(s).toContain("Shop: Bin Babe");
    expect(s).toContain("2 listed, 0 drafts, 1 sold");
    expect(s).toContain("Listed over 60 days (1)");
    expect(s).toContain("BB-1 Lululemon Align leggings: 125 days");
    expect(s).toContain("1 need a label printed");
    expect(s).toContain("This month so far: 1 items sold, $40 in sales, $32 profit");
    expect(s).toMatch(/BB-1 \| Lululemon Align leggings \| Lululemon \| - \| \$48 \| \$6 \| 125 \| Poshmark \| Bin 4 \| 30\/4/);
    expect(s).not.toContain("sam"); // no buyer names
  });

  it("answers common questions in the demo from the sample shop", () => {
    expect(demoAnswer("What should I mark down?", shop, today)).toContain("Lululemon Align leggings");
    expect(demoAnswer("How much profit did I make this month?", shop, today)).toContain("$32");
    expect(demoAnswer("Which orders still need to ship?", shop, today)).toContain("1 order needs a label");
    expect(demoAnswer("Where did I put the lululemon leggings?", shop, today)).toContain("Bin 4");
    expect(demoAnswer("How do I crosslist an item?", shop, today)).toContain("Crosslist");
    expect(demoAnswer("tell me a joke", shop, today)).toContain("In the demo");
  });
});
