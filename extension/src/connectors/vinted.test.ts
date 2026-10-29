import { describe, expect, it } from "vitest";
import { money, needsShipping, shipmentStatus, toImportedOrder, type VintedTransaction } from "./vinted";

// Made-up sale in the shape Vinted's transaction address answers with.
const sale: VintedTransaction = {
  id: 9876543210,
  status_title: "Send the item",
  buyer: { login: "capsule_closet" },
  item_id: 4455667788,
  item: { id: 4455667788, title: "Madewell linen shirt M", price: { amount: "24.0", currency_code: "USD" }, photos: [{ url: "https://images1.vinted.net/t/1.jpg" }] },
  created_at: "2026-10-27T18:02:11-04:00",
  shipment: { id: 3322, tracking_code: "9400111899560233000000", carrier: { name: "USPS" } },
};

describe("vinted connector", () => {
  it("turns a sale into a Reship order with its label address and listing id", () => {
    expect(toImportedOrder(sale)).toEqual({
      platform: "Vinted",
      orderNumber: "9876543210",
      buyer: "capsule_closet",
      date: "2026-10-27",
      items: [{ name: "Madewell linen shirt M", photo: "https://images1.vinted.net/t/1.jpg", price: 24 }],
      carrier: "USPS",
      tracking: "9400111899560233000000",
      shipTo: undefined,
      labelUrl: "https://www.vinted.com/api/v2/shipments/3322/label_url",
      listingIds: ["4455667788"],
    });
  });

  it("lists every item in a bundle", () => {
    const bundle = toImportedOrder({ ...sale, item: undefined, item_id: undefined, order: { items: [{ id: 1, title: "Top" }, { id: 2, title: "Skirt", price: "12.00" }] } });
    expect(bundle.items.map((i) => i.name)).toEqual(["Top", "Skirt"]);
    expect(bundle.listingIds).toEqual(["1", "2"]);
  });

  it("knows which sales still need shipping", () => {
    expect(needsShipping(sale)).toBe(true);
    expect(needsShipping({ ...sale, status_title: "Item shipped" })).toBe(false);
    expect(needsShipping({ ...sale, status_title: "Order completed" })).toBe(false);
    expect(needsShipping({ ...sale, status_title: "Waiting for payment" })).toBe(false);
  });

  it("follows the shipment after the label is printed", () => {
    expect(shipmentStatus(sale)).toBe("label_created");
    expect(shipmentStatus({ ...sale, status_title: "Item shipped" })).toBe("in_transit");
    expect(shipmentStatus({ ...sale, status_title: "Item delivered" })).toBe("delivered");
    expect(shipmentStatus({ ...sale, status_title: "Order cancelled" })).toBe("cancelled");
  });

  it("reads prices in each shape Vinted uses", () => {
    expect(money({ amount: "18.5" })).toBe(18.5);
    expect(money("$12.00")).toBe(12);
    expect(money(7)).toBe(7);
    expect(money(null)).toBeUndefined();
  });
});
