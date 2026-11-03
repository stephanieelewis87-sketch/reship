import { describe, expect, it } from "vitest";
import { applyStatsReport, compactCount, itemStats, listingMatches, parseEbayStatsReport, recordStats } from "./listingStats";
import type { InventoryItem, Listing } from "./types";

const item = (id: string, listings: Listing[]): InventoryItem => ({ id, sku: id, title: id, status: "listed", listings });

describe("recording views and watchers", () => {
  it("keeps the earlier reading so the change can be shown", () => {
    let l: Listing = { platform: "eBay", status: "active" };
    l = recordStats(l, { views: 40, watchers: 2 }, "2026-10-27");
    l = recordStats(l, { views: 64, watchers: 5 }, "2026-11-03");
    expect(l).toMatchObject({ views: 64, watchers: 5, statsAt: "2026-11-03", statsHistory: [{ date: "2026-10-27", views: 40, watchers: 2 }] });
    const s = itemStats(item("a", [l]));
    expect(s).toMatchObject({ views: 64, watchers: 5, viewsUp: 24, watchersUp: 3, since: "2026-10-27" });
  });

  it("overwrites a reading from the same day, and keeps numbers a report leaves out", () => {
    let l: Listing = { platform: "eBay", status: "active" };
    l = recordStats(l, { watchers: 3 }, "2026-11-03");
    l = recordStats(l, { views: 90 }, "2026-11-03");
    expect(l).toMatchObject({ views: 90, watchers: 3 });
    expect(l.statsHistory).toBeUndefined();
  });

  it("adds up an item's listings and skips ones without numbers", () => {
    const s = itemStats(
      item("a", [
        { platform: "eBay", status: "active", views: 100, watchers: 4 },
        { platform: "Poshmark", status: "active", watchers: 9 },
        { platform: "Mercari", status: "active" },
      ]),
    );
    expect(s).toMatchObject({ views: 100, watchers: 13, hasViews: true, hasWatchers: true });
    expect(s.rows.map((r) => r.listing.platform)).toEqual(["eBay", "Poshmark"]);
  });

  it("shortens big numbers", () => {
    expect([compactCount(999), compactCount(1000), compactCount(1234), compactCount(15400)]).toEqual(["999", "1k", "1.2k", "15k"]);
  });
});

describe("eBay Seller Hub reports", () => {
  const traffic = [
    '"Listings traffic report"',
    '"Date range","Oct 4, 2026 - Nov 2, 2026"',
    "",
    '"Listing title","eBay item ID","Item Start Date","Total impressions","Click-through rate = Page views from eBay site/Total impressions","Total page views","Page views via promoted listings impressions on eBay site"',
    '"Nike Air Max 90","126543219876","Sep 30, 2026","2,410","3.1%","1,204","88"',
    '"Coach tote","126543219877","Oct 2, 2026","310","2.0%","17","-"',
  ].join("\n");

  it("finds the header under the report details and reads total page views", () => {
    const r = parseEbayStatsReport(traffic);
    expect(r.hasViews).toBe(true);
    expect(r.hasWatchers).toBe(false);
    expect(r.rows).toEqual([
      { listingId: "126543219876", views: 1204, watchers: undefined },
      { listingId: "126543219877", views: 17, watchers: undefined },
    ]);
  });

  it("reads watchers from the active listings download", () => {
    const r = parseEbayStatsReport('Item number,Title,Current price,Watchers\n126543219876,Nike Air Max 90,$85.00,7\n');
    expect(r.rows).toEqual([{ listingId: "126543219876", watchers: 7, views: undefined }]);
  });

  it("matches report rows to listings by listing ID or link, and lists the rest", () => {
    const inv = [
      item("shoe", [{ platform: "eBay", status: "active", listingId: "126543219876" }, { platform: "Poshmark", status: "active", listingId: "126543219877" }]),
      item("tote", [{ platform: "eBay", status: "active", url: "https://www.ebay.com/itm/126543219877?hash=x" }]),
    ];
    const rows = [
      { listingId: "126543219876", views: 1204 },
      { listingId: "126543219877", views: 17 },
      { listingId: "999", views: 5 },
    ];
    const r = applyStatsReport(inv, "eBay", rows, "2026-11-03");
    expect(r.matched).toBe(2);
    expect(r.unmatched).toEqual(["999"]);
    expect(r.changed.map((i) => [i.id, i.listings.map((l) => l.views)])).toEqual([
      ["shoe", [1204, undefined]],
      ["tote", [17]],
    ]);
  });

  it("doesn't match an ID that's only part of a longer one", () => {
    expect(listingMatches({ platform: "eBay", status: "active", url: "https://www.ebay.com/itm/1265432198760" }, "126543219876")).toBe(false);
  });
});
