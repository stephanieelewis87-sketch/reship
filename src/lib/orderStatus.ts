import type { Order, ShipmentStatus } from "./types";

// Marketplaces expect orders to ship within a few business days (Poshmark asks for 3).
export const SHIP_WITHIN_BUSINESS_DAYS = 3;

// Weekdays between the order date and today, not counting the order day itself.
export function businessDaysSince(date: string, today = new Date()): number {
  const day = new Date(`${date}T00:00:00`);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let count = 0;
  while (day < end) {
    day.setDate(day.getDate() + 1);
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export type Urgency = "ok" | "due" | "late";

// How close an unshipped order is to the marketplace's ship-by deadline.
export function shipUrgency(order: Order, today = new Date()): Urgency {
  if (order.status === "shipped") return "ok";
  const days = businessDaysSince(order.date, today);
  if (days >= SHIP_WITHIN_BUSINESS_DAYS) return "late";
  if (days >= SHIP_WITHIN_BUSINESS_DAYS - 1) return "due";
  return "ok";
}

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  label_created: "Label created",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export interface Summary {
  toPrint: number;
  printed: number;
  inTransit: number;
  delivered: number;
  late: Order[];
  due: Order[];
}

export function summarize(orders: Order[], today = new Date()): Summary {
  const s: Summary = { toPrint: 0, printed: 0, inTransit: 0, delivered: 0, late: [], due: [] };
  for (const o of orders) {
    if (o.shipment?.status === "cancelled") continue;
    if (o.status === "pending") s.toPrint++;
    else if (o.status === "printed") s.printed++;
    else if (o.shipment?.status === "delivered") s.delivered++;
    else s.inTransit++;
    const urgency = shipUrgency(o, today);
    if (urgency === "late") s.late.push(o);
    else if (urgency === "due") s.due.push(o);
  }
  return s;
}
