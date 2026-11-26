import { useEffect, useState } from "react";
import { Loader2, Plus, Radio, Store, Trash2 } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import type { MarketListing, SellerProfile, Show } from "@/lib/sellsource";
import { newId } from "@/lib/ids";
import { EmptyState, Field, Modal, ModalHeader, inputClass, primaryButton, secondaryButton } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { type Route, go } from "../shell/route";
import { LiveStudio, StatusPill, openStudio } from "./LiveStudio";

type Data = ReturnType<typeof useReshipData>;

// Live shows for sellers: schedule a show with items from your SellSource storefront, then run it.
export function LivePage({ data, route }: { data: Data; route: Route }) {
  const api = data.store.sellsource;
  const studio = route.params.get("show");
  const [profile, setProfile] = useState<SellerProfile | null | undefined>(undefined);
  const [shows, setShows] = useState<Show[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studio) return;
    Promise.all([api.me(), api.myShows(), api.myListings()])
      .then(([p, s, l]) => {
        setProfile(p);
        setShows(s);
        setListings(l);
      })
      .catch((e: Error) => {
        setError(e.message);
        setProfile(null);
      });
  }, [api, studio]);

  if (studio) return <LiveStudio api={api} showId={studio} onBack={() => go("live")} />;
  if (profile === undefined) return <p className="text-sm text-muted-foreground text-center py-20">Loading…</p>;

  const active = listings.filter((l) => l.status === "active");
  const upcoming = shows.filter((s) => s.status !== "ended").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = shows.filter((s) => s.status === "ended");

  return (
    <div>
      <PageHeader title="Live shows" subtitle="Sell on video: show each item, take bids, and buyers pay in a tap.">
        {profile && (
          <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
            <Plus className="w-4 h-4" /> Schedule a show
          </button>
        )}
      </PageHeader>
      <div className="px-4 md:px-8 py-5 flex flex-col gap-5 max-w-4xl">
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!profile ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState icon={Store} title="Open your SellSource storefront first" text="Live shows sell items from your storefront, and buyers pay through it." action={{ label: "Set up SellSource", onClick: () => go("sellsource") }} />
          </div>
        ) : (
          <>
            {upcoming.length === 0 && past.length === 0 ? (
              <div className="rounded-xl border border-border bg-card">
                <EmptyState
                  icon={Radio}
                  title="No shows yet"
                  text={active.length ? "Pick a few items, choose a time, and share the link with your followers." : "Put some items on SellSource first, then schedule a show with them."}
                  action={active.length ? { label: "Schedule a show", onClick: () => setCreating(true) } : { label: "Add items to SellSource", onClick: () => go("sellsource") }}
                />
              </div>
            ) : (
              <ShowList title="Coming up" shows={upcoming} onDelete={async (id) => (await api.deleteShow(id), setShows((s) => s.filter((x) => x.id !== id)))} />
            )}
            {past.length > 0 && <ShowList title="Past shows" shows={past} />}
            <section className="rounded-xl border border-border bg-card p-4 text-sm">
              <h2 className="font-semibold">How a show works</h2>
              <ol className="mt-2 list-decimal pl-5 flex flex-col gap-1 text-muted-foreground">
                <li>Open the show on your phone and tap Go live. Share the link; buyers don't need an account to watch.</li>
                <li>Pin an item to show it, with a Buy now price, or start a 15, 30 or 60 second auction. A bid in the last 10 seconds puts 10 seconds back on the clock.</li>
                <li>Winners pay right on their screen. Every win in the same show goes in one package, so buyers pay shipping once.</li>
                <li>Sales land in Orders with the buyer's address, ready to ship.</li>
              </ol>
            </section>
          </>
        )}
      </div>
      {creating && profile && (
        <ScheduleModal
          profile={profile}
          listings={active}
          onClose={() => setCreating(false)}
          onSave={async (show) => {
            await api.saveShow(show);
            setCreating(false);
            openStudio(show.id);
          }}
        />
      )}
    </div>
  );
}

function ShowList({ title, shows, onDelete }: { title: string; shows: Show[]; onDelete?: (id: string) => Promise<void> }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="px-4 py-3 border-b border-border text-sm font-semibold">{title}</h2>
      <ul className="divide-y divide-border">
        {shows.map((s) => (
          <li key={s.id} className="px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <StatusPill status={s.status} />
                {new Date(s.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {s.listingIds.length} items
              </p>
            </div>
            {onDelete && s.status === "scheduled" && (
              <button type="button" onClick={() => void onDelete(s.id)} aria-label="Delete show" className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={() => openStudio(s.id)} className={`${s.status === "ended" ? secondaryButton : primaryButton} py-1.5 text-xs`}>
              {s.status === "live" ? "Back to show" : s.status === "ended" ? "Open" : "Open studio"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function ScheduleModal({ profile, listings, onClose, onSave }: { profile: SellerProfile; listings: MarketListing[]; onClose: () => void; onSave: (s: Show) => Promise<void> }) {
  const [title, setTitle] = useState(`${profile.shopName} live`);
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3600000)));
  const [picked, setPicked] = useState<string[]>(listings.slice(0, 10).map((l) => l.id));
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal onClose={onClose} label="Schedule a show" maxWidth="max-w-lg">
      <ModalHeader title="Schedule a show" subtitle="Buyers can see it coming on your storefront." onClose={onClose} />
      <div className="p-5 flex flex-col gap-4 overflow-y-auto">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={80} />
        </Field>
        <Field label="Starts">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </Field>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Items, in running order ({picked.length})</p>
          {listings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Put items on SellSource first.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {listings.map((l) => (
                <li key={l.id}>
                  <label className="px-3 py-2 flex items-center gap-2.5 cursor-pointer hover:bg-muted">
                    <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} />
                    <div className="w-8 h-8 rounded bg-muted overflow-hidden shrink-0">{l.photos[0] && <img src={l.photos[0]} alt="" className="w-full h-full object-cover" />}</div>
                    <span className="text-sm truncate flex-1">{l.title}</span>
                    <span className="text-xs text-muted-foreground">${l.price}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !title.trim() || !picked.length}
            onClick={async () => {
              setSaving(true);
              const order = listings.filter((l) => picked.includes(l.id)).map((l) => l.id);
              await onSave({
                id: newId(),
                sellerId: profile.userId,
                handle: profile.handle,
                shopName: profile.shopName,
                title: title.trim(),
                startsAt: new Date(when).toISOString(),
                status: "scheduled",
                listingIds: order,
              }).finally(() => setSaving(false));
            }}
            className={primaryButton}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Schedule and open studio
          </button>
        </div>
      </div>
    </Modal>
  );
}
