import Papa from "papaparse";
import type { Address, Order, OrderItem, Platform } from "./types";
import { newId } from "./ids";

// Fields Reship can fill from a spreadsheet. Each one is matched to a column by name,
// and the person can change any match before importing.
export const CSV_FIELDS = [
  { key: "orderId", label: "Order number", required: true },
  { key: "itemName", label: "Item name", required: true },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Item price" },
  { key: "date", label: "Order date" },
  { key: "buyer", label: "Buyer username" },
  { key: "shipName", label: "Ship-to name" },
  { key: "street1", label: "Address line 1" },
  { key: "street2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP / postal code" },
  { key: "country", label: "Country" },
] as const;

export type CsvField = (typeof CSV_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<CsvField, string>>;

// Common header names across marketplace exports (Etsy, eBay, Poshmark, Mercari and others).
// Mercari's sales report numbers each sale by "Item Id" and names it "Item Title".
const ALIASES: Record<CsvField, string[]> = {
  orderId: ["order id", "order number", "order no", "order #", "order", "sales record number", "transaction id", "item id"],
  itemName: ["item name", "item title", "title", "listing title", "product name", "item", "listing"],
  sku: ["sku", "custom label", "custom label (sku)", "item sku"],
  price: ["item price", "price", "sale price", "sold for", "order value", "item total"],
  date: ["order date", "sale date", "date", "sold date", "date sold", "paid on date", "order created"],
  buyer: ["buyer", "buyer username", "buyer user id", "username", "buyer name"],
  shipName: ["ship name", "ship to name", "recipient", "recipient name", "full name", "ship to", "name"],
  street1: ["ship address1", "ship to address 1", "address 1", "address line 1", "street 1", "street address", "address"],
  street2: ["ship address2", "ship to address 2", "address 2", "address line 2", "street 2"],
  city: ["ship city", "ship to city", "city"],
  state: ["ship state", "ship to state", "state", "province", "region"],
  zip: ["ship zipcode", "ship to zip", "zip", "zip code", "zipcode", "postal code", "postcode"],
  country: ["ship country", "ship to country", "country"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of CSV_FIELDS) {
    // Exact alias match first, in alias order, so "Order ID" wins over a looser "Order".
    for (const alias of ALIASES[field.key]) {
      const hit = headers.find((h) => !used.has(h) && norm(h) === alias);
      if (hit) {
        mapping[field.key] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

function toIsoDate(value: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!value) return today;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? today : parsed.toISOString().slice(0, 10);
}

function toPrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// Rows that share an order number become one order; more than one row makes it a bundle.
export function rowsToOrders(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  platform: Platform,
  carrier: string,
): Order[] {
  const get = (row: Record<string, string>, field: CsvField) => {
    const col = mapping[field];
    return col ? (row[col] ?? "").trim() : "";
  };

  const byOrder = new Map<string, Order>();
  for (const row of rows) {
    const orderId = get(row, "orderId");
    const itemName = get(row, "itemName");
    if (!orderId || !itemName) continue;

    const item: OrderItem = { name: itemName };
    const sku = get(row, "sku");
    if (sku) item.sku = sku;
    const price = toPrice(get(row, "price"));
    if (price !== undefined) item.price = price;

    const existing = byOrder.get(orderId);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    let shipTo: Address | undefined;
    if (get(row, "street1")) {
      shipTo = {
        name: get(row, "shipName") || get(row, "buyer"),
        street1: get(row, "street1"),
        street2: get(row, "street2"),
        city: get(row, "city"),
        state: get(row, "state"),
        zip: get(row, "zip"),
        country: get(row, "country") || "US",
      };
    }

    byOrder.set(orderId, {
      id: newId(),
      platform,
      orderId,
      buyer: get(row, "buyer") || get(row, "shipName"),
      items: [item],
      date: toIsoDate(get(row, "date")),
      status: "pending",
      carrier,
      shipTo,
      source: "csv",
    });
  }
  return [...byOrder.values()];
}
