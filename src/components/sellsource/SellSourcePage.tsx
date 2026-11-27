import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy, CreditCard, Loader2, Package, Pencil, Radio, Store, Truck } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import type { InventoryItem, Listing } from "@/lib/types";
import {
  type MarketListing,
  SELLSOURCE_FEE_PCT,
  type SellerProfile,
  cleanHandle,
  handleProblem,
  packageShipping,
  publishProblem,
  sellSourceFees,
  storefrontUrl,
} from "@/lib/sellsource";
import { isOn } from "@/lib/features";
import { EmptyState, Field, Toggle, inputClass, primaryButton, secondaryButton } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import type { Route } from "../shell/route";

type Data = ReturnType<typeof useReshipData>;
const money = (n: number) => `$${n.toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

// Puts the SellSource listing on (or off) the inventory record, so Inventory shows where it's listed.
export function withSellSource(item: InventoryItem, listing: MarketListing | null): InventoryItem {
  const others = item.listings.filter((l) => l.platform !== "SellSource");
  if (!listing) {
    const old = item.listings.find((l) => l.platform === "SellSource");
    return { ...item, listings: old && old.status !== "sold" ? [...others, { ...old, status: "delisted" }] : item.listings };
  }
  const entry: Listing = { platform: "SellSource", status: "active", listedAt: today(), price: listing.price, listingId: listing.id };
  return { ...item, status: item.status === "draft" ? "listed" : item.status, listedAt: item.listedAt ?? today(), listings: [...others, entry] };
}

// SellSource for sellers: the storefront, payouts, and which items are for sale on it.
export function SellSourcePage({ data, route }: { data: Data; route: Route }) {
  const api = data.store.sellsource;
  const [profile, setProfile] = useState<SellerProfile | null | undefined>(undefined);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const back = route.params.get("payouts") === "back";
      const [me, mine] = await Promise.all([back ? api.refreshPayouts() : api.me(), api.me().then((p) => (p ? api.myListings() : []))]);
      setProfile(me);
      setListings(mine);
    } catch (e) {
      setError((e as Error).message);
      setProfile(null);
    }
  }, [api, route.params]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeIds = useMemo(() => new Set(listings.filter((l) => l.status === "active").map((l) => l.inventoryId)), [listings]);
  const sellable = data.inventory.filter((i) => i.status !== "sold");
  const ready = sellable.filter((i) => !publishProblem(i) && !activeIds.has(i.id));

  const publish = async (items: InventoryItem[]) => {
    setBusy("publish");
    setError(null);
    try {
      const made = await api.publish(items);
      data.saveInventory(
        items.map((i) => withSellSource(i, made.find((m) => m.inventoryId === i.id) ?? null)),
        "SellSource",
        { confirmed: true },
      );
      setListings(await api.myListings());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async (item: InventoryItem) => {
    setBusy(item.id);
    try {
      await api.unpublish([item.id]);
      data.saveInventory([withSellSource(item, null)], "SellSource");
      setListings(await api.myListings());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const payouts = async () => {
    setBusy("payouts");
    try {
      const url = await api.startPayouts();
      if (url) window.location.assign(url);
      else setProfile(await api.me());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (profile === undefined) return <p className="text-sm text-muted-foreground text-center py-20">Loading…</p>;

  return (
    <div>
      <PageHeader title="SellSource" subtitle="Your own storefront in SellSync, Hubby's marketplace. Buyers check out here, and you keep all but 3%.">
        {profile && (
          <a href={storefrontUrl(profile.handle)} target="_blank" rel="noreferrer" className={secondaryButton}>
            <Store className="w-4 h-4" /> View storefront
          </a>
        )}
      </PageHeader>
      <div className="px-4 md:px-8 py-5 flex flex-col gap-5 max-w-5xl">
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!profile || editing ? (
          <ProfileForm
            profile={profile}
            defaultName={data.settings.displayName}
            onCancel={profile ? () => setEditing(false) : undefined}
            onSave={async (p) => {
              const saved = await api.saveProfile(p);
              setProfile(saved);
              setEditing(false);
              setListings(await api.myListings());
            }}
          />
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-3">
              <StorefrontCard profile={profile} onEdit={() => setEditing(true)} />
              <PayoutCard profile={profile} busy={busy === "payouts"} onStart={payouts} demo={!profile.userId || profile.userId.startsWith("demo")} />
              <ShippingCard profile={profile} />
            </div>

            <section className="rounded-xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Items on SellSource</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeIds.size} for sale. When an item sells anywhere else, Hubby takes it off SellSource for you.
                  </p>
                </div>
                <button type="button" disabled={!ready.length || busy === "publish"} onClick={() => publish(ready)} className={primaryButton}>
                  {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                  Add {ready.length || ""} ready item{ready.length === 1 ? "" : "s"}
                </button>
              </div>
              {sellable.length === 0 ? (
                <EmptyState icon={Package} title="No items yet" text="Add items in Inventory with a price and a photo, then put them on SellSource here." />
              ) : (
                <ul className="divide-y divide-border">
                  {sellable.slice(0, 200).map((item) => {
                    const on = activeIds.has(item.id);
                    const problem = publishProblem(item);
                    return (
                      <li key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-muted overflow-hidden shrink-0">{item.photo && <img src={item.photo} alt="" className="w-full h-full object-cover" />}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.sku}
                            {item.listPrice ? ` · ${money(item.listPrice)}` : ""}
                            {problem && !on ? ` · ${problem}` : ""}
                          </p>
                        </div>
                        {busy === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Toggle
                            checked={on}
                            label={`Sell ${item.title} on SellSource`}
                            onChange={() => (on ? unpublish(item) : !problem && publish([item]))}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {isOn("liveShows") && (
              <a href="#/live" className="rounded-xl border border-accent/40 bg-accent/5 p-4 flex items-center gap-3 hover:bg-accent/10">
                <Radio className="w-5 h-5 text-accent" />
                <span className="text-sm text-foreground flex-1">
                  <strong className="font-semibold">Sell them live.</strong> Pick items from your storefront, go live from your phone, and run quick auctions.
                </span>
                <ArrowUpRight className="w-4 h-4 text-accent" />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProfileForm({
  profile,
  defaultName,
  onSave,
  onCancel,
}: {
  profile: SellerProfile | null;
  defaultName: string;
  onSave: (p: Omit<SellerProfile, "userId" | "payouts">) => Promise<void>;
  onCancel?: () => void;
}) {
  const [shopName, setShopName] = useState(profile?.shopName ?? defaultName ?? "");
  const [handle, setHandle] = useState(profile?.handle ?? cleanHandle(defaultName ?? ""));
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [ship, setShip] = useState(String(profile?.shippingPrice ?? 7.99));
  const [extra, setExtra] = useState(String(profile?.extraItemShipping ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = handleProblem(handle);

  return (
    <section className="rounded-xl border border-border bg-card p-5 max-w-xl">
      <h2 className="font-serif text-xl text-foreground">{profile ? "Edit your storefront" : "Open your SellSource storefront"}</h2>
      <p className="text-sm text-muted-foreground mt-1">Buyers find you at your storefront address, in SellSource search, and in your live shows.</p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (problem || !shopName.trim()) return;
          setSaving(true);
          setError(null);
          try {
            await onSave({ shopName: shopName.trim(), handle, bio: bio.trim() || undefined, shippingPrice: Math.max(0, Number(ship) || 0), extraItemShipping: Math.max(0, Number(extra) || 0) });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Shop name">
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputClass} placeholder="e.g. Thrift & Thread" required />
        </Field>
        <Field label="Storefront address">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground shrink-0">{window.location.host}/?shop=</span>
            <input value={handle} onChange={(e) => setHandle(cleanHandle(e.target.value))} className={inputClass} placeholder="your-shop" />
          </div>
          {handle && problem && <p className="text-[11px] text-rose-700 mt-1">{problem}</p>}
        </Field>
        <Field label="About your shop (optional)">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className={inputClass} maxLength={280} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shipping, first item">
            <input type="number" min={0} step="0.01" value={ship} onChange={(e) => setShip(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Each extra item in the package">
            <input type="number" min={0} step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Buyers who get more than one item from you (in a cart, or across a live show) get one package and pay shipping once, plus the extra-item price.
        </p>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2 justify-end">
          {onCancel && (
            <button type="button" onClick={onCancel} className={secondaryButton}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={saving || !!problem || !shopName.trim()} className={primaryButton}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {profile ? "Save" : "Open my storefront"}
          </button>
        </div>
      </form>
    </section>
  );
}

function StorefrontCard({ profile, onEdit }: { profile: SellerProfile; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = storefrontUrl(profile.handle);
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Store className="w-3.5 h-3.5" /> Storefront
        </p>
        <button type="button" onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>
      <p className="font-serif text-lg text-foreground leading-tight">{profile.shopName}</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs text-accent truncate text-left flex items-center gap-1"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {url.replace(/^https?:\/\//, "")}
      </button>
    </div>
  );
}

function PayoutCard({ profile, busy, onStart, demo }: { profile: SellerProfile; busy: boolean; onStart: () => void; demo: boolean }) {
  const ex = sellSourceFees(40, profile.shippingPrice);
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <CreditCard className="w-3.5 h-3.5" /> Payouts
      </p>
      {profile.payouts === "ready" ? (
        <p className="text-sm text-emerald-800 flex items-center gap-1.5">
          <Check className="w-4 h-4" /> {demo ? "Practice payouts on (demo)" : "Ready. Sales go to your bank through Stripe."}
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground">{profile.payouts === "pending" ? "Stripe is checking your details." : "Buyers can't check out until payouts are set up."}</p>
          <button type="button" onClick={onStart} disabled={busy} className={`${primaryButton} py-1.5 text-xs`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {profile.payouts === "pending" ? "Continue with Stripe" : "Set up payouts"}
          </button>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        A $40 sale with {money(profile.shippingPrice)} shipping: {SELLSOURCE_FEE_PCT}% SellSource ({money(ex.sellsource)}) plus card processing ({money(ex.processing)}). You get {money(ex.payout)}.
      </p>
    </div>
  );
}

function ShippingCard({ profile }: { profile: SellerProfile }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5" /> Combined shipping
      </p>
      <p className="text-sm text-foreground">
        {money(profile.shippingPrice)} for the first item, {profile.extraItemShipping ? money(profile.extraItemShipping) : "free"} for each extra one.
      </p>
      <p className="text-[11px] text-muted-foreground">
        Three items in one package cost the buyer {money(packageShipping(profile, 3))}, not {money(profile.shippingPrice * 3)}. Live show wins go in the same package all show long.
      </p>
    </div>
  );
}
