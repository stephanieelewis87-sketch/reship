import type { InventoryItem, Order, OrderItem, Platform } from "./types";

// Everything the analytics pages show is worked out here from orders and inventory, so the
// numbers can be tested without the screen.

export interface DateRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

export type RangePreset = "7d" | "30d" | "90d" | "ytd" | "12m" | "all";
export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "This year" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

const DAY = 86_400_000;
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s: string) => new Date(`${s}T00:00:00`);
export const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY);

export function presetRange(preset: RangePreset, today: string, earliest?: string): DateRange {
  switch (preset) {
    case "7d":
      return { start: addDays(today, -6), end: today };
    case "30d":
      return { start: addDays(today, -29), end: today };
    case "90d":
      return { start: addDays(today, -89), end: today };
    case "ytd":
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    case "12m":
      return { start: addDays(today, -364), end: today };
    case "all":
      return { start: earliest && earliest < today ? earliest : addDays(today, -364), end: today };
  }
}

// The same number of days right before the range, for "vs previous period".
export function previousRange(r: DateRange): DateRange {
  const len = daysBetween(r.start, r.end) + 1;
  return { start: addDays(r.start, -len), end: addDays(r.start, -1) };
}

const inRange = (date: string, r: DateRange) => date >= r.start && date <= r.end;

// --- Fees -------------------------------------------------------------------------------------

// Seller fees per marketplace for one item at this price, as published in 2026. Used only when the
// order doesn't say what the fees were; the screen marks these as estimates.
export function estimateFees(platform: Platform, price: number): number {
  if (price <= 0) return 0;
  switch (platform) {
    case "Poshmark":
      return price < 15 ? 2.95 : price * 0.2;
    case "Mercari":
      return price * 0.129 + 0.5;
    case "eBay":
      return price * 0.136 + 0.4;
    case "Etsy":
      return price * 0.095 + 0.45;
    case "Depop":
      return price * 0.033 + 0.45;
    case "WhatNot":
      return price * 0.109 + 0.3;
    case "Vinted":
    case "Other":
      return 0;
  }
}

// --- Brand and category when the seller hasn't set them ------------------------------------------

const KNOWN_BRANDS = [
  "Lululemon", "Levi's", "Nike", "Adidas", "Coach", "Free People", "Anthropologie", "Zara", "Madewell", "Patagonia",
  "The North Face", "Ralph Lauren", "Tommy Hilfiger", "Juicy Couture", "J.Crew", "Gap", "Old Navy", "Banana Republic",
  "Kate Spade", "Michael Kors", "Dr. Martens", "Converse", "Vans", "New Balance", "Carhartt", "Columbia", "Aritzia",
  "Reformation", "Urban Outfitters", "Pokémon", "Lego", "Disney", "Harley-Davidson", "Champion", "Under Armour",
];

export function guessBrand(name: string): string {
  const n = name.toLowerCase();
  return KNOWN_BRANDS.find((b) => n.includes(b.toLowerCase())) ?? "Unbranded";
}

const CATEGORY_WORDS: [string, string[]][] = [
  ["Collectibles", ["pokémon", "pokemon", "card", "lego", "funko", "figure", "vinyl record"]],
  ["Shoes", ["shoe", "sneaker", "air max", "boot", "heel", "sandal", "loafer", "jordan"]],
  ["Bags", ["bag", "crossbody", "purse", "tote", "backpack", "wallet", "clutch"]],
  ["Outerwear", ["jacket", "coat", "windbreaker", "trench", "parka", "fleece", "vest", "puffer"]],
  ["Dresses", ["dress", "romper", "jumpsuit"]],
  ["Bottoms", ["jean", "pant", "legging", "short", "skirt", "trouser", "jogger"]],
  ["Tops", ["shirt", "blouse", "top", "tee", "hoodie", "sweater", "cardigan", "tank", "polo", "sweatshirt", "pullover"]],
  ["Accessories", ["scarf", "belt", "hat", "cap", "jewelry", "necklace", "earring", "sunglasses", "watch"]],
];

