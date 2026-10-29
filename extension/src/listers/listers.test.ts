import { describe, expect, it } from "vitest";
import { mercariLister } from "./mercari";
import { vintedLister } from "./vinted";
import { fillMessage } from "../jobs";

describe("listers", () => {
  it("finds a new listing's id from the page the marketplace lands on", () => {
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/us/item/m12345678901/")).toBe("m12345678901");
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/item/m12345678901/?ref=sell")).toBe("m12345678901");
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/sell/")).toBeNull();
    expect(vintedLister.listingIdFromUrl("https://www.vinted.com/items/4455667788-madewell-linen-shirt")).toBe("4455667788");
    expect(vintedLister.listingIdFromUrl("https://www.vinted.co.uk/items/4455667788")).toBe("4455667788");
    expect(vintedLister.listingIdFromUrl("https://www.vinted.com/items/new")).toBeNull();
  });

  it("recognises the login pages", () => {
    expect(mercariLister.isLoginPage("https://www.mercari.com/login/?redirect=/sell/")).toBe(true);
    expect(vintedLister.isLoginPage("https://www.vinted.com/member/signup/select_type")).toBe(true);
    expect(vintedLister.isLoginPage("https://www.vinted.com/items/new")).toBe(false);
  });

  it("tells the seller what's left to do on the sell form", () => {
    expect(fillMessage("Mercari", { filled: ["title", "description", "price", "4 photos"], missing: ["condition"] })).toBe(
      "Filled in title, description, price and 4 photos. Open the Mercari tab, add condition, category, brand and shipping, then press List.",
    );
  });
});
