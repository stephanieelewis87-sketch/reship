import { describe, expect, it } from "vitest";
import { findUserId, needsShipping, toImportedOrder, type PoshmarkSale } from "./poshmark";

const sale: PoshmarkSale = {
  id: "6adcb4081a48840e3f9507ea",
  title: "Utility Jacket",
  display_status: "Sold",
  inventory_booked_at: "2026-10-24T13:26:00-07:00",
  bundle_size: 1,
  size: "M",
  buyer: { username: "jess" },
  shipping_address: { name: "Jess Doe", street: "1 Main St", street2: "", city: "Austin", state: "TX", zip: "78701", country: "US" },
  shipping_label_download_url: "https://poshmark.com/shipping_label/download?order_id=6adcb4081a48840e3f9507ea",
  shipping_method_info: { shipping_carrier: "USPS", service_info: { carrier_service_level: "Priority Mail" } },
  total_price_amount: { val: "12.00" },
};

describe("Poshmark connector", () => {
  it("keeps only sold orders that have a label", () => {
    expect(needsShipping(sale)).toBe(true);
    expect(needsShipping({ ...sale, display_status: "Shipped" })).toBe(false);
    expect(needsShipping({ ...sale, display_status: "Cancelled" })).toBe(false);
    expect(needsShipping({ ...sale, shipping_label_download_url: undefined })).toBe(false);
  });

  it("maps a sale to a Reship order", () => {
    const order = toImportedOrder({ ...sale, bundle_size: 3 });
    expect(order).toMatchObject({
      platform: "Poshmark",
      orderNumber: sale.id,
      buyer: "jess",
      date: "2026-10-24",
      carrier: "USPS Priority Mail",
      items: [{ name: "Utility Jacket (Size M) + 2 more", price: 12 }],
      shipTo: { name: "Jess Doe", street1: "1 Main St", street2: undefined, city: "Austin", state: "TX", zip: "78701", country: "US" },
      labelUrl: sale.shipping_label_download_url,
    });
  });

  it("finds the seller's account id in page text", () => {
    expect(findUserId('fetch("/vm-rest/users/67708f2603829173901a5387/orders")')).toBe("67708f2603829173901a5387");
    expect(findUserId('data-et-prop-lister_id="67708f2603829173901a5387"')).toBe("67708f2603829173901a5387");
    expect(findUserId("<html>login</html>")).toBeNull();
  });
});