export function guessCategory(name: string): string {
  const n = name.toLowerCase();
  return CATEGORY_WORDS.find(([, words]) => words.some((w) => n.includes(w)))?.[0] ?? "Other";
}

// --- Sale lines ---------------------------------------------------------------------------------

// One sold item, with its share of the order's fees and shipping, and what it cost.
export interface SaleLine {
  key: string;
  order: Order;
  item: OrderItem;
  date: string;
  platform: Platform;
  name: string;
  sku?: string;
  brand: string;
  category: string;
  source: string;
  price: number;
  fees: number;
  feesEstimated: boolean;
  shipping: number;
  cost: number | null; // null when nobody entered what it cost
  profit: number;
  listedAt?: string;
  daysToSell: number | null;
  photo?: string;
}

const skuKey = (sku?: string) => sku?.trim().toLowerCase() || "";

export function inventoryBySku(inventory: InventoryItem[]) {
  const map = new Map<string, InventoryItem>();
  inventory.forEach((i) => skuKey(i.sku) && map.set(skuKey(i.sku), i));
  return map;
}

export function saleLines(orders: Order[], inventory: InventoryItem[]): SaleLine[] {
  const bySku = inventoryBySku(inventory);
  const lines: SaleLine[] = [];
  for (const order of orders) {
    if (order.shipment?.status === "cancelled") continue;
    const prices = order.items.map((i) => i.price ?? 0);
    const total = prices.reduce((a, b) => a + b, 0);
    const share = (idx: number) => (total > 0 ? prices[idx] / total : 1 / order.items.length);
    order.items.forEach((item, idx) => {
      const inv = bySku.get(skuKey(item.sku));
      const price = prices[idx];
      const feesEstimated = order.fees == null;
      const fees = feesEstimated ? estimateFees(order.platform, price) : order.fees! * share(idx);
      const shipping = (order.shippingCost ?? 0) * share(idx);
      const cost = item.cost ?? inv?.cost ?? null;
      const listedAt = inv?.listedAt;
      lines.push({
        key: `${order.id}:${idx}`,
        order,
        item,
        date: order.date,
        platform: order.platform,
        name: item.name,
        sku: item.sku,
        brand: item.brand || inv?.brand || guessBrand(item.name),
        category: item.category || inv?.category || guessCategory(item.name),
        source: inv?.source || "Not recorded",
        price,
        fees,
        feesEstimated,
        shipping,
        cost,
        profit: price - fees - shipping - (cost ?? 0),
        listedAt,
        daysToSell: listedAt && listedAt <= order.date ? daysBetween(listedAt, order.date) : null,
        photo: item.photo ?? inv?.photo,
      });
    });
  }
  return lines;
}

export const linesIn = (lines: SaleLine[], r: DateRange) => lines.filter((l) => inRange(l.date, r));

// --- Inventory over time ------------------------------------------------------------------------

// When each inventory item sold: its own sold date, or the date of the order that has its SKU.
export function soldDates(inventory: InventoryItem[], orders: Order[]): Map<string, string> {
  const orderDateBySku = new Map<string, string>();
  for (const o of orders) {
    if (o.shipment?.status === "cancelled") continue;
    for (const i of o.items) {
      const k = skuKey(i.sku);
      if (k && (!orderDateBySku.has(k) || o.date < orderDateBySku.get(k)!)) orderDateBySku.set(k, o.date);
    }
  }
  const out = new Map<string, string>();
  for (const item of inventory) {
    const d = item.soldAt ?? orderDateBySku.get(skuKey(item.sku));
    if (d) out.set(item.id, d);
  }
  return out;
}

// Items listed for sale on this day (listed on or before it, not yet sold).
export function activeOn(inventory: InventoryItem[], sold: Map<string, string>, day: string) {
  return inventory.filter((i) => {
    if (i.status === "draft" || !i.listedAt || i.listedAt > day) return false;
    const s = sold.get(i.id);
    return !s || s > day;
  });
}

