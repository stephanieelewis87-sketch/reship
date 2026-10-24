import { describe, expect, it } from "vitest";
import { matchLabelToOrder } from "./labelMatch";
import type { Order } from "./types";

const o = (id: string, orderId: string, status: Order["status"] = "pending"): Order => ({
  id,
  orderId,
  status,
  platform: "Poshmark",
  buyer: "",
  items: [{ name: "x" }],
  date: "2026-10-24",
  carrier: "",
  source: "manual",
});

describe("matchLabelToOrder", () => {
  const orders = [o("1", "PM-44821"), o("2", "EB-990234"), o("3", "MC-773419", "printed"), o("4", "448")];

  it("finds the order number in the file name, ignoring dashes and case", () => {
    expect(matchLabelToOrder("label_pm44821.pdf", orders)?.id).toBe("1");
    expect(matchLabelToOrder("eBay EB-990234 shipping label.PDF", orders)?.id).toBe("2");
  });

  it("ignores orders that already printed and very short numbers", () => {
    expect(matchLabelToOrder("MC-773419.pdf", orders)).toBeUndefined();
    expect(matchLabelToOrder("448.pdf", orders)).toBeUndefined();
  });

  it("returns nothing when no order number appears", () => {
    expect(matchLabelToOrder("Shipping Label (3).pdf", orders)).toBeUndefined();
  });
});
