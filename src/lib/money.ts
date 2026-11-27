import type { Expense, InventoryItem, Platform } from "./types";
import { estimateFees, type SaleLine } from "./analytics";

// Dollars per business mile when the seller hasn't set their own. This is the IRS standard mileage
// rate for 2025; the IRS sets a new one each year, so Settings and the mileage form let it change.
export const DEFAULT_MILEAGE_RATE = 0.7;
export const mileageRateOf = (s: { mileageRate?: number }) => (s.mileageRate && s.mileageRate > 0 ? s.mileageRate : DEFAULT_MILEAGE_RATE);

const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// What one item made (or would make): the sale broken into what came out of it.
export interface ItemMoney {
  sold: boolean;
  price: number;
  fees: number;
  feesEstimated: boolean;
  shipping: number;
  cost: number | null;
  profit: number;
  platform?: Platform;
  date?: string;
}

const skuKey = (s?: string) => s?.trim().toLowerCase() || "";

// The sales of this item (matched by SKU), added together; or, when it hasn't sold, what it would
// make at its list price on the first marketplace it's listed on, after that marketplace's fees.
export function itemMoney(item: InventoryItem, lines: SaleLine[]): ItemMoney | null {
  const key = skuKey(item.sku);
  const mine = key ? lines.filter((l) => skuKey(l.sku) === key) : [];
  if (mine.length) {
    const cost = mine.every((l) => l.cost == null) ? null : sum(mine.map((l) => l.cost ?? 0));
    return {
      sold: true,
      price: cents(sum(mine.map((l) => l.price))),
      fees: cents(sum(mine.map((l) => l.fees))),
      feesEstimated: mine.some((l) => l.feesEstimated),
      shipping: cents(sum(mine.map((l) => l.shipping))),
      cost,
      profit: cents(sum(mine.map((l) => l.profit))),
      platform: mine[mine.length - 1].platform,
      date: mine[mine.length - 1].date,
    };
  }
  if (item.listPrice == null || item.listPrice <= 0) return null;
  const platform = item.listings.find((l) => l.status === "active")?.platform ?? item.listings[0]?.platform ?? "Poshmark";
  const fees = cents(estimateFees(platform, item.listPrice));
  return {
    sold: false,
    price: item.listPrice,
    fees,
    feesEstimated: true,
    shipping: 0,
    cost: item.cost ?? null,
    profit: cents(item.listPrice - fees - (item.cost ?? 0)),
    platform,
  };
}

// ---- Schedule C worksheet ----
// Totals for a calendar year, grouped by the Schedule C (Form 1040) line each usually goes on.
// It's a worksheet for the seller or their tax preparer, not a filed return.

export interface ScheduleCRow {
  line: string; // "1", "4", "9" ...
  label: string;
  amount: number;
  from: string; // what Hubby added up for it, in plain words
}

export interface ScheduleCSheet {
  year: string;
  rows: ScheduleCRow[];
  income: number; // line 1
  cogs: number; // line 4
  grossProfit: number; // line 7 (line 1 minus line 4, with no returns or other income)
  expenses: number; // line 28
  net: number; // line 31
  miles: number; // Part IV, line 44a
  sales: number;
  missingCost: number;
  estimatedFees: number;
  receipts: { with: number; total: number };
}

// Which line each expense category usually goes on. Anything else goes on line 27a, other expenses.
const CATEGORY_LINE: Record<string, { line: string; label: string }> = {
  Mileage: { line: "9", label: "Car and truck expenses (standard mileage)" },
  "Marketplace fees (other)": { line: "10", label: "Commissions and fees" },
  Equipment: { line: "13", label: "Depreciation and section 179" },
  "Software and subscriptions": { line: "18", label: "Office expense" },
  "Shipping supplies": { line: "22", label: "Supplies" },
};

export function taxYears(lines: SaleLine[], expenses: Expense[], today: string): string[] {
  const ys = new Set([today.slice(0, 4), ...lines.map((l) => l.date.slice(0, 4)), ...expenses.map((e) => e.date.slice(0, 4))]);
  return [...ys].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
}

