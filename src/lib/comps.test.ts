import { describe, expect, it } from "vitest";
import { COMP_COVERAGE, type Comp, byPlatform, compQuery, priceStats, sampleLiveComps, summarize, tokens, yourSales } from "./comps";
import type { Order } from "./types";

const order = (id: string, name: string, price: number, extra: Partial<Order> = {}): Order => ({
  id,
  platform: "Poshmark",
  orderId: id,
  buyer: "b",
  items: [{ name, price, brand: "Nike" }],
  date: `2026-10-${id.padStart(2, "0")}`,
  status: "shipped",
  carrier: "USPS",
  source: "manual",
  ...extra,
});

const comp = (price: number, state: Comp["state"], platform: Comp["platform"] = "eBay"): Comp => ({ id: `${platform}-${state}-${price}`, platform, title: "x", price, state, source: "api" });

describe("search words", () => {
  it("drops filler words and keeps sizes", () => {
    expect(tokens("Nike Tech Fleece Hoodie, size L for men")).toEqual(["nike", "tech", "fleece", "hoodie", "l"]);
  });

  it("doesn't repeat the brand", () => {
    expect(compQuery({ brand: "Nike", title: "Nike Air Max 90" })).toBe("Nike Air Max 90");
    expect(compQuery({ brand: "Unbranded", title: "Leather Belt" })).toBe("Leather Belt");
    expect(compQuery({ brand: "Lululemon", title: "Align leggings 6" })).toBe("Lululemon Align leggings 6");
  });
});

describe("your own sales", () => {
  const orders = [order("1", "Tech Fleece Hoodie Black", 60), order("2", "Air Max 90", 80), order("3", "Tech Fleece Joggers", 45), order("4", "Tech Fleece Hoodie Grey", 0)];

  it("finds sold items with every search word, brand included, newest first", () => {
    const out = yourSales("nike tech fleece hoodie", orders);
    expect(out.map((c) => c.price)).toEqual([60]);
    expect(out[0]).toMatchObject({ state: "sold", source: "yours", platform: "Poshmark" });
  });

  it("falls back to close matches when nothing matches every word", () => {
    expect(yourSales("tech fleece vest", orders).map((c) => c.price)).toEqual([45, 60]);
  });

  it("skips items without a price", () => {
    expect(yourSales("grey", orders)).toEqual([]);
  });
});

describe("price summary", () => {
  it("works out median and middle half", () => {
    expect(priceStats([10, 20, 30, 40, 50])).toEqual({ count: 5, low: 10, high: 50, median: 30, p25: 20, p75: 40 });
    expect(priceStats([])).toBeNull();
  });

  it("suggests a range from sales, or from asking prices when sales are thin", () => {
    expect(summarize([comp(20, "sold"), comp(30, "sold"), comp(40, "sold"), comp(90, "active")]).suggested).toEqual({ low: 25, high: 35, basis: "sold" });
    expect(summarize([comp(20, "sold"), comp(40, "active"), comp(50, "active"), comp(60, "active")]).suggested).toEqual({ low: 45, high: 55, basis: "asking" });
    expect(summarize([comp(20, "sold")]).suggested).toBeNull();
  });

  it("lines marketplaces up side by side", () => {
    const rows = byPlatform([comp(20, "sold"), comp(30, "active"), comp(25, "sold", "Poshmark")]);
    expect(rows[0]).toMatchObject({ platform: "eBay", sold: { median: 20 }, active: { median: 30 } });
    expect(rows[1]).toMatchObject({ platform: "Poshmark", active: null });
  });
});

describe("marketplace coverage", () => {
  it("only pulls data in where there's an official API", () => {
    const live = COMP_COVERAGE.filter((c) => c.inApp.active === "yes" || c.inApp.sold !== "no").map((c) => c.platform);
    expect(live.sort()).toEqual(["Etsy", "eBay"]);
  });

  it("puts the search in each marketplace's own link", () => {
    const posh = COMP_COVERAGE.find((c) => c.platform === "Poshmark")!;
    expect(posh.soldUrl!("nike tech")).toBe("https://poshmark.com/search?query=nike%20tech&availability=sold_out");
    for (const c of COMP_COVERAGE) expect(c.activeUrl("a&b")).toContain("a%26b");
  });

  it("marks demo results as samples and keeps them stable", () => {
    const a = sampleLiveComps("nike tech fleece");
    expect(a.comps.length).toBeGreaterThan(0);
    expect(a.comps.every((c) => c.source === "sample")).toBe(true);
    expect(sampleLiveComps("nike tech fleece").comps.map((c) => c.price)).toEqual(a.comps.map((c) => c.price));
  });
});
