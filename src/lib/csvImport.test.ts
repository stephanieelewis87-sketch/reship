import { describe, expect, it } from "vitest";
import { guessMapping, parseCsv, rowsToOrders } from "./csvImport";

const ETSY_STYLE = `Sale Date,Item Name,Buyer,Quantity,Price,Order ID,SKU,Ship Name,Ship Address1,Ship Address2,Ship City,Ship State,Ship Zipcode,Ship Country
10/22/26,Vintage Floral Blouse S,cottagecore_kate,1,24.00,3012345678,VIN-BLS-S,Kate Moss,12 Elm St,,Portland,OR,97201,United States
10/22/26,Silk Floral Scarf,cottagecore_kate,1,$12.50,3012345678,,Kate Moss,12 Elm St,,Portland,OR,97201,United States
10/23/26,Hand-knit Cardigan M/L,boho_dreams,1,58,3012349999,KNIT-ML,Bo Hart,4 Oak Ave,Apt 2,Austin,TX,78701,United States`;

describe("csv import", () => {
  it("matches common marketplace headers", () => {
    const { headers } = parseCsv(ETSY_STYLE);
    const m = guessMapping(headers);
    expect(m.orderId).toBe("Order ID");
    expect(m.itemName).toBe("Item Name");
    expect(m.sku).toBe("SKU");
    expect(m.date).toBe("Sale Date");
    expect(m.street1).toBe("Ship Address1");
    expect(m.zip).toBe("Ship Zipcode");
    expect(m.shipName).toBe("Ship Name");
  });

  it("groups rows with the same order number into a bundle", () => {
    const { headers, rows } = parseCsv(ETSY_STYLE);
    const orders = rowsToOrders(rows, guessMapping(headers), "Etsy", "USPS Priority");
    expect(orders).toHaveLength(2);
    const bundle = orders.find((o) => o.orderId === "3012345678")!;
    expect(bundle.items.map((i) => i.name)).toEqual(["Vintage Floral Blouse S", "Silk Floral Scarf"]);
    expect(bundle.items[1].price).toBe(12.5);
    expect(bundle.date).toBe("2026-10-22");
    expect(bundle.shipTo).toMatchObject({ name: "Kate Moss", city: "Portland", state: "OR", zip: "97201" });
    expect(bundle.platform).toBe("Etsy");
    expect(bundle.status).toBe("pending");
    const single = orders.find((o) => o.orderId === "3012349999")!;
    expect(single.shipTo?.street2).toBe("Apt 2");
    expect(single.items[0].sku).toBe("KNIT-ML");
  });

  it("skips rows without an order number or item name", () => {
    const { rows } = parseCsv("Order ID,Title\n,Hat\n55,\n56,Scarf");
    const orders = rowsToOrders(rows, { orderId: "Order ID", itemName: "Title" }, "eBay", "UPS Ground");
    expect(orders.map((o) => o.orderId)).toEqual(["56"]);
  });
});
