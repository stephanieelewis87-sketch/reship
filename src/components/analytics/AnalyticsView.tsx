import { useMemo, useState } from "react";
import Papa from "papaparse";
import { AlertTriangle, Download, Lightbulb, Sparkles, Target, TrendingUp, X } from "lucide-react";
import type { InventoryItem, Order, Platform, Settings } from "@/lib/types";
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
  goalPace,
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
import { PlatformIcon, inputClass } from "../ui";
import { CHART, ColumnChart, InlineBar, Legend, TrendChart, Waterfall, fmtCompactMoney, fmtMoney, fmtPct } from "./charts";
import { Card, Kpi, Pills, SalesTable, SortTable } from "./parts";

export type AnalyticsPage = InsightPage | "reports";
const PAGES: { key: AnalyticsPage; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "profit", label: "Profit" },
  { key: "marketplaces", label: "Marketplaces" },
  { key: "brands", label: "Brands & categories" },
  { key: "inventory", label: "Inventory health" },
  { key: "sourcing", label: "Sourcing" },
  { key: "reports", label: "Reports" },
];

interface Ctx {
  today: string;
  range: DateRange;
  lines: SaleLine[];
  prevLines: SaleLine[];
  allLines: SaleLine[];
  inventory: InventoryItem[];
  activeNow: InventoryItem[];
  sold: Map<string, string>;
  settings: Settings;
  onOpenOrder: (o: Order) => void;
  go: (page: AnalyticsPage, brand?: string) => void;
  saveSettings: (s: Settings) => void;
  saveInventory: (items: InventoryItem[]) => void;
}

