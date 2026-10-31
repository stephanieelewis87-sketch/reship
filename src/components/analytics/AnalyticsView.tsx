import { useMemo, useState } from "react";
import Papa from "papaparse";
import { AlertTriangle, Download, Lightbulb, Plus, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import type { Expense, InventoryItem, Order, Platform, Settings } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import {
  RANGE_PRESETS,
  type DateRange,
  type Insight,
  type InsightPage,
  type RangePreset,
  type SaleLine,
  activeOn,
  aging,
  breakdown,
  byWeekday,
  change,
  daysBetween,
  insights,
  isoDay,
  linesIn,
  metrics,
  presetRange,
  previousRange,
  saleLines,
  series,
  shortDate,
  soldDates,
} from "@/lib/analytics";
import { listedOn } from "@/lib/inventory";
import { PlatformIcon, inputClass, primaryButton } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { PlatformFilter } from "../shell/PlatformFilter";
import { CHART, ColumnChart, InlineBar, Legend, TrendChart, Waterfall, fmtCompactMoney, fmtMoney, fmtPct } from "./charts";
import { Card, Kpi, Pills, SalesTable, SortTable } from "./parts";

export type AnalyticsTab = "insights" | "orders" | "expenses" | "pnl";
const TABS: { key: AnalyticsTab; label: string }[] = [
  { key: "insights", label: "Insights" },
  { key: "orders", label: "Orders" },
  { key: "expenses", label: "Expenses" },
  { key: "pnl", label: "Profit & Loss" },
];
type InsightSub = Exclude<InsightPage, "profit">;
const INSIGHT_PAGES: { key: InsightSub; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "marketplaces", label: "Marketplaces" },
  { key: "brands", label: "Brands & categories" },
  { key: "inventory", label: "Inventory health" },
  { key: "sourcing", label: "Sourcing" },
];

// Miles are deducted at the IRS standard rate for business driving.
export const MILEAGE_RATE = 0.7;

interface Ctx {
  today: string;
  range: DateRange;
  lines: SaleLine[];
  prevLines: SaleLine[];
  allLines: SaleLine[];
  inventory: InventoryItem[];
  activeNow: InventoryItem[];
  sold: Map<string, string>;
  expenses: Expense[];
  allExpenses: Expense[];
  settings: Settings;
  onOpenOrder: (o: Order) => void;
  go: (page: InsightPage, brand?: string) => void;
  saveSettings: (s: Settings) => void;
  saveInventory: (items: InventoryItem[]) => void;
  saveExpenses: (items: Expense[]) => void;
  deleteExpenses: (ids: string[]) => void;
}

