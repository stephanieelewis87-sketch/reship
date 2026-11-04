import { describe, expect, it } from "vitest";
import { guessListingMapping, linksToItems, parseCsv, rowsToItems, toCondition } from "./listingImport";
import type { InventoryItem } from "./types";

const fmt = { prefix: "RS", digits: 4, counters: { RS: 1000 } };
const now = new Date("2026-11-04T12:00:00Z");

const existing: InventoryItem[] = [
  { id: "a", sku: "JEANS-1", title: "Levi's 501", status: "listed", listings: [{ platform: "Poshmark", status: "active", listingId: "65a1b2c3d4" }] },
];

describe("importing listings from links", () => {
  it("makes one item per listing link, from any marketplace", () => {
    const r = linksToItems("https://offerup.com/item/detail/111\n\nhttps://www.grailed.com/listings/222-jacket\n", [], fmt, now);
    expect(r.added).toBe(2);
    expect(r.items.map((i) => i.listings[0].platform)).toEqual(["OfferUp", "Grailed"]);
    expect(r.items.map((i) => i.sku)).toEqual(["RS-1001", "RS-1002"]);
    expect(r.items[1].listings[0]).toMatchObject({ listingId: "222", status: "active", listedAt: "2026-11-04" });
  });

  it("skips listings already in SellSync, and explains links it can't use", () => {
    const r = linksToItems("https://poshmark.com/listing/Levis-65a1b2c3d4\nhttps://posh.mk/abc\nhttps://example.com/x", existing, fmt, now);
    expect(r.skipped).toBe(1);
    expect(r.added).toBe(0);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/share link/);
  });
});

describe("importing listings from a spreadsheet", () => {
  it("reads eBay's active listings report", () => {
    const { headers, rows } = parseCsv(
      'Item number,Title,Custom label (SKU),Current price,Available quantity,Condition\n1234567890,Coach Willow Bag,,"$85.00",1,Pre-owned\n',
    );
    const mapping = guessListingMapping(headers);
    expect(mapping).toMatchObject({ title: "Title", listing: "Item number", sku: "Custom label (SKU)", price: "Current price", quantity: "Available quantity" });
    const r = rowsToItems(rows, mapping, "eBay", [], fmt, now);
    expect(r.items[0]).toMatchObject({ title: "Coach Willow Bag", listPrice: 85, condition: "Good", sku: "RS-1001" });
    expect(r.items[0].listings[0]).toMatchObject({ platform: "eBay", listingId: "1234567890", price: 85 });
  });

  it("collects Shopify's extra photo rows and Etsy's numbered photo columns", () => {
    const shopify = parseCsv("Handle,Title,Variant Price,Image Src\nlevis-501,Levi's 501,40,https://cdn.test/1.jpg\nlevis-501,,,https://cdn.test/2.jpg\n");
    const r = rowsToItems(shopify.rows, guessListingMapping(shopify.headers), "Shopify", [], fmt, now);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].photos).toEqual(["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"]);

    const etsy = parseCsv("TITLE,PRICE,IMAGE2,IMAGE1\nVintage Top,22,https://e.test/b.jpg,https://e.test/a.jpg\n");
    const e = rowsToItems(etsy.rows, guessListingMapping(etsy.headers), "Etsy", [], fmt, now);
    expect(e.items[0].photos).toEqual(["https://e.test/a.jpg", "https://e.test/b.jpg"]);
  });

  it("links a listing to an item that already has its SKU instead of making a duplicate", () => {
    const { headers, rows } = parseCsv("Title,SKU,Listing ID\nLevi's 501,jeans-1,m999\n");
    const r = rowsToItems(rows, guessListingMapping(headers), "Mercari", existing, fmt, now);
    expect(r.linked).toBe(1);
    expect(r.items[0].id).toBe("a");
    expect(r.items[0].listings.map((l) => l.platform)).toEqual(["Poshmark", "Mercari"]);
  });
});

describe("toCondition", () => {
  it("maps marketplace condition words onto SellSync's scale", () => {
    expect(toCondition("NWT")).toBe("New with tags");
    expect(toCondition("New other (see details)")).toBe("New without tags");
    expect(toCondition("Excellent")).toBe("Like new");
    expect(toCondition("Pre-owned")).toBe("Good");
    expect(toCondition("")).toBeUndefined();
  });
});
