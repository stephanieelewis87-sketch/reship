import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, Copy, DollarSign, Gift, PackageX, Plus, Printer, ShoppingBag, Sparkles, Tag, Target, Trash2, TrendingUp, X, Zap } from "lucide-react";
import type { Goal, GoalMetric, GoalPeriod } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { isoDay, linesIn, metrics, saleLines } from "@/lib/analytics";
import { GOAL_METRICS, GOAL_PERIODS, goalProgress } from "@/lib/goals";
import { duplicateSkus, isPartiallyDelisted, listedOn, relistState } from "@/lib/inventory";
import { summarize } from "@/lib/orderStatus";
import { automationOn, isAddressComplete } from "@/lib/types";
import { newId } from "@/lib/ids";
import { usePrintLabels, type PrintNotice } from "@/lib/usePrintLabels";
import { Card, Pills } from "../analytics/parts";
import { CHART, fmtMoney } from "../analytics/charts";
import { go } from "../shell/route";
import { WithdrawShortcuts } from "../WithdrawShortcuts";
import { EmptyState, Modal, ModalHeader, inputClass, orderTitle, selectClass } from "../ui";

type Data = ReturnType<typeof useReshipData>;

export function HomePage({ data }: { data: Data }) {
  const today = isoDay(new Date());
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <header className="relative overflow-hidden border-b border-border px-4 md:px-8 py-6 md:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 120% at 0% 0%, rgba(217,155,122,0.16), transparent 60%), radial-gradient(40% 90% at 100% 0%, rgba(185,115,79,0.10), transparent 70%)" }}
        />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-metal mt-1">
              {greeting}
              {data.settings.displayName ? `, ${data.settings.displayName}` : ""}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setNewsOpen(true)}
              className="relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card/60 text-sm text-foreground hover:bg-muted"
            >
              <Sparkles className="w-4 h-4 text-accent" /> What's new
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background" aria-label="New updates" />
            </button>
            <PrintAllButton data={data} onNotice={setNotice} />
          </div>
        </div>
      </header>
      {newsOpen && <WhatsNew onClose={() => setNewsOpen(false)} />}
      {notice && (
        <div className={`px-4 md:px-8 py-2 border-b text-xs flex items-center gap-2 ${notice.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="px-4 md:px-8 py-6 space-y-5">
        <GettingStarted data={data} />
        <TodaySummary data={data} today={today} />
        <div className="grid lg:grid-cols-2 gap-5">
          <NeedsAttention data={data} today={today} />
          <Goals data={data} today={today} />
        </div>
        <AffiliatesCard />
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
    { id: "automation", label: "Turn on an automation", done: automationOn(settings.automations), href: "#/automations" },
    { id: "goal", label: "Set a goal", done: settings.goals.length > 0, href: "#/home" },
    { id: "expense", label: "Log a business expense", done: data.expenses.length > 0, href: "#/analytics?tab=expenses" },
  ].map((s) => ({ ...s, done: s.done || settings.gettingStartedDone.includes(s.id) }));
  const left = steps.filter((s) => !s.done).length;
  const [expanded, setExpanded] = useState(false);
  if (left === 0 || settings.gettingStartedDone.includes("hidden")) return null;
  const next = steps.find((s) => !s.done)!;
  const hide = () => saveSettings({ ...settings, gettingStartedDone: [...settings.gettingStartedDone, "hidden"] });
  return (
    <section className="bg-card border border-border rounded-xl px-4 md:px-5 py-3.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-9 h-9 shrink-0" aria-hidden>
          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-muted" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke={CHART.profit}
              strokeDasharray={`${((steps.length - left) / steps.length) * 94.2} 94.2`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-foreground">
            {steps.length - left}/{steps.length}
          </span>
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
          <p className="text-sm font-medium text-foreground">Getting started</p>
          <p className="text-xs text-muted-foreground truncate">Next: {next.label}</p>
        </div>
        <a href={next.href} className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent-hover">
          Do this next
        </a>
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-xs text-muted-foreground hover:text-foreground">
          {expanded ? "Show less" : "All steps"}
        </button>
        <button type="button" onClick={hide} aria-label="Hide getting started" className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3 pt-3 border-t border-border">
          {steps.map((s) => (
            <li key={s.id}>
              <a href={s.done ? undefined : s.href} className={`flex items-center gap-2 text-sm ${s.done ? "text-muted-foreground line-through" : "text-foreground hover:text-accent"}`}>
                {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Today's summary ----------------------------------------------------------------------------

function TodaySummary({ data, today }: { data: Data; today: string }) {
  const lines = linesIn(saleLines(data.orders, data.inventory), { start: today, end: today });
  const m = metrics(lines, null);
  const listedToday = data.inventory.reduce((n, i) => n + i.listings.filter((l) => l.listedAt === today).length, 0);
  const relistsToday = data.inventory.reduce((n, i) => n + i.listings.filter((l) => l.relistedAt === today).length, 0);
  const autos = data.settings.automations;
  const Stat = ({ label, value, hint, href, icon: Icon }: { label: string; value: string; hint?: string; href: string; icon: typeof Tag }) => (
    <a href={href} className="group bg-card border border-border rounded-2xl px-4 py-4 hover:border-accent/50 hover:-translate-y-0.5 transition-all">
      <span className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <Icon className="w-3.5 h-3.5" />
        </span>
      </span>
      <p className="font-display text-2xl md:text-[1.7rem] font-semibold text-foreground mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </a>
  );
  return (
    <section>
      <h2 className="font-display text-sm font-semibold text-foreground mb-2.5">Today</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Listed" value={String(listedToday)} hint="new listings today" href="#/inventory" icon={Tag} />
        <Stat label="Sold" value={String(m.units)} hint={`${m.orders} order${m.orders !== 1 ? "s" : ""}`} href="#/orders" icon={ShoppingBag} />
        <Stat label="Revenue" value={fmtMoney(m.revenue)} hint="before fees" href="#/analytics" icon={DollarSign} />
        <Stat label="Profit" value={fmtMoney(m.profit)} hint="after fees and cost" href="#/analytics" icon={TrendingUp} />
      </div>
      <a href="#/automations" className="mt-3 flex items-center gap-3 flex-wrap bg-card border border-border rounded-2xl px-4 py-3 text-sm hover:border-accent/50">
        <span className="flex items-center gap-1.5 text-foreground font-medium">
          <Zap className="w-3.5 h-3.5 text-accent" /> Automations
        </span>
        {(
          [
            ["Relists", "relists", relistsToday],
            ["Offers", "offers", null],
          ] as const
        ).map(([label, kind, n]) => {
          const isOn = automationOn(autos, kind);
          return (
            <span key={kind} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${isOn ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              {label} {isOn ? (n != null ? `· ${n} today` : "on") : "off"}
            </span>
          );
        })}
        <span className="ml-auto text-xs text-accent">{automationOn(autos) ? "Manage" : "Turn on"}</span>
      </a>
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
        tab === "open" ? (
          <EmptyState icon={CheckCircle2} title="All clear" text="Nothing needs you right now. Problems with orders and listings show up here." />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Nothing dismissed.</p>
        )
      ) : (
        <ul className="divide-y divide-border">
          {shown.slice(0, 8).map((i) => (
            <li key={i.id} className="flex items-start gap-2.5 py-2.5">
              <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${i.tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>{i.icon}</span>
              <a href={i.href} className="min-w-0 flex-1 group">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-accent">{i.title}</p>
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
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-accent hover:underline">
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
            <button type="submit" className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-2 text-xs text-muted-foreground">
              Cancel
            </button>
          </form>
        )}
        {settings.goals.length === 0 && !adding ? (
          <EmptyState icon={Target} title="No goals yet" text="Set a profit, sales or listing goal and see your pace here every day." action={{ label: "Add a goal", onClick: () => setAdding(true) }} />
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
  { date: "Nov 3, 2026", text: "A simpler look: the menu is grouped into Sell and Grow, Inventory has one Add button for every way to add items, and Settings is grouped into four sections. Shares and follows are gone from Automations, since Poshmark no longer rewards them." },
  { date: "Oct 31, 2026", text: "List from photos: upload photos of up to 25 items at once, and AI sorts them into one listing per item, then writes each one with a suggested price." },
  { date: "Oct 30, 2026", text: "List with a video: film up to 25 items, and AI finds each one, keeps snips from the video, makes a clean photo, and writes the listing with a suggested price." },
  { date: "Oct 29, 2026", text: "A new layout: Home, Inventory, Automations, Orders, Analytics and Settings, with goals and a needs-attention list here on Home." },
  { date: "Oct 28, 2026", text: "Analytics: true profit after fees, shipping and item cost, marketplaces side by side, inventory aging with suggested markdowns, and sourcing returns." },
  { date: "Oct 26, 2026", text: "Mercari orders and labels sync through the browser extension." },
];

function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="What's new" onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader
        title="What's new"
        subtitle="The latest changes to SellSync"
        onClose={onClose}
        icon={
          <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </span>
        }
      />
      <ul className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto">
        {RELEASES.map((r, i) => (
          <li key={r.date} className="relative pl-5">
            <span className={`absolute left-0 top-1.5 w-2 h-2 rounded-full ${i === 0 ? "bg-accent" : "bg-muted-foreground/40"}`} />
            <p className="text-[11px] text-muted-foreground">{r.date}</p>
            <p className="text-sm text-foreground mt-0.5">{r.text}</p>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// --- Affiliates ---------------------------------------------------------------------------------

// Points sellers at the affiliate dashboard, which is easy to miss in the menu.
function AffiliatesCard() {
  return (
    <a
      href="#/affiliates"
      className="relative overflow-hidden flex items-center gap-4 flex-wrap rounded-2xl border border-accent/30 px-5 py-4 hover:border-accent/60 transition-colors"
      style={{ background: "linear-gradient(110deg, rgba(217,155,122,0.14), rgba(22,18,17,0.6) 60%)" }}
    >
      <span className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0">
        <Gift className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-semibold text-foreground">Earn with SellSync Affiliates</span>
        <span className="block text-xs text-muted-foreground mt-0.5">Get a seller's first month, then 5% of what they pay, for life. Your link and earnings are on your Affiliates dashboard.</span>
      </span>
      <span className="flex items-center gap-1 text-xs font-medium text-accent">
        Open dashboard <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </a>
  );
}
