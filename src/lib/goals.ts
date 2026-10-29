import type { Goal, GoalMetric, GoalPeriod, InventoryItem, Order } from "./types";
import { activeOn, addDays, isoDay, linesIn, metrics, saleLines, soldDates } from "./analytics";

export const GOAL_METRICS: { key: GoalMetric; label: string; unit: "$" | "#" | "%" }[] = [
  { key: "profit", label: "Profit", unit: "$" },
  { key: "sales", label: "Sales", unit: "$" },
  { key: "listings", label: "Listings", unit: "#" },
  { key: "sellThrough", label: "Sell-through rate", unit: "%" },
];
export const GOAL_PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "quarter", label: "Quarterly" },
  { key: "year", label: "Yearly" },
];

// The calendar period a goal is measured over, containing today. Weeks start on Monday.
export function periodRange(period: GoalPeriod, today: string) {
  const d = new Date(`${today}T00:00:00`);
  let start: Date;
  let end: Date;
  if (period === "week") {
    start = new Date(d);
    start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  } else if (period === "quarter") {
    const q = Math.floor(d.getMonth() / 3) * 3;
    start = new Date(d.getFullYear(), q, 1);
    end = new Date(d.getFullYear(), q + 3, 0);
  } else {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear(), 11, 31);
  }
  return { start: isoDay(start), end: isoDay(end) };
}

export interface GoalProgress {
  goal: Goal;
  value: number;
  share: number; // 0..1 of the target
  expected: number; // 0..1 of the period gone by
  start: string;
  end: string;
}

export function goalProgress(goal: Goal, orders: Order[], inventory: InventoryItem[], today = isoDay(new Date())): GoalProgress {
  const { start, end } = periodRange(goal.period, today);
  const upTo = { start, end: today };
  let value = 0;
  if (goal.metric === "listings") {
    value = inventory.filter((i) => i.listedAt && i.listedAt >= start && i.listedAt <= today).length;
  } else {
    const lines = linesIn(saleLines(orders, inventory), upTo);
    const m = metrics(lines, activeOn(inventory, soldDates(inventory, orders), today).length);
    value = goal.metric === "profit" ? m.profit : goal.metric === "sales" ? m.revenue : (m.sellThrough ?? 0) * 100;
  }
  const total = (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000 + 1;
  const gone = (new Date(`${today}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000 + 1;
  return { goal, value, share: goal.target > 0 ? value / goal.target : 0, expected: Math.min(1, gone / total), start, end: addDays(end, 0) };
}
