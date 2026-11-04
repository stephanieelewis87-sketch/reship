import { describe, expect, it } from "vitest";
import { linksToCheck, listingHref, MARKETPLACES, MAX_LISTING_PHOTOS, parseListingLink, photosFor, platformOfUrl } from "./marketplaces";
import { ALL_PLATFORMS } from "./types";

describe("marketplace address book", () => {
  it("covers every marketplace with a working main page", () => {
    for (const p of ALL_PLATFORMS) expect(MARKETPLACES[p].home).toMatch(/^https:\/\//);
  });

  it("allows as many photos as the marketplace that takes the most", () => {
    expect(MAX_LISTING_PHOTOS).toBe(24);
    const photos = Array.from({ length: 30 }, (_, i) => `https://x.test/${i}.jpg`);
    expect(photosFor("eBay", photos)).toHaveLength(24);
    expect(photosFor("OfferUp", photos)).toHaveLength(12);
    expect(photosFor("Depop", photos)[0]).toBe(photos[0]); // cover photo stays first
  });

  it("knows which marketplace a link is from, including mobile links", () => {
    expect(platformOfUrl("https://m.facebook.com/marketplace/item/123/")).toBe("Facebook");
    expect(platformOfUrl("https://offerup.com/item/detail/1234567890")).toBe("OfferUp");
    expect(platformOfUrl("https://us.vestiairecollective.com/x/y-41234567.shtml")).toBe("Vestiaire");
    expect(platformOfUrl("https://example.com/listing/1")).toBeUndefined();
  });

  it("lists every fixed link for the weekly check", () => {
    const urls = linksToCheck().map((l) => l.url);
    expect(urls).toContain("https://poshmark.com/account/payout-options");
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

describe("parseListingLink", () => {
  it("pulls the listing ID out of each marketplace's links", () => {
    const id = (p: Parameters<typeof parseListingLink>[0], url: string) => {
      const r = parseListingLink(p, url);
      return r.ok ? r.listingId : r.problem;
    };
    expect(id("eBay", "https://www.ebay.com/itm/1234567890?hash=abc&_trkparms=x")).toBe("1234567890");
    expect(id("eBay", "https://www.ebay.com/itm/Levis-501-Jeans/1234567890")).toBe("1234567890");
    expect(id("Mercari", "https://www.mercari.com/us/item/m12345678/")).toBe("m12345678");
    expect(id("Poshmark", "https://poshmark.com/listing/Levis-501-Jeans-65a1b2c3d4")).toBe("65a1b2c3d4");
    expect(id("Vinted", "https://www.vinted.com/items/4567-levis-jeans")).toBe("4567");
    expect(id("OfferUp", "https://offerup.com/item/detail/1234567890?ref=share")).toBe("1234567890");
    expect(id("Grailed", "https://www.grailed.com/listings/12345678-carhartt-detroit-jacket")).toBe("12345678");
    expect(id("Vestiaire", "https://us.vestiairecollective.com/women-bags/handbags/chanel/black-chanel-handbag-41234567.shtml")).toBe("41234567");
    expect(id("Shopify", "https://my-vintage-shop.com/products/levis-501")).toBe("levis-501");
  });

  it("refuses links from the wrong marketplace", () => {
    expect(parseListingLink("Mercari", "https://poshmark.com/listing/Jeans-65a1b2c3d4")).toEqual({ ok: false, problem: "That's a Poshmark link, not Mercari." });
  });

  it("asks for the full link instead of an app share link", () => {
    const r = parseListingLink("Poshmark", "https://posh.mk/abc123");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problem).toMatch(/share link/);
  });

  it("refuses marketplace pages that aren't listings", () => {
    expect(parseListingLink("eBay", "https://www.ebay.com/sh/ord").ok).toBe(false);
  });

  it("keeps a cleaned link only when the ID can't rebuild it", () => {
    expect(parseListingLink("eBay", "https://www.ebay.com/itm/1234567890?_trkparms=x")).toEqual({ ok: true, listingId: "1234567890", url: undefined });
    expect(parseListingLink("ThredUp", "https://www.thredup.com/product/women-levis/223344556?utm_source=x")).toEqual({
      ok: true,
      listingId: "223344556",
      url: "https://www.thredup.com/product/women-levis/223344556",
    });
  });

  it("takes a bare listing ID, but not a half-copied link", () => {
    expect(parseListingLink("Etsy", "998877")).toEqual({ ok: true, listingId: "998877" });
    expect(parseListingLink("Etsy", "www.etsy.com/listing/998877").ok).toBe(false);
  });
});

describe("listingHref", () => {
  it("rebuilds the link from the ID, so an old messy link still opens", () => {
    expect(listingHref("Mercari", { listingId: "m123", url: "https://www.mercari.com/us/item/m123/?ref=old" })).toBe("https://www.mercari.com/us/item/m123/");
  });

  it("falls back to the marketplace's main page instead of a broken link", () => {
    expect(listingHref("Grailed", { url: "https://posh.mk/abc" })).toBe("https://www.grailed.com/");
    expect(listingHref("Grailed", {})).toBeUndefined();
  });
});
