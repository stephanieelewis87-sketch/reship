import type { PackageType } from "./types";

export interface CarrierRate {
  carrier: string;
  service: string;
  price: number;
  days: string;
}

// Rough estimates carried over from the design, shown until live rates come from a shipping API.
export function estimateRates(weightLbs: number, pkg: PackageType): CarrierRate[] {
  const w = Math.max(0, weightLbs);
  const isEnvelope = pkg === "Envelope";
  const rates: CarrierRate[] = [];

  if (isEnvelope || w <= 0.5) {
    rates.push({ carrier: "USPS", service: "First Class", price: isEnvelope ? 4.5 : 5.8, days: "2–5 days" });
  }
  rates.push({ carrier: "USPS", service: "Ground Advantage", price: 5.5 + w * 0.8, days: "2–5 days" });
  rates.push({ carrier: "USPS", service: "Priority Mail", price: 9.45 + w * 0.6, days: "1–3 days" });
  if (!isEnvelope) {
    rates.push({ carrier: "UPS", service: "Ground", price: 10.2 + w * 1.1, days: "1–5 days" });
    rates.push({ carrier: "FedEx", service: "Home Delivery", price: 11.5 + w * 1.2, days: "1–5 days" });
  }
  return rates.map((r) => ({ ...r, price: Math.round(r.price * 100) / 100 }));
}
