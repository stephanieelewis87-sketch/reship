import { describe, expect, it } from "vitest";
import { mercariLister } from "./mercari";
import { fillMessage } from "../jobs";

describe("listers", () => {
  it("finds a new listing's id from the page the marketplace lands on", () => {
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/us/item/m12345678901/")).toBe("m12345678901");
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/item/m12345678901/?ref=sell")).toBe("m12345678901");
    expect(mercariLister.listingIdFromUrl("https://www.mercari.com/sell/")).toBeNull();
  });

  it("recognises the login pages", () => {
    expect(mercariLister.isLoginPage("https://www.mercari.com/login/?redirect=/sell/")).toBe(true);
  });

  it("tells the seller what's left to do on the sell form", () => {
    expect(fillMessage("Mercari", { filled: ["title", "description", "price", "4 photos"], missing: ["condition"] })).toBe(
      "Filled in title, description, price and 4 photos. Open the Mercari tab, add condition, category, brand and shipping, then press List.",
    );
  });
});