// --- Totals -------------------------------------------------------------------------------------

export interface Metrics {
  revenue: number;
  fees: number;
  shipping: number;
  cogs: number;
  profit: number;
  margin: number | null;
  units: number;
  orders: number;
  avgPrice: number | null;
  avgProfit: number | null;
  avgDaysToSell: number | null;
  sellThrough: number | null; // share of what was for sale that sold in the range
  roi: number | null; // profit per dollar spent on items, for items with a cost
  missingCost: number;
  estimatedFees: number; // lines whose fees are estimates
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function metrics(lines: SaleLine[], activeAtEnd: number | null): Metrics {
  const revenue = sum(lines.map((l) => l.price));
  const fees = sum(lines.map((l) => l.fees));
  const shipping = sum(lines.map((l) => l.shipping));
  const costed = lines.filter((l) => l.cost != null);
  const cogs = sum(costed.map((l) => l.cost!));
  const profit = revenue - fees - shipping - cogs;
  const costedProfit = sum(costed.map((l) => l.profit));
  const days = lines.map((l) => l.daysToSell).filter((d): d is number => d != null);
  return {
    revenue,
    fees,
    shipping,
    cogs,
    profit,
    margin: revenue > 0 ? profit / revenue : null,
    units: lines.length,
    orders: new Set(lines.map((l) => l.order.id)).size,
    avgPrice: avg(lines.map((l) => l.price)),
    avgProfit: avg(lines.map((l) => l.profit)),
    avgDaysToSell: avg(days),
    sellThrough: activeAtEnd == null || lines.length + activeAtEnd === 0 ? null : lines.length / (lines.length + activeAtEnd),
    roi: cogs > 0 ? costedProfit / cogs : null,
    missingCost: lines.length - costed.length,
    estimatedFees: lines.filter((l) => l.feesEstimated && l.fees > 0).length,
  };
}

// Change from the previous period as a share (0.12 = up 12%), or null when there's nothing to compare.
export const change = (now: number | null, before: number | null) =>
  now == null || before == null || before === 0 ? null : (now - before) / Math.abs(before);

// --- Over time ----------------------------------------------------------------------------------

export type Bucket = "day" | "week" | "month";
export interface SeriesPoint {
  start: string;
  end: string;
  label: string;
  revenue: number;
  profit: number;
  units: number;
}

export const bucketFor = (r: DateRange): Bucket => {
  const len = daysBetween(r.start, r.end) + 1;
  return len <= 31 ? "day" : len <= 120 ? "week" : "month";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;

export function series(lines: SaleLine[], r: DateRange, bucket = bucketFor(r)): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let cursor = r.start;
  while (cursor <= r.end) {
    let end: string;
    let label: string;
    if (bucket === "day") {
      end = cursor;
      label = shortDate(cursor);
    } else if (bucket === "week") {
      end = addDays(cursor, 6);
      label = shortDate(cursor);
    } else {
      const d = parseDay(cursor);
      end = isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      label = `${MONTHS[d.getMonth()]}${d.getMonth() === 0 || points.length === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ""}`;
    }
    if (end > r.end) end = r.end;
    points.push({ start: cursor, end, label, revenue: 0, profit: 0, units: 0 });
    cursor = addDays(end, 1);
  }
  for (const l of lines) {
    const p = points.find((pt) => l.date >= pt.start && l.date <= pt.end);
    if (!p) continue;
    p.revenue += l.price;
    p.profit += l.profit;
    p.units++;
  }
  return points;
}

// --- Breakdowns ---------------------------------------------------------------------------------

export interface GroupRow {
  key: string;
  units: number;
  revenue: number;
  profit: number;
  margin: number | null;
  feeRate: number | null;
  roi: number | null;
  avgPrice: number | null;
  avgDaysToSell: number | null;
  sellThrough: number | null;
  active: number;
  lines: SaleLine[];
}

export function breakdown(
  lines: SaleLine[],
  keyOf: (l: SaleLine) => string,
  active?: { items: InventoryItem[]; keyOf: (i: InventoryItem) => string[] },
): GroupRow[] {
  const groups = new Map<string, SaleLine[]>();
  lines.forEach((l) => groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l]));
  const activeCount = new Map<string, number>();
  active?.items.forEach((i) => active.keyOf(i).forEach((k) => activeCount.set(k, (activeCount.get(k) ?? 0) + 1)));
  const keys = new Set([...groups.keys(), ...activeCount.keys()]);
  return [...keys]
    .map((key) => {
      const ls = groups.get(key) ?? [];
      const m = metrics(ls, active ? (activeCount.get(key) ?? 0) : null);
      return {
        key,
        units: m.units,
        revenue: m.revenue,
        profit: m.profit,
        margin: m.margin,
        feeRate: m.revenue > 0 ? m.fees / m.revenue : null,
        roi: m.roi,
        avgPrice: m.avgPrice,
        avgDaysToSell: m.avgDaysToSell,
        sellThrough: m.sellThrough,
        active: activeCount.get(key) ?? 0,
        lines: ls,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

// --- Inventory health ---------------------------------------------------------------------------

export const AGE_BUCKETS = [
  { label: "0–30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "91–180 days", min: 91, max: 180 },
  { label: "180+ days", min: 181, max: Infinity },
];

export interface StaleItem {
  item: InventoryItem;
  age: number;
  suggestedPrice: number | null;
  advice: string;
}

// A markdown that grows with age, never below what the item cost plus typical fees.
export function staleAdvice(item: InventoryItem, age: number): StaleItem {
  const cut = age > 180 ? 0.3 : age > 90 ? 0.2 : age > 60 ? 0.1 : 0;
  const floor = (item.cost ?? 0) * 1.25;
  const suggested = item.listPrice ? Math.max(floor, Math.floor(item.listPrice * (1 - cut))) : null;
  const advice =
    age > 180
      ? "Bundle it, send an offer to likers, or crosslist somewhere new"
      : age > 90
        ? "Drop the price and relist"
        : "Send offers to likers";
  return { item, age, suggestedPrice: suggested != null && item.listPrice && suggested < item.listPrice ? suggested : null, advice };
}

export function aging(active: InventoryItem[], today: string) {
  const buckets = AGE_BUCKETS.map((b) => ({ ...b, count: 0, cost: 0, listValue: 0 }));
  const stale: StaleItem[] = [];
  for (const item of active) {
    const age = daysBetween(item.listedAt!, today);
    const b = buckets.find((x) => age >= x.min && age <= x.max)!;
    b.count++;
    b.cost += item.cost ?? 0;
    b.listValue += item.listPrice ?? 0;
    if (age > 60) stale.push(staleAdvice(item, age));
  }
  stale.sort((a, b) => b.age - a.age);
  return { buckets, stale };
}

// --- When things sell ---------------------------------------------------------------------------

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function byWeekday(lines: SaleLine[]) {
  const out = WEEKDAYS.map((label) => ({ label, units: 0, profit: 0 }));
  lines.forEach((l) => {
    const d = parseDay(l.date).getDay();
    out[d].units++;
    out[d].profit += l.profit;
  });
  return out;
}

// --- Goal pace ----------------------------------------------------------------------------------

// This month's profit so far and where it's headed at the current pace.
export function goalPace(lines: SaleLine[], today: string, goal: number) {
  const monthStart = `${today.slice(0, 8)}01`;
  const d = parseDay(today);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const soFar = sum(linesIn(lines, { start: monthStart, end: today }).map((l) => l.profit));
  const projected = (soFar / d.getDate()) * daysInMonth;
  return { goal, soFar, projected, dayOfMonth: d.getDate(), daysInMonth, onTrack: projected >= goal };
}

// --- What to do next ----------------------------------------------------------------------------

export type InsightPage = "overview" | "profit" | "marketplaces" | "brands" | "inventory" | "sourcing";
export interface Insight {
  tone: "good" | "warn" | "info";
  title: string;
  detail: string;
  page?: InsightPage;
  brand?: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function insights({
  lines,
  allLines,
  active,
  today,
}: {
  lines: SaleLine[];
  allLines: SaleLine[];
  active: InventoryItem[];
  today: string;
}): Insight[] {
  const out: Insight[] = [];

  const { stale } = aging(active, today);
  const old = stale.filter((s) => s.age > 90);
  if (old.length) {
    out.push({
      tone: "warn",
      title: `${old.length} item${old.length !== 1 ? "s have" : " has"} sat for 90+ days`,
      detail: `${money(sum(old.map((s) => s.item.cost ?? 0)))} of your money is tied up in them. Markdowns are suggested on Inventory health.`,
      page: "inventory",
    });
  }

  // Brands judged over a longer window than the range, so a slow month doesn't hide a good brand.
  const brands = breakdown(allLines, (l) => l.brand).filter((b) => b.units >= 4 && b.key !== "Unbranded");
  const best = [...brands].filter((b) => b.roi != null).sort((a, b) => b.roi! - a.roi!)[0];
  if (best && best.roi! > 1) {
    out.push({
      tone: "good",
      title: `Buy more ${best.key}`,
      detail: `Every $1 you spend on ${best.key} comes back as $${(best.roi! + 1).toFixed(2)} after fees${best.avgDaysToSell != null ? `, and it sells in ${Math.round(best.avgDaysToSell)} days on average` : ""}.`,
      page: "brands",
      brand: best.key,
    });
  }
  const slow = [...brands].filter((b) => b.avgDaysToSell != null && b.roi != null).sort((a, b) => b.avgDaysToSell! - a.avgDaysToSell!)[0];
  if (slow && slow !== best && slow.avgDaysToSell! > 60) {
    out.push({
      tone: "warn",
      title: `${slow.key} is slow to sell`,
      detail: `It takes ${Math.round(slow.avgDaysToSell!)} days on average. Pay less for it, or pass on it next time you source.`,
      page: "brands",
      brand: slow.key,
    });
  }

  const markets = breakdown(lines, (l) => l.platform).filter((m) => m.units >= 3 && m.revenue > 0);
  if (markets.length >= 2) {
    const sorted = [...markets].sort((a, b) => (a.feeRate ?? 0) - (b.feeRate ?? 0));
    const cheap = sorted[0];
    const dear = sorted[sorted.length - 1];
    if ((dear.feeRate ?? 0) - (cheap.feeRate ?? 0) > 0.05) {
      out.push({
        tone: "info",
        title: `${dear.key} takes the biggest cut`,
        detail: `Fees take ${pct(dear.feeRate!)} of your ${dear.key} sales and ${pct(cheap.feeRate!)} on ${cheap.key}. Price ${dear.key} listings a little higher to make up for it.`,
        page: "marketplaces",
      });
    }
  }

  const days = byWeekday(lines);
  const topDay = [...days].sort((a, b) => b.units - a.units)[0];
  if (topDay && lines.length >= 14) {
    out.push({
      tone: "info",
      title: `${WEEKDAY_NAMES[WEEKDAYS.indexOf(topDay.label)]}s are your best day`,
      detail: `${pct(topDay.units / lines.length)} of sales in this period landed then. Share and relist the day before.`,
      page: "overview",
    });
  }

  const missing = lines.filter((l) => l.cost == null).length;
  if (missing) {
    out.push({
      tone: "warn",
      title: `${missing} sale${missing !== 1 ? "s are" : " is"} missing what the item cost`,
      detail: "Profit counts those items as free. Add the cost on the order or the inventory item to make profit exact.",
      page: "profit",
    });
  }
  return out;
}
