import { describe, expect, it } from "vitest";
import { BANNERS, BRANDS, FREE_GIFT_BANNER, brandType, hasDesign, matchBrand, tagBox, wrapBalanced } from "./coverPhoto";
import { freeGiftTip } from "./minPrice";

describe("cover photo", () => {
  it("offers 100 brands, each once", () => {
    expect(BRANDS).toHaveLength(100);
    expect(new Set(BRANDS.map((b) => b.name.toLowerCase())).size).toBe(100);
  });

  it("matches an item's brand field loosely and falls back to the classic tag", () => {
    expect(matchBrand("lululemon")?.name).toBe("Lululemon");
    expect(matchBrand("Levis")?.name).toBe("Levi's");
    expect(matchBrand("tiffany & co")?.name).toBe("Tiffany & Co.");
    expect(matchBrand("")).toBeUndefined();
    expect(brandType("Gucci")).toBe("serif");
    expect(brandType("Nike")).toBe("bold");
    expect(brandType("My Own Label")).toBe("classic");
  });

  it("has the sale banners sellers asked for", () => {
    for (const b of ["BOGO", "50% OFF", "FREE GIFT WITH PURCHASE", FREE_GIFT_BANNER]) expect(BANNERS).toContain(b);
    expect(freeGiftTip).toContain(FREE_GIFT_BANNER);
  });

  it("splits banner words into even lines", () => {
    expect(wrapBalanced("BOGO", 3)).toEqual(["BOGO"]);
    expect(wrapBalanced("50% OFF", 3)).toEqual(["50%", "OFF"]);
    expect(wrapBalanced("FREE GIFT WITH PURCHASE", 2)).toEqual(["FREE GIFT", "WITH PURCHASE"]);
    expect(wrapBalanced("FREE GIFT WITH PURCHASE", 3)).toEqual(["FREE GIFT", "WITH", "PURCHASE"]);
  });

  it("centers the brand tag at the bottom and keeps it inside the photo", () => {
    const b = tagBox(1000, 1200, 300, 40);
    expect(b.x + b.w / 2).toBeCloseTo(500);
    expect(b.y + b.h).toBeLessThan(1200);
    expect(tagBox(1000, 1000, 5000, 40).w).toBeLessThanOrEqual(860);
  });

  it("counts a design only when something is added", () => {
    expect(hasDesign({ tagColor: "black" })).toBe(false);
    expect(hasDesign({ brand: "  " })).toBe(false);
    expect(hasDesign({ banner: "BOGO" })).toBe(true);
  });
});
