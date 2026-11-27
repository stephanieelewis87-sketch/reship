import { describe, expect, it } from "vitest";
import { ebayListingsToItems, ebayOrdersToOrders, type EbayOrder } from "./ebay";
import type { InventoryItem, Order } from "./types";

const order = (over: Partial<EbayOrder> = {}): EbayOrder => ({
  orderId: "12-34567-89012",
  creationDate: "2026-11-20T15:04:05.000Z",
  orderFulfillmentStatus: "NOT_STARTED",
  buyer: "thriftfan",
  marketplaceFee: "4.13",
  shipTo: { fullName: "Ana Buyer", addressLine1: "1 Main St", city: "Austin", stateOrProvince: "TX", postalCode: "78701", countryCode: "US" },
  lineItems: [{ title: "Coach bag", legacyItemId: "315000000001", quantity: 1, price: "45.00" }],
  ...over,
});

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({ id: "i1", sku: "BB-00001", title: "Coach bag", status: "listed", listings: [], ...over });

describe("ebayOrdersToOrders", () => {
  it("makes a pending order with address, fees and the item's SKU from its linked listing", () => {
    const inv = [item({ listings: [{ platform: "eBay", status: "active", listingId: "315000000001" }] })];
    const r = ebayOrdersToOrders([order()], [], inv);
    expect(r.fresh).toHaveLength(1);
    const o = r.fresh[0];
    expect(o).toMatchObject({ id: "ebay-12-34567-89012", platform: "eBay", buyer: "thriftfan", date: "2026-11-20", status: "pending", fees: 4.13, source: "sync" });
    expect(o.items[0]).toEqual({ name: "Coach bag", sku: "BB-00001", price: 45 });
    expect(o.shipTo).toMatchObject({ name: "Ana Buyer", street1: "1 Main St", zip: "78701" });
  });

  it("skips orders already in Hubby, marks newly shipped ones, and leaves out cancelled ones", () => {
    const known: Order = { id: "x", platform: "eBay", orderId: "A", buyer: "", items: [], date: "2026-11-01", status: "printed", carrier: "", source: "csv" };
    const r = ebayOrdersToOrders(
      [order({ orderId: "A", orderFulfillmentStatus: "FULFILLED" }), order({ orderId: "B", cancelState: "CANCELED" }), order({ orderId: "C", orderFulfillmentStatus: "FULFILLED" })],
      [known],
      [],
    );
    expect(r.updated).toEqual([{ ...known, status: "shipped" }]);
    expect(r.fresh.map((o) => [o.orderId, o.status])).toEqual([["C", "shipped"]]);
    expect(r.skipped).toBe(1);
  });

  it("shows quantity in the item name", () => {
    const r = ebayOrdersToOrders([order({ lineItems: [{ title: "Socks", quantity: 3, price: "9.00", sku: "S-1" }] })], [], []);
    expect(r.fresh[0].items[0]).toEqual({ name: "Socks (x3)", sku: "S-1", price: 9 });
  });
});

describe("ebayListingsToItems", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  it("adds new items, links by SKU and skips listings already linked", () => {
    const existing = [
      item({ id: "a", sku: "BB-00001", listings: [{ platform: "eBay", status: "active", listingId: "111" }] }),
      item({ id: "b", sku: "BB-00002", title: "Levi's 501", listings: [] }),
    ];
    const r = ebayListingsToItems(
      [
        { itemId: "111", title: "Coach bag", price: 45 },
        { itemId: "222", title: "Levi's 501 jeans", sku: "BB-00002", price: 30, watchers: 4 },
        { itemId: "333", title: "Nike tee", price: 18, quantity: 2, condition: "Pre-owned", startTime: "2026-10-01T00:00:00.000Z", photos: ["https://i.ebayimg.com/a.jpg"] },
      ],
      existing,
      { prefix: "BB", digits: 5, counters: {} },
      now,
    );
    expect([r.added, r.linked, r.skipped]).toEqual([1, 1, 1]);
    const linked = r.items.find((i) => i.id === "b")!;
    expect(linked.listings[0]).toMatchObject({ platform: "eBay", listingId: "222", price: 30, watchers: 4, statsAt: "2026-11-27" });
    const added = r.items.find((i) => i.title === "Nike tee")!;
    expect(added).toMatchObject({ sku: "BB-00003", status: "listed", quantity: 2, listPrice: 18, condition: "Good", listedAt: "2026-10-01", photo: "https://i.ebayimg.com/a.jpg" });
    expect(added.listings[0].url).toBe("https://www.ebay.com/itm/333");
  });
});
