import { useCallback, useEffect, useState } from "react";
import { Bug, Check, HelpCircle, Heart, Lightbulb, Mail, Sparkles, Star } from "lucide-react";
import type { Feedback, FeedbackKind, FeedbackStatus, FeedbackSummary } from "@/lib/types";
import { FEEDBACK_AREAS } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { Field, inputClass, primaryButton, secondaryButton } from "../ui";
import { PageHeader } from "../shell/PageHeader";

type Data = ReturnType<typeof useReshipData>;
type Tab = "send" | "summaries" | "all";

const KINDS: { kind: FeedbackKind; label: string; icon: typeof Bug }[] = [
  { kind: "idea", label: "Idea", icon: Lightbulb },
  { kind: "bug", label: "Something's broken", icon: Bug },
  { kind: "confusing", label: "Confusing", icon: HelpCircle },
  { kind: "praise", label: "I love this", icon: Heart },
];
const STATUSES: FeedbackStatus[] = ["new", "planned", "done", "declined"];
const PRIORITY_TONE = { high: "bg-rose-50 text-rose-800", medium: "bg-amber-50 text-amber-800", low: "bg-muted text-muted-foreground" };
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function FeedbackPage({ data, tab: initialTab }: { data: Data; tab?: string | null }) {
  const store = data.store;
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab === "summaries" || initialTab === "all" ? initialTab : "send");
  const [items, setItems] = useState<Feedback[]>([]);
  const [summaries, setSummaries] = useState<FeedbackSummary[]>([]);

  const load = useCallback(async () => {
    const [isAdmin, list] = await Promise.all([store.isFeedbackAdmin(), store.listFeedback()]);
    setAdmin(isAdmin);
    setItems(list);
    if (isAdmin) setSummaries(await store.listFeedbackSummaries());
  }, [store]);
  useEffect(() => {
    load();
  }, [load]);

  const tabs: { key: Tab; label: string }[] = [{ key: "send", label: "Send feedback" }];
  if (admin) tabs.push({ key: "summaries", label: "AI summaries" }, { key: "all", label: `All feedback (${items.length})` });

  return (
    <div>
      <PageHeader title="Feedback" subtitle="Tell us what's working, what isn't, and what you'd change" />
      {tabs.length > 1 && (
        <div className="px-4 md:px-8 border-b border-border flex gap-5 overflow-x-auto">
          {tabs.map((t) => (
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
      )}
      <div className="px-4 md:px-8 py-5 max-w-3xl">
        {tab === "send" && <SendFeedback data={data} mine={items.filter((f) => f.mine)} onSent={load} />}
        {tab === "summaries" && <Summaries data={data} summaries={summaries} onRan={load} />}
        {tab === "all" && (
          <AllFeedback
            items={items}
            onStatus={async (id, status) => {
              await store.setFeedbackStatus(id, status).catch(() => undefined);
              setItems((list) => list.map((f) => (f.id === id ? { ...f, status } : f)));
            }}
          />
        )}
      </div>
    </div>
  );
}

function SendFeedback({ data, mine, onSent }: { data: Data; mine: Feedback[]; onSent: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [area, setArea] = useState(FEEDBACK_AREAS[0]);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | undefined>();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const send = async () => {
    if (!message.trim()) return;
    setState("sending");
    try {
      await data.store.sendFeedback({ kind, area, message: message.trim().slice(0, 5000), rating, page: window.location.hash || undefined });
      setMessage("");
      setRating(undefined);
      setState("sent");
      onSent();
    } catch {
      setState("error");
    }
  };
  return (
    <div className="space-y-6">
      <form
        className="rounded-xl border border-border bg-card p-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of feedback">
          {KINDS.map(({ kind: k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs ${kind === k ? "border-[#B5607A] bg-rose-50/60 text-[#B5607A]" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <Field label="Which part of Reship?">
          <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value)}>
            {FEEDBACK_AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="What's on your mind?">
          <textarea
            className={`${inputClass} min-h-28`}
            maxLength={5000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (state !== "sending") setState("idle");
            }}
            placeholder={kind === "bug" ? "What did you do, what happened, and what did you expect?" : "The more detail, the better."}
          />
        </Field>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1" aria-label="How happy are you with Reship overall?">
            <span className="text-xs text-muted-foreground mr-1">Overall</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? undefined : n)} className="p-0.5">
                <Star className={`w-4 h-4 ${rating && n <= rating ? "fill-[#B5607A] text-[#B5607A]" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <button type="submit" className={primaryButton} disabled={!message.trim() || state === "sending"}>
            {state === "sending" ? "Sending…" : "Send"}
          </button>
        </div>
        {state === "sent" && (
          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Thanks. Every message is read, and it helps decide what gets built next.
          </p>
        )}
        {state === "error" && <p className="text-xs text-rose-700">That didn't send. Check your connection and try again.</p>}
      </form>
      {mine.length > 0 && (
        <section>
          <h2 className="font-display text-sm font-semibold text-foreground mb-2">What you've sent</h2>
          <ul className="space-y-2">
            {mine.map((f) => (
              <FeedbackRow key={f.id} f={f} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FeedbackRow({ f, onStatus }: { f: Feedback; onStatus?: (s: FeedbackStatus) => void }) {
  const meta = KINDS.find((k) => k.kind === f.kind)!;
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <meta.icon className="w-3.5 h-3.5" /> {meta.label} · {f.area} · {when(f.createdAt)}
          {f.rating ? ` · ${f.rating}★` : ""}
        </span>
        {onStatus ? (
          <select aria-label="Status" className="text-[11px] border border-border rounded px-1 py-0.5 bg-background capitalize" value={f.status} onChange={(e) => onStatus(e.target.value as FeedbackStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span className="capitalize">{f.status}</span>
        )}
      </div>
      <p className="text-foreground whitespace-pre-wrap">{f.message}</p>
    </li>
  );
}

function AllFeedback({ items, onStatus }: { items: Feedback[]; onStatus: (id: string, s: FeedbackStatus) => void }) {
  const [kind, setKind] = useState<FeedbackKind | "all">("all");
  const [status, setStatus] = useState<FeedbackStatus | "all">("new");
  const shown = items.filter((f) => (kind === "all" || f.kind === kind) && (status === "all" || f.status === status));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select aria-label="Filter by kind" className={`${inputClass} w-auto`} value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind | "all")}>
          <option value="all">Every kind</option>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" className={`${inputClass} w-auto capitalize`} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus | "all")}>
          <option value="all">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((f) => (
            <FeedbackRow key={f.id} f={f} onStatus={(s) => onStatus(f.id, s)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Summaries({ data, summaries, onRan }: { data: Data; summaries: FeedbackSummary[]; onRan: () => void }) {
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    setRunning(true);
    try {
      setNote(await data.store.summarizeFeedback());
      onRan();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't run the summary.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#B5607A]" /> Claude reads new feedback and writes you a summary
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">It runs on the schedule you set up and emails you each one. Only you can see this page.</p>
        </div>
        <button type="button" className={secondaryButton} onClick={run} disabled={running}>
          {running ? "Summarizing…" : "Summarize now"}
        </button>
        {note && <p className="w-full text-xs text-muted-foreground">{note}</p>}
      </div>
      {summaries.length === 0 && <p className="text-sm text-muted-foreground">No summaries yet. The first one appears after the next run.</p>}
      {summaries.map((s) => (
        <SummaryCard key={s.id} s={s} />
      ))}
    </div>
  );
}

function SummaryCard({ s }: { s: FeedbackSummary }) {
  const d = s.summary;
  return (
    <article className="rounded-xl border border-border bg-card p-4 space-y-4">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {s.sample ? "Example summary · " : ""}
          {when(s.periodStart)} – {when(s.periodEnd)} · {s.count} messages · {d.sentiment}
        </p>
        <h2 className="font-display text-base font-semibold text-foreground mt-1">{d.headline}</h2>
        {s.emailedTo && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3" /> Emailed to {s.emailedTo}
          </p>
        )}
      </header>
      {d.decisions.length > 0 && (
        <section className="rounded-lg bg-rose-50/60 border border-[#B5607A]/20 p-3">
          <h3 className="text-xs font-semibold text-[#B5607A] mb-2">Decisions for you</h3>
          <ul className="space-y-2 text-sm">
            {d.decisions.map((x) => (
              <li key={x.question}>
                <p className="font-medium text-foreground">{x.question}</p>
                <p className="text-xs text-muted-foreground">Options: {x.options.join(" · ")}</p>
                <p className="text-xs text-foreground">Recommended: {x.recommendation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-3">
        {d.themes.map((t) => (
          <div key={t.title} className="border-l-2 border-border pl-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
              {t.title}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_TONE[t.priority]}`}>{t.priority}</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                {t.mentions} mention{t.mentions !== 1 ? "s" : ""}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.summary}</p>
            {t.quotes.map((q) => (
              <p key={q} className="text-xs italic text-foreground/80 mt-1">
                "{q}"
              </p>
            ))}
            <p className="text-xs text-[#B5607A] mt-1">{t.suggestion}</p>
          </div>
        ))}
      </section>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <ListBlock title="Bugs to fix" items={d.bugs} />
        <ListBlock title="Quick wins" items={d.quickWins} />
      </div>
    </article>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">None this time.</p>
      )}
    </div>
  );
}
