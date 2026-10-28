import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Small hand-drawn SVG charts in Reship's style: thin marks, hairline grid, a tooltip on hover.
// Each one is one measure in dollars or counts on one axis.

export const CHART = {
  revenue: "#2a78d6",
  profit: "#B5607A",
  grid: "#EEE8E3",
  axis: "#D9D0CA",
  muted: "#8A7880",
  ink: "#1C1017",
  loss: "#d03b3b",
};

export const fmtMoney = (n: number, cents = false) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
export const fmtCompactMoney = (n: number) =>
  Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : fmtMoney(n);
export const fmtPct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Round axis steps: 1, 2, 2.5 or 5 times a power of ten.
function niceTicks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x - 80, 0), width - 160);
  return (
    <div
      className="pointer-events-none absolute z-10 w-40 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
      style={{ left, top: Math.max(y - 8, 0), transform: "translateY(-100%)" }}
    >
      {children}
    </div>
  );
}

export interface TrendSeries {
  name: string;
  color: string;
  values: number[];
  wash?: boolean;
}

// Lines over time, with a crosshair. Clicking a point picks that period.
export function TrendChart({
  labels,
  series,
  format = fmtMoney,
  axisFormat = fmtCompactMoney,
  height = 220,
  selected,
  onSelect,
}: {
  labels: string[];
  series: TrendSeries[];
  format?: (n: number) => string;
  axisFormat?: (n: number) => string;
  height?: number;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 48, r: 12, t: 12, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const n = labels.length;
  const x = (i: number) => pad.l + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => pad.t + h - ((v - lo) / (hi - lo)) * h;
  const every = Math.max(1, Math.ceil(n / Math.floor(w / 56)));
  const active = hover ?? selected ?? null;

  const indexAt = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - pad.l;
    return Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : (px / w) * (n - 1))));
  };

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={series.map((s) => s.name).join(" and ") + " over time"}
        onMouseMove={(e) => setHover(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = indexAt(e.clientX, e.currentTarget.getBoundingClientRect());
          onSelect?.(selected === i ? null : i);
        }}
        className={onSelect ? "cursor-pointer" : undefined}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={CHART.muted} className="tabular-nums">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill={CHART.muted}>
              {l}
            </text>
          ) : null,
        )}
        {active != null && <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + h} stroke={CHART.axis} strokeWidth={1} />}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
          return (
            <g key={s.name}>
              {s.wash && <path d={`${d}L${x(n - 1)},${y(Math.max(lo, 0))}L${x(0)},${y(Math.max(lo, 0))}Z`} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {n <= 1 && <circle cx={x(0)} cy={y(s.values[0] ?? 0)} r={4} fill={s.color} />}
              {active != null && <circle cx={x(active)} cy={y(s.values[active])} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />}
            </g>
          );
        })}
      </svg>
      {active != null && (
        <Tooltip x={x(active)} y={pad.t + Math.min(...series.map((s) => y(s.values[active])))} width={width}>
          <p className="font-medium text-foreground mb-1">{labels[active]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular-nums text-foreground">{format(s.values[active])}</span>
            </p>
          ))}
          {onSelect && <p className="text-[10px] text-muted-foreground mt-1">Click to see these sales</p>}
        </Tooltip>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

// One measure across a few categories, as columns. Used for weekdays and age buckets.
export function ColumnChart({
  data,
  format = (n: number) => String(n),
  color = CHART.profit,
  height = 180,
  detail,
  onSelect,
  selected,
}: {
  data: { label: string; value: number }[];
  format?: (n: number) => string;
  color?: string | ((i: number) => string);
  height?: number;
  detail?: (i: number) => ReactNode;
  onSelect?: (i: number | null) => void;
  selected?: number | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 8, r: 8, t: 20, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = w / data.length;
  const bw = Math.min(24 * 2, band * 0.6);
  const colorAt = (i: number) => (typeof color === "function" ? color(i) : color);
  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label="Column chart">
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + h} y2={pad.t + h} stroke={CHART.axis} />
        {data.map((d, i) => {
          const bh = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * h);
          const cx = pad.l + band * i + band / 2;
          const dim = selected != null && selected !== i;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(selected === i ? null : i)}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <rect x={cx - band / 2} y={pad.t} width={band} height={h} fill="transparent" />
              <path
                d={roundTop(cx - bw / 2, pad.t + h - bh, bw, bh, Math.min(4, bh))}
                fill={colorAt(i)}
                opacity={dim ? 0.35 : hover === i ? 0.85 : 1}
              />
              <text x={cx} y={pad.t + h - bh - 6} textAnchor="middle" fontSize={10} fill={CHART.ink} className="tabular-nums">
                {format(d.value)}
              </text>
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill={CHART.muted}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && detail && (
        <Tooltip x={pad.l + band * hover + band / 2} y={pad.t} width={width}>
          {detail(hover)}
        </Tooltip>
      )}
    </div>
  );
}

const roundTop = (x: number, y: number, w: number, h: number, r: number) =>
  h <= 0 ? "" : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;

// From gross sales down to take-home: each cost hangs from where the last one left off.
export function Waterfall({ steps, height = 220 }: { steps: { label: string; value: number; total?: boolean }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 8, r: 8, t: 22, b: 36 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  let running = 0;
  const bars = steps.map((s) => {
    const from = s.total ? 0 : running;
    const to = s.total ? s.value : running - s.value;
    running = to;
    return { ...s, from, to };
  });
  const max = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const min = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const y = (v: number) => pad.t + h - ((v - min) / (max - min)) * h;
  const band = w / steps.length;
  const bw = Math.min(56, band * 0.62);
  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label="Where the money went, from gross sales to profit">
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke={CHART.axis} />
        {bars.map((b, i) => {
          const cx = pad.l + band * i + band / 2;
          const top = y(Math.max(b.from, b.to));
          const bh = Math.max(2, Math.abs(y(b.from) - y(b.to)));
          const fill = b.total ? (b.to < 0 ? CHART.loss : i === 0 ? CHART.revenue : CHART.profit) : "#C8BAC0";
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {i > 0 && <line x1={cx - band + bw / 2} x2={cx - bw / 2} y1={y(b.from)} y2={y(b.from)} stroke={CHART.axis} />}
              <rect x={cx - bw / 2} y={top} width={bw} height={bh} rx={3} fill={fill} opacity={hover === i ? 0.85 : 1} />
              <text x={cx} y={top - 6} textAnchor="middle" fontSize={10} fill={CHART.ink} className="tabular-nums">
                {b.total ? fmtCompactMoney(b.value) : `-${fmtCompactMoney(b.value)}`}
              </text>
              <text x={cx} y={height - 18} textAnchor="middle" fontSize={10} fill={CHART.muted}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <Tooltip x={pad.l + band * hover + band / 2} y={y(Math.max(bars[hover].from, bars[hover].to))} width={width}>
          <p className="font-medium text-foreground">{bars[hover].label}</p>
          <p className="tabular-nums text-muted-foreground">{fmtMoney(bars[hover].total ? bars[hover].value : -bars[hover].value, true)}</p>
          {!bars[hover].total && bars[0].value > 0 && (
            <p className="text-[10px] text-muted-foreground">{fmtPct(bars[hover].value / bars[0].value)} of gross sales</p>
          )}
        </Tooltip>
      )}
    </div>
  );
}

// A tiny trend line for a stat tile.
export function Sparkline({ values, color = CHART.profit, width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={`${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// A thin horizontal bar inside a table cell, so a column can be compared at a glance.
export function InlineBar({ value, max, color = CHART.profit }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: value < 0 ? CHART.loss : color }} />
    </div>
  );
}
