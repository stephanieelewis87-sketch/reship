import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Copy, Gavel, Loader2, Pin, Radio, RefreshCw, Square, Users } from "lucide-react";
import { LocalSellSource, type SellSourceApi } from "@/lib/sellsourceStore";
import { AUCTION_SECONDS, type MarketListing, type Show, auctionOpen, highBid, showUrl, startAuction } from "@/lib/sellsource";
import { type VideoSession, startHost } from "@/lib/liveVideo";
import { AuctionStatus, ChatPanel, money, useLiveShow, useNow } from "./parts";
import { primaryButton, secondaryButton, selectClass } from "../ui";
import { go } from "../shell/route";

const PRACTICE_NAMES = ["mia_thrifts", "jordan.k", "vintagevibes", "sam_resells", "closetqueen", "dee"];
const PRACTICE_CHAT = ["What size is that?", "Love this!", "Can you show the tag?", "🔥🔥", "Is it true to size?", "Bundle please!", "Hi from Ohio 👋"];

// The host's screen during a show: camera, the running order of items, auctions and chat.
export function LiveStudio({ api, showId, onBack }: { api: SellSourceApi; showId: string; onBack: () => void }) {
  const live = useLiveShow(api, showId);
  const { show, listings, bids, chat } = live;
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<VideoSession | null>(null);
  const [camState, setCamState] = useState<"off" | "starting" | "on" | "error">("off");
  const [camError, setCamError] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState<boolean | null>(null); // false: no video service, own camera only
  const [seconds, setSeconds] = useState(30);
  const [practice, setPractice] = useState(api instanceof LocalSellSource);
  const [copied, setCopied] = useState(false);
  const now = useNow(!!show?.auction && auctionOpen(show.auction));

  useEffect(() => () => session.current?.stop(), []);

  // Practice viewers: a few pretend people chat and bid so a host can try a show alone (demo only).
  useEffect(() => {
    if (!(api instanceof LocalSellSource) || !practice || show?.status !== "live") return;
    const t = setInterval(() => {
      const name = PRACTICE_NAMES[Math.floor(Math.random() * PRACTICE_NAMES.length)];
      if (show.auction && auctionOpen(show.auction) && Math.random() < 0.55) void api.practiceBid(show.id, name);
      else if (Math.random() < 0.35) void api.practiceChat(show.id, name, PRACTICE_CHAT[Math.floor(Math.random() * PRACTICE_CHAT.length)]);
    }, 2200);
    return () => clearInterval(t);
  }, [api, practice, show]);

  if (show === undefined) return <p className="text-sm text-muted-foreground text-center py-20">Loading…</p>;
  if (!show) return <p className="text-sm text-muted-foreground text-center py-20">This show isn't here anymore.</p>;

  const update = (patch: Partial<Show>) => {
    const next = { ...show, ...patch };
    live.setShow(next);
    void api.updateShow(next);
  };

  const startCamera = async () => {
    if (!video.current) return;
    setCamState("starting");
    setCamError(null);
    try {
      const access = await api.video(show.id, "host", show.shopName);
      setVideoOn(!!access);
      session.current?.stop();
      session.current = await startHost(video.current, access);
      setCamState("on");
    } catch (e) {
      setCamError((e as Error).message);
      setCamState("error");
    }
  };

  const goLive = async () => {
    if (camState !== "on") await startCamera();
    update({ status: "live", pinnedId: show.pinnedId ?? listings.find((l) => l.status === "active")?.id });
  };

  const end = () => {
    session.current?.stop();
    setCamState("off");
    update({ status: "ended", auction: show.auction && auctionOpen(show.auction) ? { ...show.auction, endsAt: new Date().toISOString() } : show.auction });
  };

  const pinned = listings.find((l) => l.id === show.pinnedId);
  const auctionRunning = auctionOpen(show.auction, now);
  const ended = show.auction && !auctionRunning ? show.auction : undefined;
  const winner = ended ? highBid(bids, ended.listingId) : undefined;
  const endedListing = ended ? listings.find((l) => l.id === ended.listingId) : undefined;
  const link = showUrl(show.id);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-8 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="p-1.5 rounded-md hover:bg-muted" aria-label="Back to shows">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg text-foreground truncate">{show.title}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <StatusPill status={show.status} />
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy the link for buyers
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="hover:text-foreground underline">
              Open as a buyer
            </a>
          </p>
        </div>
        {show.status !== "live" && show.status !== "ended" && (
          <button type="button" onClick={goLive} className={`${primaryButton} bg-rose-600 hover:bg-rose-700 text-white`}>
            <Radio className="w-4 h-4" /> Go live
          </button>
        )}
        {show.status === "live" && (
          <button type="button" onClick={end} className={secondaryButton}>
            <Square className="w-4 h-4" /> End show
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="p-4 md:p-6 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/12] sm:aspect-video max-h-[60vh] w-full">
            <video ref={video} playsInline muted className="w-full h-full object-cover" />
            {camState !== "on" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90 p-6 text-center">
                <Camera className="w-8 h-8" />
                <p className="text-sm max-w-xs">{camState === "error" ? camError : "Your camera shows here. Buyers see it once you go live."}</p>
                <button type="button" onClick={startCamera} disabled={camState === "starting"} className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium flex items-center gap-2">
                  {camState === "starting" && <Loader2 className="w-4 h-4 animate-spin" />} Turn on camera
                </button>
              </div>
            )}
            {camState === "on" && session.current?.flip && (
              <button type="button" onClick={() => void session.current?.flip?.()} className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white" aria-label="Switch camera">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            {show.status === "live" && <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold">LIVE</span>}
            {pinned && (
              <div className="absolute bottom-3 inset-x-3 rounded-xl bg-black/60 backdrop-blur text-white p-3 flex items-center gap-3">
                {pinned.photos[0] && <img src={pinned.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{pinned.title}</p>
                  {show.auction?.listingId === pinned.id ? (
                    <div className="[&_*]:text-white [&_.text-muted-foreground]:text-white/70">
                      <AuctionStatus show={show} bids={bids} now={now} />
                    </div>
                  ) : (
                    <p className="text-xs text-white/80">{pinned.status === "sold" ? "Sold" : `Buy now ${money(pinned.price)}`}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {videoOn === false && camState === "on" && (
            <p className="text-[12px] text-muted-foreground">
              {api instanceof LocalSellSource ? "Demo: your camera works, but there's no video server, so buyers see the item photos instead of you." : "Video isn't set up yet (LiveKit), so buyers see the item photos instead of you. Chat, bids and buying all work."}
            </p>
          )}
          {ended && endedListing && (
            <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 flex-wrap">
              <Gavel className="w-5 h-5 text-accent" />
              <p className="text-sm flex-1 min-w-0">
                {winner ? (
                  <>
                    <strong>{endedListing.title}</strong> won by <strong>{winner.name}</strong> for {money(winner.amount)}.{" "}
                    {endedListing.status === "sold" ? "Paid. It's in your Orders." : "They have a Pay now button on their screen."}
                  </>
                ) : (
                  <>No bids on {endedListing.title}.</>
                )}
              </p>
              {winner && endedListing.status !== "sold" && api instanceof LocalSellSource && winner.name !== show.shopName && (
                <button
                  type="button"
                  onClick={() => void api.checkout({ listingIds: [endedListing.id], showId: show.id, practice: true })}
                  className={`${secondaryButton} py-1.5 text-xs`}
                >
                  Record practice sale
                </button>
              )}
            </div>
          )}
          {api instanceof LocalSellSource && (
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> <Users className="w-3.5 h-3.5" /> Practice viewers (demo: pretend buyers chat and bid)
            </label>
          )}
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-border flex flex-col min-h-0">
          <div className="p-3 border-b border-border flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Items ({listings.filter((l) => l.status === "active").length} left)</p>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              Auctions run
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className={selectClass} aria-label="Auction length">
                {AUCTION_SECONDS.map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="overflow-y-auto max-h-[40vh] lg:max-h-none lg:flex-1 divide-y divide-border">
            {listings.map((l) => (
              <QueueRow
                key={l.id}
                l={l}
                pinned={show.pinnedId === l.id}
                auctioning={auctionRunning && show.auction?.listingId === l.id}
                canAuction={show.status === "live" && !auctionRunning && l.status === "active"}
                onPin={() => update({ pinnedId: l.id })}
                onAuction={() => update({ pinnedId: l.id, auction: startAuction(l.id, Math.max(1, Math.round(l.price * 0.5)), seconds) })}
              />
            ))}
          </ul>
          <div className="border-t border-border h-72 lg:h-[45%] flex flex-col">
            <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">Chat</p>
            <ChatPanel lines={chat} name={show.shopName} onSend={show.status === "live" ? (t) => api.chat(show.id, show.shopName, t) : undefined} className="flex-1" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function QueueRow({ l, pinned, auctioning, canAuction, onPin, onAuction }: { l: MarketListing; pinned: boolean; auctioning: boolean; canAuction: boolean; onPin: () => void; onAuction: () => void }) {
  const sold = l.status === "sold";
  return (
    <li className={`px-3 py-2 flex items-center gap-2.5 ${pinned ? "bg-accent/10" : ""} ${sold ? "opacity-50" : ""}`}>
      <div className="w-10 h-10 rounded-md bg-muted overflow-hidden shrink-0">{l.photos[0] && <img src={l.photos[0]} alt="" className="w-full h-full object-cover" />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{l.title}</p>
        <p className="text-[11px] text-muted-foreground">{sold ? "Sold" : auctioning ? "Auction running" : `Buy now ${money(l.price)}`}</p>
      </div>
      {!sold && (
        <>
          <button type="button" onClick={onPin} disabled={pinned} title="Show this item to buyers" className="p-1.5 rounded-md hover:bg-muted disabled:text-accent">
            <Pin className="w-4 h-4" />
          </button>
          <button type="button" onClick={onAuction} disabled={!canAuction} title="Start a quick auction" className="px-2 py-1 rounded-md border border-border text-xs font-medium hover:bg-muted disabled:opacity-40 flex items-center gap-1">
            <Gavel className="w-3.5 h-3.5" /> Auction
          </button>
        </>
      )}
    </li>
  );
}

export function StatusPill({ status }: { status: Show["status"] }) {
  if (status === "live") return <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">LIVE</span>;
  if (status === "ended") return <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">ENDED</span>;
  return <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-medium">SCHEDULED</span>;
}

export const openStudio = (id: string) => go("live", { show: id });
