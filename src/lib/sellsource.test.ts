import { describe, expect, it } from "vitest";
import { type Bid, bidIncrement, cleanHandle, handleProblem, highBid, listingFromItem, matchesQuery, minNextBid, packageShipping, placeBid, publishProblem, sellSourceFees, startAuction } from "./sellsource";
import type { InventoryItem } from "./types";

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({ id: "i1", sku: "RS-0001", title: "Levi's 501", status: "listed", listings: [], listPrice: 40, photo: "p.jpg", ...over });
const seller = { userId: "u1", handle: "rose", shopName: "Rose", shippingPrice: 7.99, extraItemShipping: 1, payouts: "ready" as const };
const bid = (amount: number, over: Partial<Bid> = {}): Bid => ({ id: String(amount), showId: "s", listingId: "l", name: "a", amount, at: "", ...over });

describe("fees", () => {
  it("takes 3% of the item plus card processing on everything paid", () => {
    const f = sellSourceFees(40, 8);
    expect(f.sellsource).toBe(1.2);
    expect(f.processing).toBe(1.69); // 48 * 2.9% + 0.30
    expect(f.total).toBe(2.89);
    expect(f.payout).toBe(45.11);
  });
  it("is zero for nothing", () => expect(sellSourceFees(0).total).toBe(0));
});

describe("combined shipping", () => {
  it("charges the first item once and the extra price after", () => {
    expect(packageShipping(seller, 1)).toBe(7.99);
    expect(packageShipping(seller, 3)).toBe(9.99);
  });
  it("charges only extras when the first item already paid shipping (a later live win)", () => {
    expect(packageShipping(seller, 1, true)).toBe(1);
    expect(packageShipping({ shippingPrice: 7.99, extraItemShipping: 0 }, 2, true)).toBe(0);
  });
});

describe("storefronts", () => {
  it("cleans handles", () => {
    expect(cleanHandle("Rose's Closet!!")).toBe("rose-s-closet");
    expect(handleProblem("ab")).toMatch(/at least/);
    expect(handleProblem("rose-closet")).toBeNull();
  });
  it("only publishes priced items with a photo that haven't sold", () => {
    expect(publishProblem(item())).toBeNull();
    expect(publishProblem(item({ listPrice: undefined }))).toMatch(/price/);
    expect(publishProblem(item({ photo: undefined }))).toMatch(/photo/);
    expect(publishProblem(item({ status: "sold" }))).toMatch(/sold/);
  });
  it("copies only public fields into a listing", () => {
    const l = listingFromItem(item({ cost: 3, notes: "secret", location: "Bin 4" }), seller, "x");
    expect(l).toMatchObject({ id: "x", price: 40, shippingPrice: 7.99, handle: "rose", photos: ["p.jpg"], status: "active" });
    expect(JSON.stringify(l)).not.toMatch(/secret|Bin 4|"cost"/);
  });
  it("matches every word", () => {
    const l = listingFromItem(item({ brand: "Levi's", size: "30" }), seller, "x");
    expect(matchesQuery(l, "levi 30")).toBe(true);
    expect(matchesQuery(l, "levi 32")).toBe(false);
  });
});

describe("auctions", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("starts at the starting bid, then needs a raise", () => {
    const a = startAuction("l", 10, 30, now);
    expect(minNextBid(a, [])).toBe(10);
    expect(minNextBid(a, [bid(10), bid(14)])).toBe(15);
    expect(bidIncrement(120)).toBe(5);
  });
  it("finds the high bid for the item only", () => expect(highBid([bid(5), bid(50, { listingId: "other" }), bid(9)], "l")?.amount).toBe(9));
  it("refuses low bids and bids after the end", () => {
    const a = startAuction("l", 10, 30, now);
    expect(placeBid(a, [], 9, now)).toEqual({ error: "Bid at least $10." });
    expect(placeBid(a, [], 10, now + 31000)).toEqual({ error: "This auction has ended." });
  });
  it("puts time back on the clock for a last-second bid", () => {
    const a = startAuction("l", 10, 30, now);
    const r = placeBid(a, [], 10, now + 27000);
    expect("auction" in r && Date.parse(r.auction.endsAt)).toBe(now + 37000);
    const early = placeBid(a, [], 10, now + 5000);
    expect("auction" in early && early.auction.endsAt).toBe(a.endsAt);
  });
});
