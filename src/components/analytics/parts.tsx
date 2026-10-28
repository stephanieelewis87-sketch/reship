import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import type { SaleLine } from "@/lib/analytics";
import { shortDate } from "@/lib/analytics";
import type { Order } from "@/lib/types";
import { PlatformIcon } from "../ui";
import { Sparkline, fmtMoney } from "./charts";

export function Card({ title, subtitle, right, children, className = "" }: { title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-card border border-border rounded-xl p-4 md:p-5 min-w-0 ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            {title && <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// One headline number with its change from the previous period.
export function Kpi({
  label,
  value,
  delta,
  upIsGood = true,
  points = false,
  hint,
  spark,
  sparkColor,
  onClick,
}: {
  label: string;
  value: string;
  delta?: number | null;
  upIsGood?: boolean;
  // The delta is a difference of two percentages, shown in points.
  points?: boolean;
  hint?: string;
  spark?: number[];
  sparkColor?: string;
  onClick?: () => void;
}) {
  const good = delta != null && (delta >= 0) === upIsGood;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left bg-card border border-border rounded-xl px-4 py-3 min-w-0 ${onClick ? "hover:border-[#B5607A]/40 hover:shadow-sm transition-all" : ""}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">{label}</p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <p className="font-display text-2xl font-semibold text-foreground leading-tight">{value}</p>
        {spark && (
          <span className="hidden sm:block">
            <Sparkline values={spark} color={sparkColor} width={72} height={26} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] min-h-[16px]">
        {delta != null && Math.abs(delta) >= 0.005 && (
          <span className={`inline-flex items-center gap-0.5 font-medium whitespace-nowrap ${good ? "text-emerald-700" : "text-rose-700"}`}>
            {delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(Math.round(delta * 100))}
            {points ? " pts" : "%"}
          </span>
        )}
        {hint && <span className="text-muted-foreground truncate">{hint}</span>}
      </div>
    </Tag>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string | null;
  align?: "left" | "right";
  className?: string;
}

// A table whose columns sort when their header is clicked.
export function SortTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRow,
  activeKey,
  limit,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  initialSort?: { key: string; desc: boolean };
  onRow?: (r: T) => void;
  activeKey?: string | null;
  limit?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [showAll, setShowAll] = useState(false);
  const col = columns.find((c) => c.key === sort?.key);
  const sorted =
    col?.sort && sort
      ? [...rows].sort((a, b) => {
          const va = col.sort!(a);
          const vb = col.sort!(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sort.desc ? -cmp : cmp;
        })
      : rows;
  const shown = limit && !showAll ? sorted.slice(0, limit) : sorted;
  return (
    <div className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`py-2 px-2 first:pl-0 last:pr-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-normal whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.sort ? (
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, desc: s?.key === c.key ? !s.desc : true }))}
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                  >
                    {c.label}
                    {sort?.key === c.key && (sort.desc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRow ? () => onRow(r) : undefined}
              className={`border-b border-border/60 last:border-0 ${onRow ? "cursor-pointer hover:bg-muted/50" : ""} ${activeKey === rowKey(r) ? "bg-rose-50/60" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`py-2 px-2 first:pl-0 last:pr-0 tabular-nums ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && sorted.length > limit && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-[#B5607A] hover:underline">
          {showAll ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

// Individual sales behind a number. Clicking one opens its order.
export function SalesTable({ lines, onOpenOrder, limit = 10 }: { lines: SaleLine[]; onOpenOrder: (o: Order) => void; limit?: number }) {
  if (!lines.length) return <p className="text-sm text-muted-foreground py-6 text-center">No sales here.</p>;
  return (
    <SortTable
      rows={lines}
      rowKey={(l) => l.key}
      onRow={(l) => onOpenOrder(l.order)}
      initialSort={{ key: "date", desc: true }}
      limit={limit}
      columns={[
        {
          key: "item",
          label: "Item",
          render: (l) => (
            <div className="flex items-center gap-2 min-w-[180px]">
              {l.photo ? <img src={l.photo} alt="" className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-muted shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate max-w-[220px]">{l.name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <PlatformIcon platform={l.platform} /> {l.platform} · {l.brand}
                </p>
              </div>
            </div>
          ),
          sort: (l) => l.name,
        },
        { key: "date", label: "Sold", render: (l) => <span className="text-xs text-muted-foreground whitespace-nowrap">{shortDate(l.date)}</span>, sort: (l) => l.date },
        { key: "price", label: "Price", align: "right", render: (l) => fmtMoney(l.price), sort: (l) => l.price },
        {
          key: "fees",
          label: "Fees + ship",
          align: "right",
          render: (l) => (
            <span className="text-muted-foreground" title={l.feesEstimated ? "Fees estimated from the marketplace's fee schedule" : undefined}>
              {fmtMoney(l.fees + l.shipping, true)}
              {l.feesEstimated && l.fees > 0 && <span className="text-[10px]"> est.</span>}
            </span>
          ),
          sort: (l) => l.fees + l.shipping,
        },
        {
          key: "cost",
          label: "Cost",
          align: "right",
          render: (l) => (l.cost == null ? <span className="text-[11px] text-amber-700">add</span> : <span className="text-muted-foreground">{fmtMoney(l.cost, true)}</span>),
          sort: (l) => l.cost,
        },
        {
          key: "profit",
          label: "Profit",
          align: "right",
          render: (l) => <span className={`font-medium ${l.profit < 0 ? "text-rose-700" : "text-foreground"}`}>{fmtMoney(l.profit, true)}</span>,
          sort: (l) => l.profit,
        },
        { key: "days", label: "Days to sell", align: "right", render: (l) => (l.daysToSell == null ? "–" : l.daysToSell), sort: (l) => l.daysToSell },
      ]}
    />
  );
}

export function Pills<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${value === o.key ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
