import { describe, expect, it } from "vitest";
import { canBuyReshipLabel, compareLabels, labelPolicy, marketplaceOrderUrl, parsePrice } from "./labelPolicy";

describe("labelPolicy", () => {
  it("compares on marketplaces that let sellers ship on their own", () => {
    expect(labelPolicy({ platform: "Mercari" })).toBe("compare");
    expect(labelPolicy({ platform: "Depop" })).toBe("compare");
  });

  it("always uses Reship labels for eBay, Etsy and direct sales", () => {
    expect(labelPolicy({ platform: "eBay" })).toBe("reship");
    expect(labelPolicy({ platform: "Etsy" })).toBe("reship");
    expect(labelPolicy({ platform: "Other" })).toBe("reship");
  });

  it("never buys a second label for prepaid-label marketplaces", () => {
    for (const platform of ["Poshmark", "WhatNot", "Vinted"] as const) {
      expect(labelPolicy({ platform })).toBe("marketplace");
      expect(canBuyReshipLabel({ platform })).toBe(false);
    }
  });
});

describe("compareLabels", () => {
  it("picks Reship only when it costs less", () => {
    expect(compareLabels(7.49, 5.2)).toEqual({ pick: "reship", reshipPrice: 5.2, marketplacePrice: 7.49, savings: 2.29 });
    expect(compareLabels(5.2, 7.49).pick).toBe("marketplace");
    expect(compareLabels(6, 6)).toMatchObject({ pick: "marketplace", savings: 0 });
  });

  it("can't tell without both prices", () => {
    expect(compareLabels(null, 5).pick).toBe("unknown");
    expect(compareLabels(7, null).pick).toBe("unknown");
    expect(compareLabels(0, 5).pick).toBe("unknown");
  });
});

describe("parsePrice", () => {
  it("reads what a seller types", () => {
    expect(parsePrice("$7.49")).toBe(7.49);
    expect(parsePrice(" 12 ")).toBe(12);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("free")).toBeNull();
  });
});

describe("marketplaceOrderUrl", () => {
  it("links straight to a Mercari order", () => {
    expect(marketplaceOrderUrl({ platform: "Mercari", orderId: "m12345678" })).toBe("https://www.mercari.com/transaction/order_status/m12345678/");
    expect(marketplaceOrderUrl({ platform: "eBay", orderId: "1" })).toBeUndefined();
  });
});
