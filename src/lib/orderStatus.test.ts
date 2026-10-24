import { describe, expect, it } from "vitest";
import { businessDaysSince, shipUrgency, summarize } from "./orderStatus";
import type { Order } from "./types";

// Friday, October 23 2026.
const today = new Date(2026, 9, 23);
const order = (date: string, status: Order["status"], shipment?: Order["shipment"]): Order => ({
  id: date + status,
  platform: "Poshmark",
  orderId: "x",
  buyer: "b",
  items: [{ name: "Item" }],
  date,
  status,
  carrier: "USPS",
  source: "sync",
  shipment,
});

describe("ship-by tracking", () => {
  it("counts weekdays only", () => {
    expect(businessDaysSince("2026-10-23", today)).toBe(0);
    expect(businessDaysSince("2026-10-22", today)).toBe(1);
    // Friday the 16th to Friday the 23rd: five weekdays.
    expect(businessDaysSince("2026-10-16", today)).toBe(5);
    // Saturday's order to Monday the 26th counts only Monday.
    expect(businessDaysSince("2026-10-24", new Date(2026, 9, 26))).toBe(1);
  });

  it("flags unshipped orders as due, then late", () => {
    expect(shipUrgency(order("2026-10-22", "pending"), today)).toBe("ok");
    expect(shipUrgency(order("2026-10-21", "printed"), today)).toBe("due");
    expect(shipUrgency(order("2026-10-20", "pending"), today)).toBe("late");
    expect(shipUrgency(order("2026-10-01", "shipped"), today)).toBe("ok");
  });

  it("summarizes the dashboard counts", () => {
    const s = summarize(
      [
        order("2026-10-23", "pending"),
        order("2026-10-19", "printed"),
        order("2026-10-15", "shipped", { status: "in_transit", updatedAt: "" }),
        order("2026-10-10", "shipped", { status: "delivered", updatedAt: "" }),
        order("2026-10-10", "pending", { status: "cancelled", updatedAt: "" }),
      ],
      today,
    );
    expect(s).toMatchObject({ toPrint: 1, printed: 1, inTransit: 1, delivered: 1 });
    expect(s.late).toHaveLength(1);
  });
});