export function AnalyticsView({
  orders,
  inventory,
  settings,
  platforms,
  onOpenOrder,
  saveSettings,
  saveInventory,
}: {
  orders: Order[];
  inventory: InventoryItem[];
  settings: Settings;
  platforms: Set<Platform>;
  onOpenOrder: (o: Order) => void;
  saveSettings: (s: Settings) => void;
  saveInventory: (items: InventoryItem[]) => void;
}) {
  const [page, setPage] = useState<AnalyticsPage>("overview");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [brand, setBrand] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const today = isoDay(new Date());

  const everyLine = useMemo(() => saleLines(orders, inventory), [orders, inventory]);
  const sold = useMemo(() => soldDates(inventory, orders), [inventory, orders]);

  // The sidebar's marketplace filter, and a brand or category picked on a page, narrow every page.
  const ctx: Ctx = useMemo(() => {
    const keepLine = (l: SaleLine) =>
      (platforms.size === 0 || platforms.has(l.platform)) && (!brand || l.brand === brand) && (!category || l.category === category);
    const keepItem = (i: InventoryItem) =>
      (platforms.size === 0 || i.platforms.some((p) => platforms.has(p))) && (!brand || i.brand === brand) && (!category || i.category === category);
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
      settings,
      onOpenOrder,
      go: (p, b) => {
        setPage(p);
        if (b !== undefined) setBrand(b);
      },
      saveSettings,
      saveInventory,
    };
  }, [everyLine, inventory, sold, platforms, brand, category, preset, today, settings, onOpenOrder, saveSettings, saveInventory]);

  return (
    <div className="px-4 md:px-8 py-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="overflow-x-auto max-w-full">
          <Pills value={page} options={PAGES} onChange={setPage} />
        </div>
        {page !== "inventory" && (
          <div className="overflow-x-auto max-w-full">
            <Pills value={preset} options={RANGE_PRESETS} onChange={setPreset} />
          </div>
        )}
      </div>
      {(brand || category || platforms.size > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Showing only</span>
          {[...platforms].map((p) => (
            <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
              <PlatformIcon platform={p} /> {p}
            </span>
          ))}
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
      {page === "overview" && <Overview ctx={ctx} preset={preset} />}
      {page === "profit" && <ProfitPage ctx={ctx} />}
      {page === "marketplaces" && <MarketplacesPage ctx={ctx} />}
      {page === "brands" && <BrandsPage ctx={ctx} brand={brand} category={category} setBrand={setBrand} setCategory={setCategory} />}
      {page === "inventory" && <InventoryPage ctx={ctx} />}
      {page === "sourcing" && <SourcingPage ctx={ctx} />}
      {page === "reports" && <ReportsPage ctx={ctx} />}
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
          <GoalCard ctx={ctx} />
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

function GoalCard({ ctx }: { ctx: Ctx }) {
  const goal = ctx.settings.monthlyProfitGoal;
  const [draft, setDraft] = useState(goal ? String(goal) : "");
  const [editing, setEditing] = useState(!goal);
  const save = () => {
    const n = Math.max(0, Math.round(parseFloat(draft) || 0));
    ctx.saveSettings({ ...ctx.settings, monthlyProfitGoal: n });
    setEditing(!n);
  };
  if (editing || !goal)
    return (
      <Card title="Monthly profit goal" subtitle="See every day whether you're on pace">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input className={inputClass} inputMode="decimal" placeholder="e.g. 1500" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Monthly profit goal in dollars" />
          <button type="submit" className="px-3 py-1.5 rounded-md bg-[#B5607A] text-white text-xs font-medium shrink-0">
            Set goal
          </button>
        </form>
      </Card>
    );
  const pace = goalPace(ctx.allLines, ctx.today, goal);
  const done = Math.min(1, pace.soFar / goal);
  const expected = pace.dayOfMonth / pace.daysInMonth;
  return (
    <Card
      title="Monthly profit goal"
      subtitle={`${fmtMoney(pace.soFar)} of ${fmtMoney(goal)} so far this month`}
      right={
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground">
          Change
        </button>
      }
    >
      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${done * 100}%`, background: CHART.profit }} />
      </div>
      <div className="relative h-3">
        <div className="absolute top-0 w-px h-3 bg-foreground/40" style={{ left: `${expected * 100}%` }} title="Where you'd be at an even pace" />
      </div>
      <p className={`text-xs flex items-center gap-1.5 ${pace.onTrack ? "text-emerald-700" : "text-amber-700"}`}>
        <Target className="w-3.5 h-3.5" />
        {pace.onTrack
          ? `On pace for ${fmtMoney(pace.projected)} this month.`
          : `On pace for ${fmtMoney(pace.projected)}. ${fmtMoney((goal - pace.soFar) / Math.max(1, pace.daysInMonth - pace.dayOfMonth))} a day from here gets you there.`}
      </p>
    </Card>
  );
}

// --- Profit -------------------------------------------------------------------------------------

function ProfitPage({ ctx }: { ctx: Ctx }) {
  const { lines, range } = ctx;
  const m = metrics(lines, null);
  const byMonth = series(lines, range);
  const sortedByProfit = [...lines].sort((a, b) => b.profit - a.profit);
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Where the money went" subtitle={`From gross sales to what you keep, ${rangeText(range)}. Hover a bar for its share.`}>
          <Waterfall
            steps={[
              { label: "Gross sales", value: m.revenue, total: true },
              { label: "Fees", value: m.fees },
              { label: "Shipping", value: m.shipping },
              { label: "Item cost", value: m.cogs },
              { label: "Profit", value: m.profit, total: true },
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
      <Card title="Profit over time" subtitle={rangeText(range)}>
        <TrendChart
          labels={byMonth.map((p) => p.label)}
          series={[{ name: "Profit", color: CHART.profit, values: byMonth.map((p) => p.profit), wash: true }]}
        />
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Most profitable sales">
          <SalesTable lines={sortedByProfit.slice(0, 10)} onOpenOrder={ctx.onOpenOrder} />
        </Card>
        <Card title="Least profitable sales" subtitle="Worth a look: low prices, high fees, or a missing cost">
          <SalesTable lines={sortedByProfit.slice(-10).reverse()} onOpenOrder={ctx.onOpenOrder} />
        </Card>
      </div>
    </div>
  );
}

// --- Marketplaces -------------------------------------------------------------------------------

function MarketplacesPage({ ctx }: { ctx: Ctx }) {
  const rows = breakdown(ctx.lines, (l) => l.platform, { items: ctx.activeNow, keyOf: (i) => i.platforms }).filter((r) => r.units > 0 || r.active > 0);
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

// --- Reports ------------------------------------------------------------------------------------

function download(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(new Blob([Papa.unparse(rows)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function ReportsPage({ ctx }: { ctx: Ctx }) {
  const { lines, range } = ctx;
  const tag = `${range.start}_to_${range.end}`;
  const reports = [
    {
      title: "Sales",
      text: "Every item sold, with price, fees, shipping, cost and profit. Opens in Excel or Google Sheets.",
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
      text: "Gross sales, fees, shipping, cost of goods and profit for each month, for taxes.",
      run: () =>
        download(
          `reship-profit-and-loss-${tag}.csv`,
          series(lines, range, "month").map((p) => {
            const m = metrics(lines.filter((l) => l.date >= p.start && l.date <= p.end), null);
            return {
              Month: p.start.slice(0, 7),
              "Items sold": m.units,
              "Gross sales": r2(m.revenue),
              "Marketplace fees": r2(m.fees),
              "Shipping paid": r2(m.shipping),
              "Cost of goods sold": r2(m.cogs),
              Profit: r2(m.profit),
            };
          }),
        ),
    },
    {
      title: "Inventory on hand",
      text: "Everything listed or in drafts, with cost, price and days listed. Handy for year-end inventory counts.",
      run: () =>
        download(
          `reship-inventory-${ctx.today}.csv`,
          [...ctx.activeNow, ...ctx.inventory.filter((i) => i.status === "draft")].map((i) => ({
            SKU: i.sku,
            Item: i.title,
            Brand: i.brand ?? "",
            Category: i.category ?? "",
            Status: i.status,
            Source: i.source ?? "",
            "Bought on": i.purchasedAt ?? "",
            "Listed on": i.listedAt ?? "",
            "Days listed": i.listedAt ? daysBetween(i.listedAt, ctx.today) : "",
            Cost: i.cost ?? "",
            "List price": i.listPrice ?? "",
            Marketplaces: i.platforms.join(", "),
          })),
        ),
    },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {reports.map((r) => (
        <Card key={r.title} title={r.title} subtitle={r.title === "Inventory on hand" ? "As of today" : rangeText(range)}>
          <p className="text-xs text-muted-foreground mb-3">{r.text}</p>
          <button type="button" onClick={r.run} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted">
            <Download className="w-3.5 h-3.5" /> Download CSV
          </button>
        </Card>
      ))}
      <p className="md:col-span-3 text-[11px] text-muted-foreground">
        Includes sales you added by hand or imported, so in-person and offline sales count too. Totals: {fmtCompactMoney(metrics(lines, null).revenue)} in sales across {lines.length} items.
      </p>
    </div>
  );
}
