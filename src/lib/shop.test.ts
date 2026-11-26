import { describe, expect, it } from "vitest";
import { type ShopResult, applyFilters, itemFromPurchase, sampleShop, searchLinks, sortResults } from "./shop";

const r = (over: Partial<ShopResult>): ShopResult => ({ id: "1", platform: "eBay", title: "Jeans", price: 20, url: "https://www.ebay.com/itm/1", source: "api", ...over });

describe("Shop", () => {
  it("opens a search on every marketplace without an API", () => {
    const links = searchLinks("levi's 501");
    expect(links.map((l) => l.platform)).toContain("Poshmark");
    expect(links.find((l) => l.platform === "Mercari")?.url).toBe("https://www.mercari.com/search/?keyword=levi's%20501");
    expect(links.some((l) => l.platform === "eBay")).toBe(false); // eBay shows in the results instead
  });
  it("filters by price and condition", () => {
    const list = [r({ id: "a", price: 10, condition: "New with tags" }), r({ id: "b", price: 50, condition: "Pre-owned" })];
    expect(applyFilters(list, { maxPrice: 20 }).map((x) => x.id)).toEqual(["a"]);
    expect(applyFilters(list, { condition: "used" }).map((x) => x.id)).toEqual(["b"]);
  });
  it("sorts by price with shipping", () => {
    const list = [r({ id: "a", price: 10, shipping: 15 }), r({ id: "b", price: 20, shipping: 0 })];
    expect(sortResults(list, "low").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("turns a purchase into an inventory draft with its cost", () => {
    const item = itemFromPurchase(r({ title: "Patagonia fleece", image: "i.jpg" }), 23.456, "RS-0100", "id1", "2026-11-26");
    expect(item).toMatchObject({ sku: "RS-0100", cost: 23.46, source: "eBay", purchasedAt: "2026-11-26", status: "draft", photo: "i.jpg" });
  });
  it("marks demo results as samples", () => expect(sampleShop("coach").results.every((x) => x.source === "sample")).toBe(true));
});
