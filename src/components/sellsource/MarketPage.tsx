import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Radio, Search, ShoppingBag, Store, Trash2, Truck, X } from "lucide-react";
import type { CheckoutResult, SellSourceApi } from "@/lib/sellsourceStore";
import { type MarketListing, type SellerProfile, type Show, packageShipping } from "@/lib/sellsource";
import { BrandMark } from "../brand/Logo";
import { EmptyState, inputClass, primaryButton, secondaryButton } from "../ui";

const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;

// The cart holds one shop's items at a time, so everything in it ships as one package.
const CART_KEY = "sellsync.cart.v1";
const readCart = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const writeCart = (ids: string[]) => {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(ids));
  } catch {
    // the cart lasts for this page only
  }
};

function setUrl(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
  window.history.pushState(null, "", `/?${p.toString().replace(/=(&|$)/g, "$1")}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useParams() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const on = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return params;
}

// SellSource for buyers: browse every seller, a seller's storefront, one item, the cart and checkout.
// Open to anyone, no SellSync account needed. Addresses: /?market, /?market&item=id, /?shop=handle.
export function MarketPage({ api, demo }: { api: SellSourceApi; demo: boolean }) {
  const params = useParams();
  const itemId = params.get("item");
  const handle = params.get("shop") ?? undefined;
  const q = params.get("q") ?? "";
  const paid = params.has("paid");
  const [cart, setCart] = useState<string[]>(readCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [done, setDone] = useState<CheckoutResult | null>(null);

  const updateCart = (ids: string[]) => {
    setCart(ids);
    writeCart(ids);
  };

  useEffect(() => {
    if (paid) updateCart([]);
  }, [paid]);

  return (
    <div className="min-h-screen bg-background">
      <MarketHeader q={q} handle={handle} cartCount={cart.length} onCart={() => setCartOpen(true)} />
      {demo && <p className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 text-center">Demo: sample shops, and checkout is a practice run. No card is charged.</p>}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {paid || done ? (
          <ThankYou demo={!!done && "demoOrderId" in done} />
        ) : itemId ? (
          <ItemView
            api={api}
            id={itemId}
            inCart={cart.includes(itemId)}
            onAdd={(l) => {
              updateCart([...cart.filter((x) => x !== l.id), l.id]);
              setCartOpen(true);
            }}
            onBought={setDone}
          />
        ) : (
          <Browse api={api} q={q} handle={handle} />
        )}
      </main>
      {cartOpen && <Cart api={api} ids={cart} onChange={updateCart} onClose={() => setCartOpen(false)} onDone={(r) => (setDone(r), setCartOpen(false), updateCart([]))} />}
    </div>
  );
}

function MarketHeader({ q, handle, cartCount, onCart }: { q: string; handle?: string; cartCount: number; onCart: () => void }) {
  const [input, setInput] = useState(q);
  useEffect(() => {
    setInput(q);
  }, [q]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setUrl({ market: "", q: input.trim() || undefined, shop: handle });
  };
  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <button type="button" onClick={() => setUrl({ market: "" })} className="flex items-center gap-2 shrink-0">
          <BrandMark className="w-8 h-8" />
          <span className="font-display uppercase tracking-[0.12em] text-metal text-[15px] hidden sm:inline">
            <span className="font-extrabold">Sell</span>
            <span className="font-light">Source</span>
          </span>
        </button>
        <form onSubmit={submit} className="flex-1 relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={handle ? "Search this shop" : "Search SellSource"} aria-label="Search" className={`${inputClass} pl-9 py-2 rounded-full`} />
        </form>
        <button type="button" onClick={onCart} className="relative p-2 rounded-full hover:bg-muted" aria-label={`Cart, ${cartCount} items`}>
          <ShoppingBag className="w-5 h-5" />
          {cartCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold flex items-center justify-center">{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

function Browse({ api, q, handle }: { api: SellSourceApi; q: string; handle?: string }) {
  const [items, setItems] = useState<MarketListing[] | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setItems(null);
    api
      .browse({ q, handle })
      .then((r) => !stale && setItems(r))
      .catch((e: Error) => !stale && setError(e.message));
    if (handle) api.seller(handle).then((s) => !stale && setSeller(s), () => undefined);
    else setSeller(null);
    api.upcomingShows().then((s) => !stale && setShows(handle ? s.filter((x) => x.handle === handle) : s), () => undefined);
    return () => {
      stale = true;
    };
  }, [api, q, handle]);

  return (
    <div className="flex flex-col gap-6">
      {handle ? (
        <section className="flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-accent/15 text-accent flex items-center justify-center font-serif text-2xl">{(seller?.shopName ?? handle).charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl sm:text-3xl text-foreground">{seller?.shopName ?? handle}</h1>
            {seller?.bio && <p className="text-sm text-muted-foreground mt-0.5">{seller.bio}</p>}
            {seller && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> {money(seller.shippingPrice)} shipping, {seller.extraItemShipping ? `${money(seller.extraItemShipping)} each extra item` : "extra items ship free"}
              </p>
            )}
          </div>
        </section>
      ) : (
        !q && (
          <section className="rounded-2xl p-6 sm:p-8 bg-accent-soft border border-accent/20">
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground">Secondhand, straight from the seller.</h1>
            <p className="text-muted-foreground mt-2 max-w-lg">Every item on SellSource comes from a reseller's own closet. Buy from one shop and it ships in one package.</p>
          </section>
        )
      )}

      {shows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-accent" /> Live shows
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {shows.map((s) => (
              <a key={s.id} href={`/?live=${encodeURIComponent(s.id)}`} className="shrink-0 w-60 rounded-xl border border-border bg-card p-3 hover:border-accent/50">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.status === "live" ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"}`}>
                  {s.status === "live" ? "LIVE" : new Date(s.startsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </span>
                <p className="text-sm font-medium text-foreground mt-1.5 truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground truncate">{s.shopName}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        {q && <h2 className="text-sm text-muted-foreground mb-3">Results for “{q}”</h2>}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!items ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Store} title={q ? "Nothing matches that yet" : "Nothing for sale here yet"} text="Check back soon. New items go up every day." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((l) => (
              <button key={l.id} type="button" onClick={() => setUrl({ market: "", item: l.id })} className="text-left group">
                <div className="aspect-square rounded-xl overflow-hidden bg-muted">
                  {l.photos[0] && <img src={l.photos[0]} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />}
                </div>
                <p className="mt-2 text-sm text-foreground line-clamp-1">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[l.brand, l.size].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{money(l.price)}</p>
                {!handle && <p className="text-[11px] text-muted-foreground">{l.shopName}</p>}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemView({ api, id, inCart, onAdd, onBought }: { api: SellSourceApi; id: string; inCart: boolean; onAdd: (l: MarketListing) => void; onBought: (r: CheckoutResult) => void }) {
  const [item, setItem] = useState<MarketListing | null | undefined>(undefined);
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getListings([id]).then((r) => setItem(r[0] ?? null), () => setItem(null));
  }, [api, id]);

  if (item === undefined) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mt-16" />;
  if (!item) return <EmptyState icon={Store} title="This item isn't here anymore" />;
  const gone = item.status !== "active";

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.checkout({ listingIds: [item.id] });
      if ("url" in r) window.location.assign(r.url);
      else onBought(r);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => window.history.back()} className="text-sm text-muted-foreground flex items-center gap-1 self-start">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        <div>
          <div className="aspect-square rounded-2xl overflow-hidden bg-muted">{item.photos[photo] && <img src={item.photos[photo]} alt={item.title} className="w-full h-full object-cover" />}</div>
          {item.photos.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {item.photos.map((p, i) => (
                <button key={p + i} type="button" onClick={() => setPhoto(i)} className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 ${i === photo ? "border-accent" : "border-transparent"}`}>
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setUrl({ shop: item.handle })} className="text-sm text-accent self-start flex items-center gap-1.5">
            <Store className="w-4 h-4" /> {item.shopName}
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl text-foreground leading-tight">{item.title}</h1>
          <p className="text-2xl font-semibold text-foreground">
            {money(item.price)} <span className="text-sm font-normal text-muted-foreground">+ {money(item.shippingPrice)} shipping</span>
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {(
              [
                ["Brand", item.brand],
                ["Size", item.size],
                ["Condition", item.condition],
                ["Color", item.color],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
          </dl>
          {item.description && <p className="text-sm text-foreground whitespace-pre-line">{item.description}</p>}
          {error && <p className="text-sm text-rose-700">{error}</p>}
          {gone ? (
            <p className="text-sm font-medium text-muted-foreground">Sold</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button type="button" onClick={buy} disabled={busy} className={`${primaryButton} py-3 flex-1 rounded-full`}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Buy now
              </button>
              <button type="button" onClick={() => onAdd(item)} disabled={inCart} className={`${secondaryButton} py-3 flex-1 rounded-full`}>
                {inCart ? (
                  <>
                    <Check className="w-4 h-4" /> In your bag
                  </>
                ) : (
                  "Add to bag"
                )}
              </button>
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">Pay securely with Stripe. Add more from {item.shopName} and it all ships together for one shipping price.</p>
        </div>
      </div>
    </div>
  );
}

function Cart({ api, ids, onChange, onClose, onDone }: { api: SellSourceApi; ids: string[]; onChange: (ids: string[]) => void; onClose: () => void; onDone: (r: CheckoutResult) => void }) {
  const [items, setItems] = useState<MarketListing[]>([]);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getListings(ids).then((r) => setItems(r.filter((l) => l.status === "active")), () => setItems([]));
  }, [api, ids]);

  // Group by shop: each shop is its own package and its own checkout.
  const shops = useMemo(() => [...new Set(items.map((l) => l.handle))], [items]);
  const shop = shops[0];
  const mine = items.filter((l) => l.handle === shop);
  useEffect(() => {
    if (shop) api.seller(shop).then(setSeller, () => setSeller(null));
  }, [api, shop]);
  const shipping = mine.length ? packageShipping(seller ?? { shippingPrice: mine[0].shippingPrice, extraItemShipping: 0 }, mine.length) : 0;
  const subtotal = mine.reduce((a, l) => a + l.price, 0);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.checkout({ listingIds: mine.map((l) => l.id) });
      if ("url" in r) window.location.assign(r.url);
      else onDone(r);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative w-full max-w-sm h-full bg-card border-l border-border flex flex-col" role="dialog" aria-label="Your bag">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl">Your bag</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        {!items.length ? (
          <EmptyState icon={ShoppingBag} title="Your bag is empty" />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {shops.length > 1 && <p className="px-5 py-2 text-[12px] text-muted-foreground bg-muted">Each shop ships separately. Check out {mine[0]?.shopName} first.</p>}
              {items.map((l) => (
                <div key={l.id} className={`px-5 py-3 flex gap-3 ${l.handle !== shop ? "opacity-50" : ""}`}>
                  <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0">{l.photos[0] && <img src={l.photos[0]} alt="" className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.shopName}</p>
                    <p className="text-sm font-semibold">{money(l.price)}</p>
                  </div>
                  <button type="button" onClick={() => onChange(ids.filter((x) => x !== l.id))} aria-label="Remove" className="p-1 self-start text-muted-foreground hover:text-foreground">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-5 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items ({mine.length})</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping, one package</span>
                <span>{money(shipping)}</span>
              </div>
              {mine.length > 1 && <p className="text-[11px] text-emerald-800">You save {money(mine.length * mine[0].shippingPrice - shipping)} on shipping by buying together.</p>}
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>Total</span>
                <span>{money(subtotal + shipping)}</span>
              </div>
              {error && <p className="text-sm text-rose-700">{error}</p>}
              <button type="button" onClick={checkout} disabled={busy || !mine.length} className={`${primaryButton} py-3 rounded-full mt-1`}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Check out
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function ThankYou({ demo }: { demo: boolean }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <span className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
        <Check className="w-7 h-7" />
      </span>
      <h1 className="font-serif text-3xl mt-4">Thank you!</h1>
      <p className="text-muted-foreground mt-2">
        {demo ? "Practice order placed. Open the SellSync demo and you'll find it under Orders, ready to ship." : "Your order is in. The seller ships it in one package, and Stripe emailed you a receipt."}
      </p>
      <div className="flex justify-center gap-2 mt-6">
        <button type="button" onClick={() => setUrl({ market: "" })} className={secondaryButton}>
          Keep shopping
        </button>
        {demo && (
          <a href="/?demo#/orders" className={primaryButton}>
            See it in Orders
          </a>
        )}
      </div>
    </div>
  );
}