export function scheduleC(allLines: SaleLine[], allExpenses: Expense[], year: string): ScheduleCSheet {
  const lines = allLines.filter((l) => l.date.startsWith(year));
  const expenses = allExpenses.filter((e) => e.date.startsWith(year));
  const byCat = (c: string) => sum(expenses.filter((e) => e.category === c).map((e) => e.amount));

  const income = sum(lines.map((l) => l.price));
  const soldCost = sum(lines.map((l) => l.cost ?? 0));
  const sourcing = byCat("Inventory sourcing");
  const cogs = soldCost + sourcing;
  const saleFees = sum(lines.map((l) => l.fees));
  const shipping = sum(lines.map((l) => l.shipping));

  const amounts = new Map<string, { label: string; amount: number; from: string[] }>();
  const add = (line: string, label: string, amount: number, from: string) => {
    if (amount <= 0) return;
    const row = amounts.get(line) ?? { label, amount: 0, from: [] };
    row.amount += amount;
    row.from.push(from);
    amounts.set(line, row);
  };
  add("10", "Commissions and fees", saleFees, "marketplace fees on your sales");
  add("27a", "Other expenses", shipping, "shipping you paid on sales");
  for (const cat of new Set(expenses.map((e) => e.category))) {
    if (cat === "Inventory sourcing") continue;
    const to = CATEGORY_LINE[cat] ?? { line: "27a", label: "Other expenses" };
    add(to.line, to.label, byCat(cat), cat === "Mileage" ? "mileage you logged" : `${cat} expenses`);
  }

  const order = ["9", "10", "13", "18", "22", "27a"];
  const expenseRows: ScheduleCRow[] = [...amounts]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([line, r]) => ({ line, label: r.label, amount: cents(r.amount), from: r.from.join(", ") }));
  const totalExpenses = sum(expenseRows.map((r) => r.amount));

  const rows: ScheduleCRow[] = [
    { line: "1", label: "Gross receipts or sales", amount: cents(income), from: `${lines.length} item${lines.length !== 1 ? "s" : ""} sold` },
    {
      line: "4",
      label: "Cost of goods sold",
      amount: cents(cogs),
      from: ["what you paid for the items you sold", sourcing > 0 ? "Inventory sourcing expenses" : ""].filter(Boolean).join(", "),
    },
    ...expenseRows,
  ];

  return {
    year,
    rows,
    income: cents(income),
    cogs: cents(cogs),
    grossProfit: cents(income - cogs),
    expenses: cents(totalExpenses),
    net: cents(income - cogs - totalExpenses),
    miles: Math.round(sum(expenses.map((e) => e.miles ?? 0)) * 10) / 10,
    sales: lines.length,
    missingCost: lines.filter((l) => l.cost == null).length,
    estimatedFees: lines.filter((l) => l.feesEstimated).length,
    receipts: { with: expenses.filter((e) => e.receipt && e.category !== "Mileage").length, total: expenses.filter((e) => e.category !== "Mileage").length },
  };
}

// The worksheet as CSV rows, with the totals Schedule C asks for.
export function scheduleCRows(s: ScheduleCSheet): Record<string, string | number>[] {
  return [
    ...s.rows.map((r) => ({ Line: r.line, Description: r.label, Amount: r.amount, "Hubby added up": r.from })),
    { Line: "7", Description: "Gross income", Amount: s.grossProfit, "Hubby added up": "line 1 minus line 4" },
    { Line: "28", Description: "Total expenses", Amount: s.expenses, "Hubby added up": "the expense lines above" },
    { Line: "31", Description: "Net profit or (loss)", Amount: s.net, "Hubby added up": "line 7 minus line 28" },
    { Line: "44a", Description: "Business miles driven", Amount: s.miles, "Hubby added up": "miles on your mileage expenses" },
  ];
}
