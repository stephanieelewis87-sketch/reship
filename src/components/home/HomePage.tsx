import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock, Copy, PackageX, Plus, Printer, Sparkles, Tag, Trash2, X } from "lucide-react";
import type { Goal, GoalMetric, GoalPeriod } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { isoDay, linesIn, metrics, saleLines } from "@/lib/analytics";
import { GOAL_METRICS, GOAL_PERIODS, goalProgress } from "@/lib/goals";
import { duplicateSkus, isPartiallyDelisted, listedOn, relistState } from "@/lib/inventory";
import { summarize } from "@/lib/orderStatus";
import { isAddressComplete } from "@/lib/types";
import { newId } from "@/lib/ids";
import { usePrintLabels, type PrintNotice } from "@/lib/usePrintLabels";
import { Card, Pills } from "../analytics/parts";
import { CHART, fmtMoney } from "../analytics/charts";
import { PageHeader } from "../shell/PageHeader";
import { go } from "../shell/route";
import { WithdrawShortcuts } from "../WithdrawShortcuts";
import { inputClass, orderTitle, selectClass } from "../ui";

type Data = ReturnType<typeof useReshipData>;

export function HomePage({ data }: { data: Data }) {
  const today = isoDay(new Date());
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <PageHeader
        title={`${greeting}${data.settings.displayName ? `, ${data.settings.displayName}` : ""}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      >
        <PrintAllButton data={data} onNotice={setNotice} />
      </PageHeader>
      {notice && (
        <div className={`px-4 md:px-8 py-2 border-b text-xs flex items-center gap-2 ${notice.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="px-4 md:px-8 py-5 space-y-4">
        <GettingStarted data={data} />
        <TodaySummary data={data} today={today} />
        <div className="grid lg:grid-cols-2 gap-4">
          <NeedsAttention data={data} today={today} />
          <Goals data={data} today={today} />
        </div>
        <WhatsNew />
        <WithdrawShortcuts platforms={[...new Set(data.orders.map((o) => o.platform))]} />
      </div>
    </div>
  );
}

// The day's main job, one click from Home: print every label waiting in To Print.
function PrintAllButton({ data, onNotice }: { data: Data; onNotice: (n: PrintNotice) => void }) {
  const { print, printing } = usePrintLabels(data, onNotice);
  const toPrint = data.orders.filter((o) => o.status === "pending");
  const withLabel = toPrint.filter((o) => o.label).length;
  if (toPrint.length === 0)
    return (
      <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" /> All labels printed
      </span>
    );
  if (withLabel === 0)
    return (
      <button type="button" onClick={() => go("orders")} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 text-amber-950 text-sm font-semibold shadow-md hover:bg-amber-300">
        <Printer className="w-5 h-5" /> {toPrint.length} order{toPrint.length !== 1 ? "s need" : " needs"} a label
      </button>
    );
  return (
    <button
      type="button"
      disabled={printing}
      onClick={() => print(toPrint)}
      className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-amber-400 text-amber-950 text-base font-bold shadow-lg shadow-amber-400/30 ring-2 ring-amber-300 hover:bg-amber-300 hover:shadow-xl disabled:opacity-60 transition"
    >
      <Printer className="w-5 h-5" />
      {printing ? "Preparing…" : `Print all ${withLabel} label${withLabel !== 1 ? "s" : ""}`}
    </button>
  );
}

// --- Getting started ----------------------------------------------------------------------------

function GettingStarted({ data }: { data: Data }) {
  const { settings, saveSettings } = data;
  const steps: { id: string; label: string; done: boolean; href: string }[] = [
    { id: "connect", label: "Connect your marketplaces", done: data.orders.some((o) => o.source === "sync"), href: "#/settings?tab=connections" },
    { id: "ship-from", label: "Add your ship-from address", done: isAddressComplete(settings.shipFrom), href: "#/settings?tab=shipping" },
    { id: "inventory", label: "Add or import your inventory", done: data.inventory.length > 0, href: "#/inventory" },
    { id: "video", label: "List up to 25 items from one video", done: data.inventory.some((i) => i.notes?.includes("Made with List with a video.")), href: "#/inventory?video" },
    { id: "crosslist", label: "Crosslist an item to a second marketplace", done: data.inventory.some((i) => listedOn(i).length > 1), href: "#/inventory" },
    { id: "automation", label: "Turn on an automation", done: Object.values(settings.automations).some((a) => Object.values(a ?? {}).some((x) => x?.enabled)), href: "#/automations" },
    { id: "goal", label: "Set a goal", done: settings.goals.length > 0, href: "#/home" },
    { id: "expense", label: "Log a business expense", done: data.expenses.length > 0, href: "#/analytics?tab=expenses" },
  ].map((s) => ({ ...s, done: s.done || settings.gettingStartedDone.includes(s.id) }));
  const left = steps.filter((s) => !s.done).length;
  if (left === 0 || settings.gettingStartedDone.includes("hidden")) return null;
  return (
    <Card
      title="Getting started"
      subtitle={`${steps.length - left} of ${steps.length} done`}
      right={
        <button type="button" onClick={() => saveSettings({ ...settings, gettingStartedDone: [...settings.gettingStartedDone, "hidden"] })} className="text-xs text-muted-foreground hover:text-foreground">
          Hide
        </button>
      }
    >
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div className="h-full rounded-full" style={{ width: `${((steps.length - left) / steps.length) * 100}%`, background: CHART.profit }} />
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {steps.map((s) => (
          <li key={s.id}>
            <a href={s.done ? undefined : s.href} className={`flex items-center gap-2 text-sm ${s.done ? "text-muted-foreground line-through" : "text-foreground hover:text-[#B5607A]"}`}>
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Today's summary ----------------------------------------------------------------------------

function TodaySummary({ data, today }: { data: Data; today: string }) {
  const lines = linesIn(saleLines(data.orders, data.inventory), { start: today, end: today });
  const m = metrics(lines, null);
  const listedToday = data.inventory.reduce((n, i) => n + i.listings.filter((l) => l.listedAt === today).length, 0);
  const relistsToday = data.inventory.reduce((n, i) => n + i.listings.filter((l) => l.relistedAt === today).length, 0);
  const autos = data.settings.automations;
  const on = (kind: "shares" | "offers" | "follows" | "relists") => Object.values(autos).some((a) => a?.[kind]?.enabled);
  const Stat = ({ label, value, hint, href }: { label: string; value: string; hint?: string; href: string }) => (
    <a href={href} className="bg-card border border-border rounded-xl px-4 py-3 hover:border-[#B5607A]/40 transition-colors">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold text-foreground mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </a>
  );
  return (
    <section>
      <h2 className="font-display text-sm font-semibold text-foreground mb-2">Today's summary</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Units listed" value={String(listedToday)} hint="new listings today" href="#/inventory" />
        <Stat label="Units sold" value={String(m.units)} hint={`${m.orders} order${m.orders !== 1 ? "s" : ""}`} href="#/orders" />
        <Stat label="Revenue" value={fmtMoney(m.revenue)} href="#/analytics" />
        <Stat label="Profit" value={fmtMoney(m.profit)} hint="after fees and cost" href="#/analytics" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        {(
          [
            ["Shares", "shares", null],
            ["Relists", "relists", relistsToday],
            ["Offers", "offers", null],
            ["Follows", "follows", null],
          ] as const
        ).map(([label, kind, n]) => (
          <a key={kind} href="#/automations" className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5 hover:border-[#B5607A]/40">
            <span className="text-sm text-foreground">{label}</span>
            <span className="text-sm tabular-nums text-muted-foreground">{n != null ? n : on(kind) ? "On" : "Off"}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// --- Needs attention ----------------------------------------------------------------------------

interface AttentionItem {
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  href: string;
  tone: "warn" | "info";
}

function NeedsAttention({ data, today }: { data: Data; today: string }) {
  const [tab, setTab] = useState<"open" | "dismissed">("open");
  const { settings, saveSettings } = data;
  const items: AttentionItem[] = [];
  const summary = summarize(data.orders);
  if (summary.late.length)
    items.push({
      id: `late-${summary.late.map((o) => o.id).join(",")}`,
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      title: `${summary.late.length} order${summary.late.length !== 1 ? "s are" : " is"} late to ship`,
      detail: summary.late.slice(0, 2).map(orderTitle).join(" · ") + (summary.late.length > 2 ? ` and ${summary.late.length - 2} more` : ""),
      href: "#/orders",
      tone: "warn",
    });
  if (summary.toPrint)
    items.push({
      id: `print-${today}-${summary.toPrint}`,
      icon: <Printer className="w-3.5 h-3.5" />,
      title: `${summary.toPrint} label${summary.toPrint !== 1 ? "s" : ""} to print`,
      detail: "Print them all in one click from Orders.",
      href: "#/orders",
      tone: "info",
    });
  data.inventory.filter(isPartiallyDelisted).forEach((i) =>
    items.push({
      id: `partial-${i.id}`,
      icon: <PackageX className="w-3.5 h-3.5" />,
      title: `Sold but still listed: ${i.title}`,
      detail: `Take it down on ${listedOn(i).join(" and ")} so nobody buys it twice.`,
      href: `#/inventory?issue=partial`,
      tone: "warn",
    }),
  );
  const stale = data.inventory.filter((i) => i.status === "listed" && i.listings.some((l) => relistState(l, today) === "stale")).length;
  if (stale)
    items.push({
      id: `stale-${Math.floor(stale / 10)}`,
      icon: <Clock className="w-3.5 h-3.5" />,
      title: `${stale} listings haven't been relisted in 60+ days`,
      detail: "Relisting bumps them back to the top of search.",
      href: "#/inventory?issue=stale",
      tone: "info",
    });
  const ready = data.inventory.filter((i) => i.status === "draft" && i.readyToList).length;
  if (ready)
    items.push({
      id: `ready-${ready}`,
      icon: <Sparkles className="w-3.5 h-3.5" />,
      title: `${ready} draft${ready !== 1 ? "s are" : " is"} ready to list`,
      detail: "Publish them from Inventory.",
      href: "#/inventory?status=draft",
      tone: "info",
    });
  const dupes = duplicateSkus(data.inventory);
  if (dupes.size)
    items.push({
      id: `dupes-${[...dupes].join(",")}`,
      icon: <Copy className="w-3.5 h-3.5" />,
      title: `${dupes.size} SKU${dupes.size !== 1 ? "s are" : " is"} used by more than one item`,
      detail: [...dupes].slice(0, 3).join(", ").toUpperCase(),
      href: "#/inventory?issue=duplicate",
      tone: "warn",
    });
  const noCost = data.inventory.filter((i) => i.status !== "sold" && i.cost == null).length;
  if (noCost)
    items.push({
      id: `nocost-${Math.floor(noCost / 5)}`,
      icon: <Tag className="w-3.5 h-3.5" />,
      title: `${noCost} item${noCost !== 1 ? "s have" : " has"} no cost`,
      detail: "Add what you paid so profit is exact.",
      href: "#/inventory?issue=nocost",
      tone: "info",
    });

  const dismissed = new Set(settings.dismissedAttention);
  const shown = items.filter((i) => (tab === "open" ? !dismissed.has(i.id) : dismissed.has(i.id)));
  const toggle = (id: string) =>
    saveSettings({ ...settings, dismissedAttention: dismissed.has(id) ? settings.dismissedAttention.filter((d) => d !== id) : [...settings.dismissedAttention, id] });

  return (
    <Card
      title="Needs attention"
      right={
        <Pills
          value={tab}
          onChange={setTab}
          options={[
            { key: "open", label: `Open (${items.filter((i) => !dismissed.has(i.id)).length})` },
            { key: "dismissed", label: "Dismissed" },
          ]}
        />
      }
    >
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{tab === "open" ? "All clear." : "Nothing dismissed."}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.slice(0, 8).map((i) => (
            <li key={i.id} className="flex items-start gap-2.5 py-2.5">
              <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${i.tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>{i.icon}</span>
              <a href={i.href} className="min-w-0 flex-1 group">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-[#B5607A]">{i.title}</p>
                <p className="text-xs text-muted-foreground truncate">{i.detail}</p>
              </a>
              <button type="button" onClick={() => toggle(i.id)} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0 mt-1">
                {tab === "open" ? "Dismiss" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 8 && <p className="text-xs text-muted-foreground mt-1">and {shown.length - 8} more</p>}
    </Card>
  );
}

// --- Goals --------------------------------------------------------------------------------------

function formatGoal(metric: GoalMetric, n: number) {
  return metric === "profit" || metric === "sales" ? fmtMoney(n) : metric === "sellThrough" ? `${Math.round(n)}%` : String(Math.round(n));
}

function Goals({ data, today }: { data: Data; today: string }) {
  const { settings, saveSettings } = data;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ metric: GoalMetric; period: GoalPeriod; target: string }>({ metric: "profit", period: "month", target: "" });
  const save = (goals: Goal[]) => saveSettings({ ...settings, goals });
  const add = () => {
    const target = parseFloat(draft.target);
    if (!(target > 0)) return;
    save([...settings.goals, { id: newId(), metric: draft.metric, period: draft.period, target }]);
    setAdding(false);
    setDraft({ ...draft, target: "" });
  };
  return (
    <div id="goals">
      <Card
        title="Goals"
        subtitle="Profit, sales, listings or sell-through, by week, month, quarter or year"
        right={
          !adding && (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-[#B5607A] hover:underline">
              <Plus className="w-3 h-3" /> Add goal
            </button>
          )
        }
      >
        {adding && (
          <form
            className="flex flex-wrap gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <select className={selectClass} value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })} aria-label="Goal type">
              {GOAL_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <select className={selectClass} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as GoalPeriod })} aria-label="Goal period">
              {GOAL_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className={`${inputClass} w-28`}
              inputMode="decimal"
              placeholder={draft.metric === "sellThrough" ? "e.g. 40 (%)" : draft.metric === "listings" ? "e.g. 100" : "e.g. 2000"}
              value={draft.target}
              onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              aria-label="Target"
            />
            <button type="submit" className="px-3 py-1.5 rounded-md bg-[#B5607A] text-white text-xs font-medium">
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-2 text-xs text-muted-foreground">
              Cancel
            </button>
          </form>
        )}
        {settings.goals.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No goals yet. Add one to see your pace every day.</p>
        ) : (
          <ul className="space-y-4">
            {settings.goals.map((g) => {
              const p = goalProgress(g, data.orders, data.inventory, today);
              const label = `${GOAL_PERIODS.find((x) => x.key === g.period)!.label} ${GOAL_METRICS.find((x) => x.key === g.metric)!.label.toLowerCase()}`;
              const ahead = g.metric === "sellThrough" ? p.share >= 1 : p.share >= p.expected;
              return (
                <li key={g.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">
                        {formatGoal(g.metric, p.value)} of {formatGoal(g.metric, g.target)}
                      </span>
                      <button type="button" aria-label={`Remove ${label} goal`} onClick={() => save(settings.goals.filter((x) => x.id !== g.id))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(1, p.share) * 100}%`, background: CHART.profit }} />
                    {g.metric !== "sellThrough" && <div className="absolute top-0 bottom-0 w-px bg-foreground/50" style={{ left: `${p.expected * 100}%` }} />}
                  </div>
                  <p className={`text-[11px] mt-1 ${ahead ? "text-emerald-700" : "text-amber-700"}`}>
                    {p.share >= 1 ? "Goal reached." : g.metric === "sellThrough" ? "Below target so far." : ahead ? "Ahead of pace." : "Behind pace. The line marks where an even pace would be today."}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// --- What's new ---------------------------------------------------------------------------------

const RELEASES = [
  { date: "Oct 31, 2026", text: "List from photos: upload photos of up to 25 items at once, and AI sorts them into one listing per item, then writes each one with a suggested price." },
  { date: "Oct 30, 2026", text: "List with a video: film up to 25 items, and AI finds each one, keeps snips from the video, makes a clean photo, and writes the listing with a suggested price." },
  { date: "Oct 29, 2026", text: "A new layout: Home, Inventory, Automations, Orders, Analytics and Settings, with goals and a needs-attention list here on Home." },
  { date: "Oct 28, 2026", text: "Analytics: true profit after fees, shipping and item cost, marketplaces side by side, inventory aging with suggested markdowns, and sourcing returns." },
  { date: "Oct 26, 2026", text: "Mercari orders and labels sync through the browser extension." },
];

function WhatsNew() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Card
      title="What's new"
      right={
        <button type="button" aria-label="Hide what's new" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      }
    >
      <ul className="space-y-2">
        {RELEASES.map((r) => (
          <li key={r.date} className="text-sm flex gap-3">
            <span className="text-xs text-muted-foreground w-24 shrink-0 pt-0.5">{r.date}</span>
            <span className="text-foreground">{r.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

