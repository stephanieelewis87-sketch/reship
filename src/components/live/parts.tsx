import { type FormEvent, useEffect, useRef, useState } from "react";
import { Gavel, Loader2, Send } from "lucide-react";
import type { SellSourceApi } from "@/lib/sellsourceStore";
import { type Bid, type ChatLine, type MarketListing, type Show, auctionOpen, highBid, minNextBid, secondsLeft } from "@/lib/sellsource";

export const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;

export interface LiveState {
  show: Show | null | undefined;
  listings: MarketListing[];
  bids: Bid[];
  chat: ChatLine[];
  sold: { listingId: string; name: string; price: number } | null; // the latest sale, for a banner
  setShow: (s: Show) => void;
  setListings: (ls: MarketListing[]) => void;
}

// Everything on a live show's screen, kept up to date as bids, chat and sales come in.
export function useLiveShow(api: SellSourceApi, showId: string): LiveState {
  const [show, setShow] = useState<Show | null | undefined>(undefined);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [sold, setSold] = useState<LiveState["sold"]>(null);

  useEffect(() => {
    let stale = false;
    (async () => {
      const s = await api.getShow(showId);
      if (stale) return;
      setShow(s);
      if (!s) return;
      const [ls, bs, cs] = await Promise.all([api.getListings(s.listingIds), api.bids(showId), api.chatLines(showId)]);
      if (stale) return;
      setListings(ls);
      setBids(bs);
      setChat(cs);
    })().catch(() => !stale && setShow(null));
    const off = api.subscribe(showId, (e) => {
      if (e.kind === "show") setShow(e.show);
      if (e.kind === "bid") setBids((b) => (b.some((x) => x.id === e.bid.id) ? b : [...b, e.bid]));
      if (e.kind === "chat") setChat((c) => (c.some((x) => x.id === e.line.id) ? c : [...c, e.line].slice(-200)));
      if (e.kind === "sold") {
        setListings((ls) => ls.map((l) => (l.id === e.listingId ? { ...l, status: "sold" } : l)));
        setSold({ listingId: e.listingId, name: e.name, price: e.price });
      }
    });
    return () => {
      stale = true;
      off();
    };
  }, [api, showId]);

  // When a sale isn't reported with the item (real accounts), refresh the item list once.
  useEffect(() => {
    if (!sold || !show) return;
    const t = setTimeout(() => setSold(null), 6000);
    return () => clearTimeout(t);
  }, [sold, show]);

  return { show, listings, bids, chat, sold, setShow, setListings };
}

// Ticks every quarter second while an auction runs.
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function ChatPanel({ lines, onSend, name, className = "" }: { lines: ChatLine[]; onSend?: (text: string) => Promise<void>; name?: string; className?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !onSend) return;
    setBusy(true);
    try {
      await onSend(text);
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 text-sm">
        {lines.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Say hi! Chat shows up here.</p>}
        {lines.map((l) => (
          <p key={l.id} className="leading-snug">
            <span className={`font-semibold mr-1.5 ${l.host ? "text-accent" : "text-foreground"}`}>
              {l.name}
              {l.host && <span className="ml-1 px-1 rounded bg-accent/15 text-[10px] align-middle">HOST</span>}
            </span>
            <span className="text-foreground/90">{l.text}</span>
          </p>
        ))}
        <div ref={end} />
      </div>
      {onSend && (
        <form onSubmit={submit} className="p-2 border-t border-border flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder={name ? `Chat as ${name}` : "Say something"}
            aria-label="Chat message"
            className="flex-1 text-sm px-3 py-2 rounded-full border border-border bg-background focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}

// The auction line on screen: high bid, who has it, and the clock.
export function AuctionStatus({ show, bids, now }: { show: Show; bids: Bid[]; now: number }) {
  const a = show.auction;
  if (!a) return null;
  const top = highBid(bids, a.listingId);
  const open = auctionOpen(a, now);
  const left = secondsLeft(a, now);
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold tabular-nums ${open ? (left <= 5 ? "bg-rose-600 text-white animate-pulse" : "bg-foreground text-background") : "bg-muted text-muted-foreground"}`}>
        <Gavel className="w-3.5 h-3.5" /> {open ? `0:${String(left).padStart(2, "0")}` : "Ended"}
      </span>
      <span className="text-sm">
        {top ? (
          <>
            <strong className="font-semibold">{money(top.amount)}</strong> <span className="text-muted-foreground">{open ? "by" : "won by"} {top.mine ? "you" : top.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Starts at {money(a.startingBid)}</span>
        )}
      </span>
    </div>
  );
}

export function BidButtons({ show, bids, now, onBid }: { show: Show; bids: Bid[]; now: number; onBid: (amount: number) => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = show.auction!;
  const min = minNextBid(a, bids);
  const options = [min, min + Math.max(1, Math.round(min * 0.1)), min + Math.max(5, Math.round(min * 0.25))];
  const bid = async (n: number) => {
    setBusy(n);
    setError(null);
    try {
      await onBid(n);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((n, i) => (
          <button
            key={i}
            type="button"
            disabled={busy !== null || !auctionOpen(a, now)}
            onClick={() => bid(n)}
            className={`py-2.5 rounded-full text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1 ${i === 0 ? "bg-accent text-accent-foreground" : "border border-border bg-card"}`}
          >
            {busy === n && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Bid {money(n)}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-700 mt-1.5">{error}</p>}
    </div>
  );
}
