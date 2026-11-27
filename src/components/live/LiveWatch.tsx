import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Store, Volume2, VolumeX } from "lucide-react";
import type { SellSourceApi } from "@/lib/sellsourceStore";
import { auctionOpen, highBid } from "@/lib/sellsource";
import { type VideoSession, watch } from "@/lib/liveVideo";
import { BrandMark } from "../brand/Logo";
import { AuctionStatus, BidButtons, ChatPanel, money, useLiveShow, useNow } from "./parts";
import { inputClass, primaryButton } from "../ui";

const NAME_KEY = "sellsync.viewer-name.v1";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

// A live show for buyers, at /?live=id. Anyone can watch; a name is needed to chat or bid.
export function LiveWatch({ api, showId, demo }: { api: SellSourceApi; showId: string; demo: boolean }) {
  const live = useLiveShow(api, showId);
  const { show, listings, bids, chat, sold } = live;
  const [name, setName] = useState(savedName);
  // Actions wait for the name prompt, so they read the name when they run, not when they were set up.
  const nameRef = useRef(name);
  nameRef.current = name;
  const [askName, setAskName] = useState<null | (() => void)>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const now = useNow(!!show?.auction && auctionOpen(show.auction));

  // Join the video once the show is live (when a video server is set up).
  const status = show?.status;
  useEffect(() => {
    if (status !== "live" || !video.current) return;
    let session: VideoSession | null = null;
    let stopped = false;
    api
      .video(showId, "viewer", name || "Guest")
      .then(async (access) => {
        if (!access || stopped || !video.current) return;
        session = await watch(video.current, access, setHasVideo);
      })
      .catch(() => setHasVideo(false));
    return () => {
      stopped = true;
      session?.stop();
    };
    // The name only matters when joining; changing it later doesn't rejoin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, showId, status]);

  if (show === undefined) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mt-24" />;
  if (!show) return <p className="text-center text-muted-foreground mt-24">This show isn't here anymore.</p>;

  const pinned = listings.find((l) => l.id === show.pinnedId);
  const auctionHere = !!pinned && show.auction?.listingId === pinned.id;
  const open = auctionOpen(show.auction, now);
  const top = show.auction ? highBid(bids, show.auction.listingId) : undefined;
  const iWon = auctionHere && !open && !!top?.mine && pinned?.status === "active";
  const anyPaid = paid.length > 0;

  const needName = (then: () => void) => {
    if (name.trim()) then();
    else setAskName(() => then);
  };

  const pay = async (listingId: string) => {
    setPaying(true);
    setError(null);
    try {
      const r = await api.checkout({ listingIds: [listingId], showId: show.id, buyerName: nameRef.current });
      if ("url" in r) window.location.assign(r.url);
      else setPaid((p) => [...p, listingId]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-black text-white flex flex-col lg:flex-row overflow-hidden">
      <div className="relative flex-1 min-h-0">
        <video ref={video} playsInline autoPlay muted={muted} className={`absolute inset-0 w-full h-full object-cover ${hasVideo ? "" : "hidden"}`} />
        {!hasVideo && (
          <div className="absolute inset-0">
            {pinned?.photos[0] && <img src={pinned.photos[0]} alt="" className="w-full h-full object-cover opacity-70 blur-[1px]" />}
            <p className="absolute top-16 inset-x-0 text-center text-xs text-white/70">
              {show.status === "scheduled" ? `Starts ${new Date(show.startsAt).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}` : show.status === "ended" ? "This show has ended." : demo ? "Demo: video plays here on real accounts." : "Waiting for the seller's video…"}
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent">
          <a href={`/?shop=${encodeURIComponent(show.handle)}`} className="flex items-center gap-2 min-w-0">
            <BrandMark className="w-8 h-8" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{show.shopName}</p>
              <p className="text-[11px] text-white/70 truncate">{show.title}</p>
            </div>
          </a>
          {show.status === "live" && <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-600 text-[10px] font-bold">LIVE</span>}
          {hasVideo && (
            <button type="button" onClick={() => setMuted((m) => !m)} className="ml-auto p-2 rounded-full bg-black/40" aria-label={muted ? "Sound on" : "Sound off"}>
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>

        {sold && (
          <div className="absolute top-20 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-emerald-600 text-sm font-semibold shadow-lg">Sold to {sold.name} for {money(sold.price)}!</span>
          </div>
        )}

        {/* Chat floats over the video on phones; it has its own column on computers. */}
        <div className="lg:hidden absolute left-0 right-0 bottom-[190px] h-44 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
          <ChatPanel lines={chat.slice(-30)} className="h-full [&_.text-foreground]:text-white [&_.text-foreground\/90]:text-white/90 [&_.text-muted-foreground]:hidden" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent">
          {pinned ? (
            <div className="rounded-2xl bg-card text-foreground p-3 flex flex-col gap-2.5 max-w-xl mx-auto">
              <div className="flex gap-3 items-center">
                {pinned.photos[0] && <img src={pinned.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{pinned.title}</p>
                  <p className="text-xs text-muted-foreground">{[pinned.brand, pinned.size, pinned.condition].filter(Boolean).join(" · ")}</p>
                  {auctionHere ? <AuctionStatus show={show} bids={bids} now={now} /> : <p className="text-sm font-semibold">{money(pinned.price)}</p>}
                </div>
              </div>
              {paid.includes(pinned.id) ? (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> It's yours! It ships with anything else you win this show.
                </p>
              ) : pinned.status === "sold" ? (
                <p className="text-sm text-muted-foreground">Sold</p>
              ) : iWon ? (
                <button type="button" onClick={() => pay(pinned.id)} disabled={paying} className={`${primaryButton} py-3 rounded-full`}>
                  {paying && <Loader2 className="w-4 h-4 animate-spin" />} You won! Pay {money(top!.amount)}
                </button>
              ) : auctionHere && open && show.status === "live" ? (
                <BidButtons show={show} bids={bids} now={now} onBid={(n) => new Promise((res, rej) => needName(() => api.bid(show.id, pinned.id, nameRef.current, n).then(() => res(), rej)))} />
              ) : !auctionHere && show.status === "live" ? (
                <button type="button" onClick={() => needName(() => void pay(pinned.id))} disabled={paying} className={`${primaryButton} py-3 rounded-full`}>
                  {paying && <Loader2 className="w-4 h-4 animate-spin" />} Buy now
                </button>
              ) : null}
              {anyPaid && !paid.includes(pinned.id) && <p className="text-[11px] text-emerald-700">Shipping's covered: more wins this show go in the same package.</p>}
              {error && <p className="text-xs text-rose-700">{error}</p>}
            </div>
          ) : (
            <p className="text-center text-sm text-white/80 pb-4">The seller will show the first item soon.</p>
          )}
          {demo && <p className="text-center text-[11px] text-white/60 mt-2">Demo: checkout is a practice run. No card is charged.</p>}
        </div>
      </div>

      <aside className="hidden lg:flex w-[360px] flex-col bg-card text-foreground border-l border-border">
        <div className="p-3 border-b border-border">
          <p className="text-sm font-semibold">Chat</p>
        </div>
        <ChatPanel lines={chat} name={name} onSend={show.status === "live" ? (t) => new Promise((res, rej) => needName(() => api.chat(show.id, nameRef.current, t).then(res, rej))) : undefined} className="flex-1" />
        <div className="p-3 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Up next</p>
          <div className="flex gap-2 overflow-x-auto">
            {listings
              .filter((l) => l.id !== pinned?.id && l.status === "active")
              .map((l) => (
                <div key={l.id} className="w-16 shrink-0">
                  <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden">{l.photos[0] && <img src={l.photos[0]} alt="" className="w-full h-full object-cover" />}</div>
                  <p className="text-[11px] mt-1 truncate">{money(l.price)}</p>
                </div>
              ))}
          </div>
          <a href={`/?shop=${encodeURIComponent(show.handle)}`} className="mt-3 text-xs text-accent flex items-center gap-1">
            <Store className="w-3.5 h-3.5" /> Visit {show.shopName}'s storefront
          </a>
        </div>
      </aside>

      {/* Phones chat from a bar under the item card. */}
      {show.status === "live" && (
        <div className="lg:hidden bg-card text-foreground">
          <ChatPanel lines={[]} name={name} onSend={(t) => new Promise((res, rej) => needName(() => api.chat(show.id, nameRef.current, t).then(res, rej)))} className="[&>div:first-child]:hidden" />
        </div>
      )}

      {askName && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <form
            className="bg-card text-foreground rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              try {
                localStorage.setItem(NAME_KEY, name.trim());
              } catch {
                // remembered for this page only
              }
              const then = askName;
              setAskName(null);
              then();
            }}
          >
            <p className="font-serif text-xl">What should we call you?</p>
            <p className="text-sm text-muted-foreground">Shown next to your chat and bids.</p>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} className={inputClass} autoFocus placeholder="Your name" />
            <button type="submit" className={primaryButton} disabled={!name.trim()}>
              Continue
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
