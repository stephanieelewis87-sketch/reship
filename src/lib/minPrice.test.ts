import { describe, expect, it } from "vitest";
import { MIN_PRICE, atLeastMinimum, underMinimum } from "./minPrice";
import { draftToItem, emptyListing, type VideoDraft } from "./videoListing";
import { staleAdvice } from "./analytics";
import type { InventoryItem } from "./types";

describe("minimum price", () => {
  it("flags prices under the floor and leaves blanks alone", () => {
    expect(underMinimum(MIN_PRICE - 0.01)).toBe(true);
    expect(underMinimum(0)).toBe(true);
    expect(underMinimum(MIN_PRICE)).toBe(false);
    expect(underMinimum(undefined)).toBe(false);
    expect(underMinimum(null)).toBe(false);
  });

  it("raises suggestions to the floor", () => {
    expect(atLeastMinimum(1)).toBe(MIN_PRICE);
    expect(atLeastMinimum(MIN_PRICE + 7)).toBe(MIN_PRICE + 7);
  });

  it("doesn't keep an imported draft's price under the floor or mark it ready", () => {
    const d: VideoDraft = { id: "a", include: true, label: "Socks", snips: [], cover: "", listing: { ...emptyListing(), title: "Socks" }, priceText: String(MIN_PRICE - 1), state: "done" };
    const item = draftToItem(d, [], "S-1");
    expect(item.listPrice).toBeUndefined();
    expect(item.readyToList).toBe(false);
    expect(draftToItem({ ...d, priceText: String(MIN_PRICE) }, [], "S-2").listPrice).toBe(MIN_PRICE);
  });

  it("never suggests a markdown below the floor", () => {
    const item = { id: "x", sku: "x", title: "Tee", listPrice: MIN_PRICE + 1, quantity: 1, status: "listed", listings: [] } as unknown as InventoryItem;
    const s = staleAdvice(item, 200);
    expect(s.suggestedPrice === null || s.suggestedPrice >= MIN_PRICE).toBe(true);
  });
});