export function AnalyticsView({
  orders,
  inventory,
  expenses,
  settings,
  onOpenOrder,
  saveSettings,
  saveInventory,
  saveExpenses,
  deleteExpenses,
  initialTab,
}: {
  orders: Order[];
  inventory: InventoryItem[];
  expenses: Expense[];
  settings: Settings;
  onOpenOrder: (o: Order) => void;
  saveSettings: (s: Settings) => void;
  saveInventory: (items: InventoryItem[]) => void;
  saveExpenses: (items: Expense[]) => void;
  deleteExpenses: (ids: string[]) => void;
  initialTab?: string | null;
}) {
  const [tab, setTab] = useState<AnalyticsTab>(TABS.some((t) => t.key === initialTab) ? (initialTab as AnalyticsTab) : "insights");
  const [page, setPage] = useState<InsightSub>("overview");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());
  const [brand, setBrand] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const today = isoDay(new Date());

  const everyLine = useMemo(() => saleLines(orders, inventory), [orders, inventory]);
  const sold = useMemo(() => soldDates(inventory, orders), [inventory, orders]);

  // The marketplace filter, and a brand or category picked on a page, narrow every page.
  const ctx: Ctx = useMemo(() => {
    const keepLine = (l: SaleLine) =>
      (platforms.size === 0 || platforms.has(l.platform)) && (!brand || l.brand === brand) && (!category || l.category === category);
    const keepItem = (i: InventoryItem) =>
      (platforms.size === 0 || listedOn(i).some((p) => platforms.has(p))) && (!brand || i.brand === brand) && (!category || i.category === category);
    const allLines = everyLine.filter(keepLine);
    const earliest = allLines.reduce((m, l) => (l.date < m ? l.date : m), today);
    const range = presetRange(preset, today, earliest);
    const inv = inventory.filter(keepItem);
    return {
      today,
      range,
      lines: linesIn(allLines, range),
      prevLines: linesIn(allLines, previousRange(range)),
      allLines,
      inventory: inv,
      activeNow: activeOn(inv, sold, today),
      sold,
      expenses: expenses.filter((e) => e.date >= range.start && e.date <= range.end),
      allExpenses: expenses,
      settings,
      onOpenOrder,
      go: (p, b) => {
        if (p === "profit") setTab("pnl");
        else {
          setTab("insights");
          setPage(p);
        }
        if (b !== undefined) setBrand(b);
      },
      saveSettings,
      saveInventory,
      saveExpenses,
      deleteExpenses,
    };
  }, [everyLine, inventory, sold, expenses, platforms, brand, category, preset, today, settings, onOpenOrder, saveSettings, saveInventory, saveExpenses, deleteExpenses]);

  const showRange = !(tab === "insights" && page === "inventory");
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Sales, profit and what to do next, across every marketplace">
        <PlatformFilter
          orders={orders}
          active={platforms}
          onToggle={(p) => {
            const next = new Set(platforms);
            if (next.has(p)) next.delete(p);
            else next.add(p);
            setPlatforms(next);
          }}
          onClear={() => setPlatforms(new Set())}
        />
      </PageHeader>
      <div className="px-4 md:px-8 border-b border-border flex gap-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? "border-[#B5607A] text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-4 md:px-8 py-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="overflow-x-auto max-w-full">{tab === "insights" && <Pills value={page} options={INSIGHT_PAGES} onChange={setPage} />}</div>
          {showRange && (
            <div className="overflow-x-auto max-w-full">
              <Pills value={preset} options={RANGE_PRESETS} onChange={setPreset} />
            </div>
          )}
        </div>
        {(brand || category) && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Showing only</span>
            {brand && (
              <button type="button" onClick={() => setBrand(null)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-[#B5607A] border border-[#B5607A]/30">
                Brand: {brand} <X className="w-3 h-3" />
              </button>
            )}
            {category && (
              <button type="button" onClick={() => setCategory(null)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-[#B5607A] border border-[#B5607A]/30">
                Category: {category} <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        {tab === "insights" && page === "overview" && <Overview ctx={ctx} preset={preset} />}
        {tab === "insights" && page === "marketplaces" && <MarketplacesPage ctx={ctx} />}
        {tab === "insights" && page === "brands" && <BrandsPage ctx={ctx} brand={brand} category={category} setBrand={setBrand} setCategory={setCategory} />}
        {tab === "insights" && page === "inventory" && <InventoryPage ctx={ctx} />}
        {tab === "insights" && page === "sourcing" && <SourcingPage ctx={ctx} />}
        {tab === "orders" && <OrdersReport ctx={ctx} />}
        {tab === "expenses" && <ExpensesPage ctx={ctx} />}
        {tab === "pnl" && <ProfitAndLoss ctx={ctx} />}
      </div>
    </div>
  );
}


const rangeText = (r: DateRange) => `${shortDate(r.start)} – ${shortDate(r.end)}`;

// --- Overview -----------------------------------------------------------------------------------

function Overview({ ctx, preset }: { ctx: Ctx; preset: RangePreset }) {
  const { range, lines, prevLines, today } = ctx;
  const prev = previousRange(range);
  const cur = metrics(lines, activeOn(ctx.inventory, ctx.sold, range.end).length);
  const before = metrics(prevLines, activeOn(ctx.inventory, ctx.sold, prev.end).length);
  const points = series(lines, range);
  const [picked, setPicked] = useState<number | null>(null);
  const pickedLines = picked != null && points[picked] ? lines.filter((l) => l.date >= points[picked].start && l.date <= points[picked].end) : null;
  const tied = ctx.activeNow.reduce((a, i) => a + (i.cost ?? 0), 0);
  const tips = insights({ lines, allLines: ctx.allLines, active: ctx.activeNow, today });
  const compare = preset === "all" ? "" : "vs previous period";
  const days = byWeekday(lines);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Sales" value={fmtMoney(cur.revenue)} delta={change(cur.revenue, before.revenue)} hint={compare} spark={points.map((p) => p.revenue)} sparkColor={CHART.revenue} />
        <Kpi label="Profit" value={fmtMoney(cur.profit)} delta={change(cur.profit, before.profit)} hint="after fees, shipping, cost" spark={points.map((p) => p.profit)} onClick={() => ctx.go("profit")} />
        <Kpi label="Margin" value={fmtPct(cur.margin)} delta={cur.margin != null && before.margin != null ? cur.margin - before.margin : null} hint="of each sale you keep" points />
        <Kpi label="Items sold" value={String(cur.units)} delta={change(cur.units, before.units)} hint={`${cur.orders} orders`} spark={points.map((p) => p.units)} sparkColor={CHART.revenue} />
        <Kpi label="Average sale" value={cur.avgPrice == null ? "–" : fmtMoney(cur.avgPrice)} delta={change(cur.avgPrice, before.avgPrice)} hint={cur.avgProfit == null ? undefined : `${fmtMoney(cur.avgProfit)} profit each`} />
        <Kpi label="Days to sell" value={cur.avgDaysToSell == null ? "–" : String(Math.round(cur.avgDaysToSell))} delta={change(cur.avgDaysToSell, before.avgDaysToSell)} upIsGood={false} hint="from listing to sale" />
        <Kpi label="Sell-through" value={fmtPct(cur.sellThrough)} delta={cur.sellThrough != null && before.sellThrough != null ? cur.sellThrough - before.sellThrough : null} hint="of listings that sold" points onClick={() => ctx.go("brands")} />
        <Kpi label="Money in inventory" value={fmtMoney(tied)} hint={`${ctx.activeNow.length} items listed now`} onClick={() => ctx.go("inventory")} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          title="Sales and profit"
          subtitle={`${rangeText(range)}. Click a point to see the sales behind it.`}
          right={<Legend items={[{ name: "Sales", color: CHART.revenue }, { name: "Profit", color: CHART.profit }]} />}
        >
          <TrendChart
            labels={points.map((p) => p.label)}
            series={[
              { name: "Sales", color: CHART.revenue, values: points.map((p) => p.revenue) },
              { name: "Profit", color: CHART.profit, values: points.map((p) => p.profit), wash: true },
            ]}
            selected={picked}
            onSelect={setPicked}
          />
          {pickedLines && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-foreground">
                  {points[picked!].start === points[picked!].end ? shortDate(points[picked!].start) : `${shortDate(points[picked!].start)} – ${shortDate(points[picked!].end)}`}: {pickedLines.length} sale
                  {pickedLines.length !== 1 ? "s" : ""}, {fmtMoney(pickedLines.reduce((a, l) => a + l.profit, 0))} profit
                </p>
                <button type="button" onClick={() => setPicked(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Close
                </button>
              </div>
              <SalesTable lines={pickedLines} onOpenOrder={ctx.onOpenOrder} />
            </div>
          )}
        </Card>

        <div className="space-y-4">

          <Card title="What to do next" subtitle="Worked out from your sales and listings">
            {tips.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stands out yet. Tips show up as you sell more.</p>
            ) : (
              <ul className="space-y-2">
                {tips.map((t) => (
                  <InsightRow key={t.title} tip={t} onGo={() => t.page && ctx.go(t.page, t.brand)} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Which days you sell" subtitle={`Items sold by day of the week, ${rangeText(range)}`}>
        <ColumnChart
          data={days.map((d) => ({ label: d.label, value: d.units }))}
          detail={(i) => (
            <>
              <p className="font-medium text-foreground">{days[i].label}</p>
              <p className="text-muted-foreground">
                {days[i].units} sold · {fmtMoney(days[i].profit)} profit
              </p>
            </>
          )}
        />
      </Card>
    </div>
  );
}

function InsightRow({ tip, onGo }: { tip: Insight; onGo: () => void }) {
  const Icon = tip.tone === "good" ? TrendingUp : tip.tone === "warn" ? AlertTriangle : Lightbulb;
  const tone = tip.tone === "good" ? "text-emerald-700 bg-emerald-50" : tip.tone === "warn" ? "text-amber-700 bg-amber-50" : "text-sky-700 bg-sky-50";
  return (
    <li>
      <button type="button" onClick={onGo} className="w-full text-left flex gap-2.5 p-2 -m-2 rounded-lg hover:bg-muted/60">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{tip.title}</span>
          <span className="block text-xs text-muted-foreground">{tip.detail}</span>
        </span>
      </button>
    </li>
  );
}
// --- Profit & Loss ------------------------------------------------------------------------------

const sumExpenses = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);

function ProfitAndLoss({ ctx }: { ctx: Ctx }) {
  const { lines, range } = ctx;
  const m = metrics(lines, null);
  const spent = sumExpenses(ctx.expenses);
  const net = m.profit - spent;
  const byMonth = series(lines, range, "month").map((p) => {
    const mm = metrics(lines.filter((l) => l.date >= p.start && l.date <= p.end), null);
    const ex = sumExpenses(ctx.expenses.filter((e) => e.date >= p.start && e.date <= p.end));
    return { ...p, m: mm, expenses: ex, net: mm.profit - ex };
  });
  const sortedByProfit = [...lines].sort((a, b) => b.profit - a.profit);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Gross sales" value={fmtMoney(m.revenue)} hint={`${m.units} items sold`} />
        <Kpi label="Gross profit" value={fmtMoney(m.profit)} hint="after fees, shipping, cost" />
        <Kpi label="Expenses" value={fmtMoney(spent)} hint={`${ctx.expenses.length} logged`} />
        <Kpi label="Net profit" value={fmtMoney(net)} hint={m.revenue > 0 ? `${fmtPct(net / m.revenue)} of sales` : undefined} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Where the money went" subtitle={`From gross sales to what you keep, ${rangeText(range)}. Hover a bar for its share.`}>
          <Waterfall
            steps={[
              { label: "Gross sales", value: m.revenue, total: true },
              { label: "Fees", value: m.fees },
              { label: "Shipping", value: m.shipping },
              { label: "Item cost", value: m.cogs },
              { label: "Expenses", value: spent },
              { label: "Net profit", value: net, total: true },
            ]}
          />
        </Card>
        <Card title="Per item, on average">
          <dl className="space-y-2 text-sm">
            {[
              ["Sale price", m.avgPrice],
              ["Fees and shipping", m.units ? (m.fees + m.shipping) / m.units : null],
              ["Item cost", m.units - m.missingCost ? m.cogs / (m.units - m.missingCost) : null],
              ["Profit", m.avgProfit],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between border-b border-border/60 pb-2 last:border-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums font-medium">{v == null ? "–" : fmtMoney(v as number, true)}</dd>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <dt className="text-muted-foreground">Return on item cost</dt>
              <dd className="tabular-nums font-medium">{m.roi == null ? "–" : `${m.roi.toFixed(1)}x`}</dd>
            </div>
          </dl>
          {(m.missingCost > 0 || m.estimatedFees > 0) && (
            <p className="mt-3 text-[11px] text-amber-800 bg-amber-50 rounded-md px-2.5 py-2">
              {m.missingCost > 0 && `${m.missingCost} sale${m.missingCost !== 1 ? "s have" : " has"} no item cost, so profit counts them as free. `}
              {m.estimatedFees > 0 && `Fees on ${m.estimatedFees} sale${m.estimatedFees !== 1 ? "s are" : " is"} estimated from each marketplace's fee schedule.`}
            </p>
          )}
        </Card>
      </div>
      <Card title="Monthly statement" subtitle="Each month's sales, costs and expenses, ready for taxes">
        <SortTable
          rows={byMonth}
          rowKey={(r) => r.start}
          initialSort={{ key: "month", desc: true }}
          columns={[
            { key: "month", label: "Month", render: (r) => r.start.slice(0, 7), sort: (r) => r.start },
            { key: "sales", label: "Sales", align: "right", render: (r) => fmtMoney(r.m.revenue), sort: (r) => r.m.revenue },
            { key: "fees", label: "Fees", align: "right", className: "hidden sm:table-cell", render: (r) => fmtMoney(r.m.fees), sort: (r) => r.m.fees },
            { key: "ship", label: "Shipping", align: "right", className: "hidden sm:table-cell", render: (r) => fmtMoney(r.m.shipping), sort: (r) => r.m.shipping },
            { key: "cogs", label: "Item cost", align: "right", className: "hidden md:table-cell", render: (r) => fmtMoney(r.m.cogs), sort: (r) => r.m.cogs },
            { key: "exp", label: "Expenses", align: "right", render: (r) => fmtMoney(r.expenses), sort: (r) => r.expenses },
            { key: "net", label: "Net", align: "right", render: (r) => <span className={r.net < 0 ? "text-rose-700" : ""}>{fmtMoney(r.net)}</span>, sort: (r) => r.net },
          ]}
        />
      </Card>
      <Card title="Net profit over time" subtitle={rangeText(range)}>
        <TrendChart labels={byMonth.map((p) => p.label)} series={[{ name: "Net profit", color: CHART.profit, values: byMonth.map((p) => p.net), wash: true }]} />
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Most profitable sales">
          <SalesTable lines={sortedByProfit.slice(0, 10)} onOpenOrder={ctx.onOpenOrder} />
        </Card>
        <Card title="Least profitable sales" subtitle="Worth a look: low prices, high fees, or a missing cost">
          <SalesTable lines={sortedByProfit.slice(-10).reverse()} onOpenOrder={ctx.onOpenOrder} />
        </Card>
      </div>
      <Exports ctx={ctx} />
    </div>
  );
}


// --- Marketplaces -------------------------------------------------------------------------------

function MarketplacesPage({ ctx }: { ctx: Ctx }) {
  const rows = breakdown(ctx.lines, (l) => l.platform, { items: ctx.activeNow, keyOf: (i) => listedOn(i) }).filter((r) => r.units > 0 || r.active > 0);
  const maxProfit = Math.max(1, ...rows.map((r) => r.profit));
  const keeps = rows
    .filter((r) => r.revenue > 0)
    .map((r) => ({ key: r.key, keep: (r.revenue - r.lines.reduce((a, l) => a + l.fees + l.shipping, 0)) / r.revenue }))
    .sort((a, b) => b.keep - a.keep);
  return (
    <div className="space-y-4">
      <Card title="Marketplaces side by side" subtitle={`${rangeText(ctx.range)}. Click a column header to sort.`}>
        <SortTable
          rows={rows}
          rowKey={(r) => r.key}
          initialSort={{ key: "profit", desc: true }}
          columns={[
            {
              key: "name",
              label: "Marketplace",
              render: (r) => (
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <PlatformIcon platform={r.key as Platform} className="w-4 h-4" /> {r.key}
                </span>
              ),
              sort: (r) => r.key,
            },
            { key: "units", label: "Sold", align: "right", render: (r) => r.units, sort: (r) => r.units },
            { key: "revenue", label: "Sales", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => r.revenue },
            {
              key: "profit",
              label: "Profit",
              render: (r) => (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <span className="w-14 text-right shrink-0">{fmtMoney(r.profit)}</span>
                  <InlineBar value={r.profit} max={maxProfit} />
                </div>
              ),
              sort: (r) => r.profit,
            },
            { key: "margin", label: "Margin", align: "right", render: (r) => fmtPct(r.margin), sort: (r) => r.margin },
            { key: "fees", label: "Fees", align: "right", render: (r) => fmtPct(r.feeRate), sort: (r) => r.feeRate },
            { key: "avg", label: "Avg sale", align: "right", render: (r) => (r.avgPrice == null ? "–" : fmtMoney(r.avgPrice)), sort: (r) => r.avgPrice },
            { key: "days", label: "Days to sell", align: "right", render: (r) => (r.avgDaysToSell == null ? "–" : Math.round(r.avgDaysToSell)), sort: (r) => r.avgDaysToSell },
            { key: "st", label: "Sell-through", align: "right", render: (r) => fmtPct(r.sellThrough), sort: (r) => r.sellThrough },
            { key: "active", label: "Listed now", align: "right", render: (r) => r.active, sort: (r) => r.active },
          ]}
        />
      </Card>
      <Card title="What you keep from every $100 sale" subtitle="After marketplace fees and the shipping you paid">
        <ul className="space-y-2.5">
          {keeps.map((k) => (
            <li key={k.key} className="grid grid-cols-[110px_1fr_56px] items-center gap-3 text-sm">
              <span className="flex items-center gap-2 truncate">
                <PlatformIcon platform={k.key as Platform} className="w-4 h-4" /> {k.key}
              </span>
              <InlineBar value={k.keep} max={1} color={CHART.revenue} />
              <span className="text-right tabular-nums font-medium">{fmtMoney(k.keep * 100)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// --- Brands and categories ----------------------------------------------------------------------

function BrandsPage({
  ctx,
  brand,
  category,
  setBrand,
  setCategory,
}: {
  ctx: Ctx;
  brand: string | null;
  category: string | null;
  setBrand: (b: string | null) => void;
  setCategory: (c: string | null) => void;
}) {
  const [by, setBy] = useState<"brand" | "category">(brand ? "brand" : category ? "category" : "brand");
  const rows = breakdown(ctx.lines, (l) => (by === "brand" ? l.brand : l.category), {
    items: ctx.activeNow,
    keyOf: (i) => [(by === "brand" ? i.brand : i.category) ?? "Unbranded"],
  }).filter((r) => r.units > 0 || r.active > 0);
  const maxProfit = Math.max(1, ...rows.map((r) => r.profit));
  const picked = by === "brand" ? brand : category;
  const pickedRow = rows.find((r) => r.key === picked);
  return (
    <div className="space-y-4">
      <Card
        title={by === "brand" ? "Brands" : "Categories"}
        subtitle="What earns the most for the money and time it takes. Click a row to see its sales and narrow every page to it."
        right={
          <Pills
            value={by}
            options={[
              { key: "brand", label: "By brand" },
              { key: "category", label: "By category" },
            ]}
            onChange={setBy}
          />
        }
      >
        <SortTable
          rows={rows}
          rowKey={(r) => r.key}
          activeKey={picked}
          onRow={(r) => (by === "brand" ? setBrand(brand === r.key ? null : r.key) : setCategory(category === r.key ? null : r.key))}
          initialSort={{ key: "profit", desc: true }}
          limit={15}
          columns={[
            { key: "name", label: by === "brand" ? "Brand" : "Category", render: (r) => <span className="font-medium text-foreground">{r.key}</span>, sort: (r) => r.key },
            { key: "units", label: "Sold", align: "right", render: (r) => r.units, sort: (r) => r.units },
            { key: "active", label: "Listed now", align: "right", render: (r) => r.active, sort: (r) => r.active },
            { key: "st", label: "Sell-through", align: "right", render: (r) => fmtPct(r.sellThrough), sort: (r) => r.sellThrough },
            { key: "days", label: "Days to sell", align: "right", render: (r) => (r.avgDaysToSell == null ? "–" : Math.round(r.avgDaysToSell)), sort: (r) => r.avgDaysToSell },
            { key: "avg", label: "Avg sale", align: "right", render: (r) => (r.avgPrice == null ? "–" : fmtMoney(r.avgPrice)), sort: (r) => r.avgPrice },
            {
              key: "profit",
              label: "Profit",
              render: (r) => (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <span className="w-14 text-right shrink-0">{fmtMoney(r.profit)}</span>
                  <InlineBar value={r.profit} max={maxProfit} />
                </div>
              ),
              sort: (r) => r.profit,
            },
            { key: "roi", label: "Return", align: "right", render: (r) => (r.roi == null ? "–" : `${r.roi.toFixed(1)}x`), sort: (r) => r.roi },
          ]}
        />
      </Card>
      {pickedRow && (
        <Card title={`${pickedRow.key} sales`} subtitle={rangeText(ctx.range)}>
          <SalesTable lines={pickedRow.lines} onOpenOrder={ctx.onOpenOrder} />
        </Card>
      )}
    </div>
  );
}

// --- Inventory health ---------------------------------------------------------------------------

function InventoryPage({ ctx }: { ctx: Ctx }) {
  const { buckets, stale } = aging(ctx.activeNow, ctx.today);
  const drafts = ctx.inventory.filter((i) => i.status === "draft");
  const cost = ctx.activeNow.reduce((a, i) => a + (i.cost ?? 0), 0);
  const value = ctx.activeNow.reduce((a, i) => a + (i.listPrice ?? 0), 0);
  const avgAge = ctx.activeNow.length ? ctx.activeNow.reduce((a, i) => a + daysBetween(i.listedAt!, ctx.today), 0) / ctx.activeNow.length : null;
  const [applied, setApplied] = useState<Set<string>>(new Set());
  // Ordinal: darker is older.
  const ageColor = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

  if (!ctx.inventory.length)
    return (
      <Card title="Inventory health">
        <p className="text-sm text-muted-foreground">
          Inventory health needs your listings. They arrive with the inventory page and Listy, which come next in the plan.
        </p>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Listed now" value={String(ctx.activeNow.length)} hint={`${drafts.length} drafts not listed yet`} />
        <Kpi label="Money tied up" value={fmtMoney(cost)} hint="what those items cost you" />
        <Kpi label="Listed value" value={fmtMoney(value)} hint={cost > 0 ? `${(value / cost).toFixed(1)}x what you paid` : undefined} />
        <Kpi label="Average age" value={avgAge == null ? "–" : `${Math.round(avgAge)} days`} hint="since listing" />
      </div>
      <Card title="How long your listings have been up" subtitle="Older listings sell slower. Hover a column for the money in it.">
        <ColumnChart
          data={buckets.map((b) => ({ label: b.label, value: b.count }))}
          color={(i) => ageColor[i]}
          detail={(i) => (
            <>
              <p className="font-medium text-foreground">{buckets[i].label}</p>
              <p className="text-muted-foreground">{buckets[i].count} items</p>
              <p className="text-muted-foreground">
                {fmtMoney(buckets[i].cost)} cost · {fmtMoney(buckets[i].listValue)} listed
              </p>
            </>
          )}
        />
      </Card>
      <Card
        title="Stale listings and what to do"
        subtitle="Listed over 60 days. Suggested prices never go below 1.25x what you paid."
        right={<span className="text-xs text-muted-foreground">{stale.length} items</span>}
      >
        <SortTable
          rows={stale}
          rowKey={(s) => s.item.id}
          initialSort={{ key: "age", desc: true }}
          limit={12}
          columns={[
            {
              key: "item",
              label: "Item",
              render: (s) => (
                <div className="flex items-center gap-2 min-w-[180px]">
                  {s.item.photo ? <img src={s.item.photo} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-muted shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate max-w-[220px]">{s.item.title}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{s.item.sku}</p>
                  </div>
                </div>
              ),
              sort: (s) => s.item.title,
            },
            { key: "age", label: "Days listed", align: "right", render: (s) => s.age, sort: (s) => s.age },
            { key: "cost", label: "Cost", align: "right", render: (s) => (s.item.cost == null ? "–" : fmtMoney(s.item.cost, true)), sort: (s) => s.item.cost ?? null },
            { key: "price", label: "Price", align: "right", render: (s) => (s.item.listPrice == null ? "–" : fmtMoney(s.item.listPrice)), sort: (s) => s.item.listPrice ?? null },
            {
              key: "suggested",
              label: "Try",
              align: "right",
              render: (s) => (s.suggestedPrice == null ? "–" : <span className="font-medium text-[#B5607A]">{fmtMoney(s.suggestedPrice)}</span>),
              sort: (s) => s.suggestedPrice,
            },
            { key: "advice", label: "Next step", render: (s) => <span className="text-xs text-muted-foreground">{s.advice}</span> },
            {
              key: "act",
              label: "",
              render: (s) =>
                s.suggestedPrice == null ? null : applied.has(s.item.id) ? (
                  <span className="text-[11px] text-emerald-700 whitespace-nowrap">Saved</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.saveInventory([{ ...s.item, listPrice: s.suggestedPrice! }]);
                      setApplied((a) => new Set(a).add(s.item.id));
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-muted whitespace-nowrap"
                    title="Saves the new price in Reship. Change it on the marketplace too."
                  >
                    Use price
                  </button>
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

// --- Sourcing -----------------------------------------------------------------------------------

function SourcingPage({ ctx }: { ctx: Ctx }) {
  // Judged on items bought in the range, whenever they sold, so a source isn't penalized for recent buys alone.
  const bought = ctx.inventory.filter((i) => i.purchasedAt && i.purchasedAt >= ctx.range.start && i.purchasedAt <= ctx.range.end);
  const lineBySku = new Map(ctx.allLines.filter((l) => l.sku).map((l) => [l.sku!.toLowerCase(), l]));
  const groups = new Map<string, InventoryItem[]>();
  bought.forEach((i) => groups.set(i.source || "Not recorded", [...(groups.get(i.source || "Not recorded") ?? []), i]));
  const rows = [...groups.entries()].map(([source, items]) => {
    const soldLines = items.map((i) => lineBySku.get(i.sku.toLowerCase())).filter((l): l is SaleLine => !!l);
    const spent = items.reduce((a, i) => a + (i.cost ?? 0), 0);
    const soldCost = soldLines.reduce((a, l) => a + (l.cost ?? 0), 0);
    const profit = soldLines.reduce((a, l) => a + l.profit, 0);
    const days = soldLines.map((l) => l.daysToSell).filter((d): d is number => d != null);
    return {
      source,
      items: items.length,
      spent,
      avgCost: items.length ? spent / items.length : 0,
      sold: soldLines.length,
      sellThrough: items.length ? soldLines.length / items.length : null,
      profit,
      roi: soldCost > 0 ? profit / soldCost : null,
      days: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    };
  });
  const maxProfit = Math.max(1, ...rows.map((r) => r.profit));
  const best = [...rows].filter((r) => r.sold >= 3 && r.roi != null).sort((a, b) => b.profit / Math.max(1, b.spent) - a.profit / Math.max(1, a.spent))[0];

  if (!ctx.inventory.length)
    return (
      <Card title="Sourcing">
        <p className="text-sm text-muted-foreground">Record where you buy items in your inventory and this page shows which places pay off best.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {best && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            <span className="font-medium">{best.source}</span> pays off best: every {fmtMoney(1)} spent there has made {fmtMoney(best.profit / Math.max(1, best.spent), true)} in profit so far, and{" "}
            {fmtPct(best.sellThrough)} of what you bought has sold.
          </p>
        </div>
      )}
      <Card title="Where you buy" subtitle={`Items bought ${rangeText(ctx.range)}, and how they've done since`}>
        <SortTable
          rows={rows}
          rowKey={(r) => r.source}
          initialSort={{ key: "profit", desc: true }}
          columns={[
            { key: "source", label: "Source", render: (r) => <span className="font-medium text-foreground">{r.source}</span>, sort: (r) => r.source },
            { key: "items", label: "Bought", align: "right", render: (r) => r.items, sort: (r) => r.items },
            { key: "spent", label: "Spent", align: "right", render: (r) => fmtMoney(r.spent), sort: (r) => r.spent },
            { key: "avg", label: "Avg cost", align: "right", render: (r) => fmtMoney(r.avgCost, true), sort: (r) => r.avgCost },
            { key: "st", label: "Sold so far", align: "right", render: (r) => `${r.sold} (${fmtPct(r.sellThrough)})`, sort: (r) => r.sellThrough },
            { key: "days", label: "Days to sell", align: "right", render: (r) => (r.days == null ? "–" : Math.round(r.days)), sort: (r) => r.days },
            {
              key: "profit",
              label: "Profit",
              render: (r) => (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <span className="w-14 text-right shrink-0">{fmtMoney(r.profit)}</span>
                  <InlineBar value={r.profit} max={maxProfit} />
                </div>
              ),
              sort: (r) => r.profit,
            },
            { key: "roi", label: "Return", align: "right", render: (r) => (r.roi == null ? "–" : `${r.roi.toFixed(1)}x`), sort: (r) => r.roi },
          ]}
        />
      </Card>
    </div>
  );
}

// --- Orders report ------------------------------------------------------------------------------

function OrdersReport({ ctx }: { ctx: Ctx }) {
  const { lines, range } = ctx;
  const where = (l: SaleLine) => l.order.shipTo?.state || "Unknown";
  const states = breakdown(lines, where).sort((a, b) => b.revenue - a.revenue);
  const countries = new Set(lines.map((l) => l.order.shipTo?.country).filter(Boolean));
  const max = Math.max(1, ...states.map((s) => s.revenue));
  return (
    <div className="space-y-4">
      <Card title="Every sale" subtitle={`${lines.length} items sold, ${rangeText(range)}. Click a row to open the order.`}>
        <SortTable
          rows={lines}
          rowKey={(l) => `${l.order.id}-${l.name}`}
          initialSort={{ key: "date", desc: true }}
          onRow={(l) => ctx.onOpenOrder(l.order)}
          limit={25}
          columns={[
            { key: "date", label: "Date", render: (l) => shortDate(l.date), sort: (l) => l.date },
            { key: "item", label: "Item", render: (l) => <span className="flex items-center gap-1.5 min-w-0"><PlatformIcon platform={l.platform} /> <span className="truncate max-w-56">{l.name}</span></span>, sort: (l) => l.name },
            { key: "buyer", label: "Buyer", className: "hidden md:table-cell", render: (l) => l.order.buyer, sort: (l) => l.order.buyer },
            { key: "state", label: "Ships to", className: "hidden sm:table-cell", render: (l) => [l.order.shipTo?.state, l.order.shipTo?.country].filter(Boolean).join(", ") || "–", sort: (l) => where(l) },
            { key: "price", label: "Price", align: "right", render: (l) => fmtMoney(l.price, true), sort: (l) => l.price },
            { key: "profit", label: "Profit", align: "right", render: (l) => fmtMoney(l.profit, true), sort: (l) => l.profit },
          ]}
        />
      </Card>
      <Card title="Where buyers are" subtitle={countries.size > 1 ? `Buyers in ${countries.size} countries` : "Sales by the state they ship to"}>
        <SortTable
          rows={states}
          rowKey={(r) => r.key}
          initialSort={{ key: "sales", desc: true }}
          limit={10}
          columns={[
            { key: "state", label: "State", render: (r) => r.key, sort: (r) => r.key },
            { key: "bar", label: "", className: "w-1/3 hidden sm:table-cell", render: (r) => <InlineBar value={r.revenue} max={max} color={CHART.revenue} /> },
            { key: "units", label: "Sold", align: "right", render: (r) => r.units, sort: (r) => r.units },
            { key: "sales", label: "Sales", align: "right", render: (r) => fmtMoney(r.revenue), sort: (r) => r.revenue },
          ]}
        />
      </Card>
    </div>
  );
}

// --- Expenses -----------------------------------------------------------------------------------

function ExpensesPage({ ctx }: { ctx: Ctx }) {
  const [date, setDate] = useState(ctx.today);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[1]);
  const [amount, setAmount] = useState("");
  const [miles, setMiles] = useState("");
  const [note, setNote] = useState("");
  const mileage = category === "Mileage";
  const total = sumExpenses(ctx.expenses);
  const cats = EXPENSE_CATEGORIES.map((c) => ({ c, v: sumExpenses(ctx.expenses.filter((e) => e.category === c)) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...cats.map((c) => c.v));
  const add = () => {
    const m = parseFloat(miles) || 0;
    const value = mileage ? Math.round(m * MILEAGE_RATE * 100) / 100 : parseFloat(amount) || 0;
    if (value <= 0) return;
    ctx.saveExpenses([{ id: crypto.randomUUID(), date, category, amount: value, note: note.trim() || undefined, miles: mileage ? m : undefined }]);
    setAmount("");
    setMiles("");
    setNote("");
  };
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Add an expense" subtitle="Supplies, subscriptions, mileage and other costs that aren't tied to one item">
          <form
            className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input type="date" aria-label="Date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            <select aria-label="Category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {mileage ? (
              <input aria-label="Miles driven" className={inputClass} inputMode="decimal" placeholder="Miles" value={miles} onChange={(e) => setMiles(e.target.value)} />
            ) : (
              <input aria-label="Amount in dollars" className={inputClass} inputMode="decimal" placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
            <input aria-label="Note" className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className={`${primaryButton} flex items-center justify-center gap-1.5`}>
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>
          {mileage && <p className="text-[11px] text-muted-foreground mt-2">Mileage counts at ${MILEAGE_RATE.toFixed(2)} a mile, the IRS standard rate.</p>}
        </Card>
        <Card title="By category" subtitle={`${fmtMoney(total)} total, ${rangeText(ctx.range)}`}>
          {cats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {cats.map((r) => (
                <li key={r.c} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span>{r.c}</span>
                    <span className="tabular-nums font-medium">{fmtMoney(r.v)}</span>
                  </div>
                  <InlineBar value={r.v} max={max} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Expense log" subtitle={`${ctx.expenses.length} expenses, ${rangeText(ctx.range)}`}>
        <SortTable
          rows={ctx.expenses}
          rowKey={(e) => e.id}
          initialSort={{ key: "date", desc: true }}
          limit={25}
          columns={[
            { key: "date", label: "Date", render: (e) => shortDate(e.date), sort: (e) => e.date },
            { key: "cat", label: "Category", render: (e) => e.category, sort: (e) => e.category },
            { key: "note", label: "Note", className: "hidden sm:table-cell", render: (e) => <span className="text-muted-foreground">{e.miles ? `${e.miles} mi${e.note ? ` · ${e.note}` : ""}` : (e.note ?? "")}</span> },
            { key: "amount", label: "Amount", align: "right", render: (e) => fmtMoney(e.amount, true), sort: (e) => e.amount },
            {
              key: "del",
              label: "",
              align: "right",
              render: (e) => (
                <button type="button" aria-label={`Delete ${e.category} expense`} onClick={() => ctx.deleteExpenses([e.id])} className="p-1 text-muted-foreground hover:text-rose-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

// --- Exports ------------------------------------------------------------------------------------

function download(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(new Blob([Papa.unparse(rows)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function Exports({ ctx }: { ctx: Ctx }) {
  const { lines, range } = ctx;
  const tag = `${range.start}_to_${range.end}`;
  const reports = [
    {
      title: "Sales",
      text: "Every item sold, with price, fees, shipping, cost and profit.",
      run: () =>
        download(
          `reship-sales-${tag}.csv`,
          lines.map((l) => ({
            Date: l.date,
            Marketplace: l.platform,
            Order: l.order.orderId,
            Item: l.name,
            SKU: l.sku ?? "",
            Brand: l.brand,
            Category: l.category,
            Buyer: l.order.buyer,
            State: l.order.shipTo?.state ?? "",
            Country: l.order.shipTo?.country ?? "",
            "Sale price": r2(l.price),
            Fees: r2(l.fees),
            "Fees estimated": l.feesEstimated ? "yes" : "no",
            Shipping: r2(l.shipping),
            "Item cost": l.cost == null ? "" : r2(l.cost),
            Profit: r2(l.profit),
            "Days to sell": l.daysToSell ?? "",
          })),
        ),
    },
    {
      title: "Profit and loss by month",
      text: "Gross sales, fees, shipping, cost of goods, expenses and net profit for each month.",
      run: () =>
        download(
          `reship-profit-and-loss-${tag}.csv`,
          series(lines, range, "month").map((p) => {
            const m = metrics(lines.filter((l) => l.date >= p.start && l.date <= p.end), null);
            const ex = sumExpenses(ctx.expenses.filter((e) => e.date >= p.start && e.date <= p.end));
            return {
              Month: p.start.slice(0, 7),
              "Items sold": m.units,
              "Gross sales": r2(m.revenue),
              "Marketplace fees": r2(m.fees),
              "Shipping paid": r2(m.shipping),
              "Cost of goods sold": r2(m.cogs),
              Expenses: r2(ex),
              "Net profit": r2(m.profit - ex),
            };
          }),
        ),
    },
    {
      title: "Expenses",
      text: "Every logged expense, with mileage, for your records.",
      run: () =>
        download(
          `reship-expenses-${tag}.csv`,
          ctx.expenses.map((e) => ({ Date: e.date, Category: e.category, Amount: r2(e.amount), Miles: e.miles ?? "", Note: e.note ?? "" })),
        ),
    },
    {
      title: "Active inventory",
      text: "Everything listed or in drafts, with cost, price and days listed. Handy for year-end counts.",
      run: () =>
        download(
          `reship-inventory-${ctx.today}.csv`,
          [...ctx.activeNow, ...ctx.inventory.filter((i) => i.status === "draft")].map((i) => ({
            SKU: i.sku,
            Item: i.title,
            Brand: i.brand ?? "",
            Category: i.category ?? "",
            Status: i.status,
            Quantity: i.quantity ?? 1,
            Source: i.source ?? "",
            "Bought on": i.purchasedAt ?? "",
            "Listed on": i.listedAt ?? "",
            "Days listed": i.listedAt ? daysBetween(i.listedAt, ctx.today) : "",
            Cost: i.cost ?? "",
            "List price": i.listPrice ?? "",
            Marketplaces: listedOn(i).join(", "),
          })),
        ),
    },
  ];
  return (
    <Card title="Download reports" subtitle="CSV files that open in Excel or Google Sheets">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {reports.map((r) => (
          <div key={r.title} className="rounded-lg border border-border p-3 flex flex-col">
            <p className="text-sm font-medium text-foreground">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3 flex-1">{r.text}</p>
            <button type="button" onClick={r.run} className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted">
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Includes sales you added by hand or imported, so in-person sales count too. {fmtCompactMoney(metrics(lines, null).revenue)} in sales across {lines.length} items in this period.
      </p>
    </Card>
  );
}
