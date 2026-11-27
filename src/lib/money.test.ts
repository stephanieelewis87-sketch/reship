import { describe, expect, it } from "vitest";
import { itemMoney, mileageRateOf, scheduleC, scheduleCRows, taxYears } from "./money";
import type { SaleLine } from "./analytics";
import type { Expense, InventoryItem } from "./types";

const line = (date: string, price: number, fees: number, shipping: number, cost: number | null, sku = "A-1"): SaleLine =>
  ({ key: date + sku, date, price, fees, feesEstimated: false, shipping, cost, profit: price - fees - shipping - (cost ?? 0), sku, platform: "Poshmark" }) as SaleLine;
const exp = (date: string, category: string, amount: number, extra: Partial<Expense> = {}): Expense => ({ id: date + category + amount, date, category, amount, ...extra });
const item = (extra: Partial<InventoryItem> = {}): InventoryItem => ({ id: "1", sku: "A-1", title: "Jacket", status: "listed", listings: [], ...extra });

describe("mileage rate", () => {
  it("uses the seller's rate, or the default", () => {
    expect(mileageRateOf({})).toBe(0.7);
    expect(mileageRateOf({ mileageRate: 0.725 })).toBe(0.725);
  });
});

describe("what an item made", () => {
  it("adds up its sales", () => {
    const m = itemMoney(item(), [line("2026-03-01", 48, 9.6, 0, 8)])!;
    expect(m).toMatchObject({ sold: true, price: 48, fees: 9.6, cost: 8, profit: 30.4 });
  });
  it("estimates an unsold item at its price, after fees", () => {
    const m = itemMoney(item({ listPrice: 50, cost: 10, listings: [{ platform: "Poshmark", status: "active" }] }), [])!;
    expect(m).toMatchObject({ sold: false, fees: 10, profit: 30 });
    expect(itemMoney(item(), [])).toBeNull();
  });
});

describe("Schedule C worksheet", () => {
  const lines = [line("2025-02-01", 100, 20, 5, 30), line("2025-06-01", 50, 10, 0, null, "B-2"), line("2026-01-05", 999, 0, 0, 0)];
  const expenses = [
    exp("2025-03-01", "Mileage", 14, { miles: 20 }),
    exp("2025-03-02", "Shipping supplies", 25, { receipt: "x" }),
    exp("2025-04-01", "Inventory sourcing", 40),
    exp("2025-05-01", "Software and subscriptions", 30),
    exp("2025-05-02", "Other", 5),
    exp("2026-05-02", "Other", 500),
  ];
  const s = scheduleC(lines, expenses, "2025");
  const amt = (l: string) => s.rows.find((r) => r.line === l)?.amount;

  it("puts each total on its line, for that year only", () => {
    expect(amt("1")).toBe(150);
    expect(amt("4")).toBe(70); // 30 item cost + 40 sourcing
    expect(amt("9")).toBe(14);
    expect(amt("10")).toBe(30);
    expect(amt("18")).toBe(30);
    expect(amt("22")).toBe(25);
    expect(amt("27a")).toBe(10); // 5 shipping + 5 other
    expect(s.expenses).toBe(109);
    expect(s.net).toBe(150 - 70 - 109);
    expect(s.miles).toBe(20);
  });
  it("flags missing costs and counts receipts", () => {
    expect(s.missingCost).toBe(1);
    expect(s.receipts).toEqual({ with: 1, total: 4 });
  });
  it("lists the years with activity, newest first", () => {
    expect(taxYears(lines, expenses, "2026-11-27")).toEqual(["2026", "2025"]);
  });
  it("adds the totals lines to the CSV", () => {
    expect(scheduleCRows(s).map((r) => r.Line)).toEqual(["1", "4", "9", "10", "18", "22", "27a", "7", "28", "31", "44a"]);
  });
});
