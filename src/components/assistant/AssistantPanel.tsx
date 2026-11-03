import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles, Square, X } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { type ChatMessage, HISTORY_LIMIT, MAX_QUESTION, STARTERS, assistantAccess, demoAnswer, shopSnapshot } from "@/lib/assistant";
import { isoDay } from "@/lib/analytics";
import { LockedCard, currentPlan } from "../plans/PlanGate";
import type { Section } from "../shell/route";

type Data = ReturnType<typeof useReshipData>;

const CHAT_KEY = "sellsync-assistant-chat";
const loadChat = (): ChatMessage[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string").slice(-50) : [];
  } catch {
    return [];
  }
};
const saveChat = (c: ChatMessage[]) => {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(c.slice(-50)));
  } catch {
    // Private windows can refuse storage; the chat just won't survive a refresh.
  }
};

// The "Ask SellSync" button in the corner of every page, and the chat it opens.
export function AssistantPanel({ data, section, demoMode }: { data: Data; section: Section; demoMode: boolean }) {
  const plan = currentPlan(data.settings);
  const access = assistantAccess(plan);
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>(loadChat);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveChat(chat), [chat]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat, open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const starters = useMemo(() => (access.level === "none" ? [] : STARTERS[demoMode || access.seesShop ? "full" : "helper"]), [access.level, access.seesShop, demoMode]);

  async function ask(text: string) {
    const question = text.trim().slice(0, MAX_QUESTION);
    if (!question || busy) return;
    setError(null);
    setDraft("");
    const history: ChatMessage[] = [...chat, { role: "user", text: question }];
    setChat([...history, { role: "assistant", text: "" }]);
    setBusy(true);
    const show = (soFar: string) => setChat([...history, { role: "assistant", text: soFar }]);
    const today = isoDay(new Date());
    try {
      const api = data.store.assistant;
      if (!api) {
        // Demo mode: canned answers worked out from the sample shop, typed out a little at a time.
        const answer = demoAnswer(question, data, today);
        for (let i = 0; i <= answer.length; i += 6) {
          show(answer.slice(0, i));
          await new Promise((r) => setTimeout(r, 12));
        }
        show(answer);
      } else {
        abort.current = new AbortController();
        const res = await api.ask(
          { messages: history.slice(-HISTORY_LIMIT), page: section, shop: access.seesShop ? shopSnapshot(data, today) : undefined },
          show,
          abort.current.signal,
        );
        if (!res.text) show("Sorry, I didn't get an answer. Try asking again.");
        setLeft(res.left);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setChat(history);
      setDraft(question);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  const stop = () => abort.current?.abort();
  const reset = () => {
    stop();
    setChat([]);
    setError(null);
  };

  const status =
    demoMode ? "Demo answers from your sample shop" : access.level === "full" ? "Knows your shop" : access.level === "helper" ? `How-to answers${left != null ? ` · ${left} left today` : ""}` : "";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask SellSync"
          className="fixed z-30 right-4 bottom-20 md:bottom-5 md:right-5 h-12 w-12 md:w-auto md:px-4 rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent-hover flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Sparkles className="w-5 h-5 md:w-4 md:h-4" />
          <span className="hidden md:inline">Ask SellSync</span>
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="SellSync helper"
          className="fixed z-50 inset-0 md:inset-auto md:bottom-5 md:right-5 md:w-[400px] md:h-[min(640px,calc(100vh-40px))] bg-card md:border md:border-border md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold leading-tight">SellSync helper</p>
              {status && <p className="text-[11px] text-muted-foreground truncate">{status}</p>}
            </div>
            {chat.length > 0 && (
              <button type="button" onClick={reset} aria-label="New chat" title="New chat" className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {access.level === "none" ? (
            <div className="flex-1 flex items-center px-4">
              <LockedCard feature="assistant" compact text="Ask how to do anything in SellSync, get pricing and listing tips, and on Flow, answers about your own inventory, orders and profit." />
            </div>
          ) : (
            <>
              <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite">
                {chat.length === 0 && (
                  <div className="my-auto">
                    <p className="font-display text-base font-semibold">Hi{data.settings.displayName ? `, ${data.settings.displayName}` : ""}! What can I help with?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {access.seesShop || demoMode
                        ? "Ask about SellSync, reselling, or your own shop: what to mark down, what needs to ship, how you're doing."
                        : "Ask how to do anything in SellSync, or for tips on pricing, listing and shipping. On Flow, I can also see your shop."}
                    </p>
                    <div className="mt-4 flex flex-col gap-2">
                      {starters.map((s) => (
                        <button key={s} type="button" onClick={() => ask(s)} className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chat.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="self-end max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-accent text-accent-foreground text-sm whitespace-pre-wrap break-words">
                      {m.text}
                    </div>
                  ) : (
                    <div key={i} className="self-start max-w-[92%] text-sm text-foreground break-words">
                      {m.text ? <Markdown text={m.text} onLink={() => window.innerWidth < 768 && setOpen(false)} /> : <Typing />}
                    </div>
                  ),
                )}
                {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</p>}
              </div>

              <form
                className="border-t border-border p-3 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(draft);
                }}
              >
                <textarea
                  ref={input}
                  rows={1}
                  value={draft}
                  maxLength={MAX_QUESTION}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask(draft);
                    }
                  }}
                  placeholder="Ask anything about selling…"
                  aria-label="Your question"
                  className="flex-1 resize-none max-h-32 text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground focus:border-accent focus:outline-none placeholder:text-muted-foreground/70"
                />
                {busy && !!abort.current ? (
                  <button type="button" onClick={stop} aria-label="Stop" className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0 disabled:opacity-40">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </form>
              <p className="px-4 pb-2 -mt-1 text-[10px] text-muted-foreground">AI answers can be wrong. Check fees and rules on the marketplace.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Typing() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Writing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

// Just enough Markdown for chat answers: paragraphs, bullet and numbered lists, **bold**, `code`
// and links. Links only go to places inside SellSync (#/…) or to https pages, which open in a new tab.
export function Markdown({ text, onLink }: { text: string; onLink?: () => void }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "), onLink)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, onLink)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1">{items}</ol> : <ul key={blocks.length} className="list-disc pl-5 space-y-1">{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#+\s*/, ""));
    }
  }
  flushPara();
  flushList();
  return <div className="flex flex-col gap-2 leading-relaxed">{blocks}</div>;
}

function inline(s: string, onLink?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const k = out.length;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k} className="px-1 py-0.5 rounded bg-muted font-mono text-[12px]">{m[2]}</code>);
    else {
      const href = m[4];
      const inside = href.startsWith("#/");
      if (inside || href.startsWith("https://"))
        out.push(
          <a key={k} href={href} onClick={inside ? onLink : undefined} target={inside ? undefined : "_blank"} rel={inside ? undefined : "noreferrer"} className="text-accent underline underline-offset-2 hover:no-underline">
            {m[3]}
          </a>,
        );
      else out.push(m[3]);
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}
