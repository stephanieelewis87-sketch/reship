import { type FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Check, Info, Loader2, PackagePlus, Search, ShoppingBag, Store } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { type ShopFilters, type ShopResult, type ShopSearch, type ShopSort, applyFilters, delivered, fromMarket, itemFromPurchase, searchLinks, sortResults } from "@/lib/shop";
import { MARKETPLACES } from "@/lib/marketplaces";
import { nextSku } from "@/lib/sku";
import { newId } from "@/lib/ids";
import { isOn } from "@/lib/features";
import { EmptyState, Field, Modal, ModalHeader, PlatformIcon, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { go } from "../shell/route";

type Data = ReturnType<typeof useReshipData>;

const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;
const TAG: Record<ShopResult["source"], string> = { sellsource: "Buy here", api: "Live", sample: "Sample" };
const SUGGESTIONS = ["Lululemon Align", "Patagonia fleece", "Levi's 501", "Coach bag", "Nike Dunk"];

// Shop: one search across marketplaces, for buying (to wear, or to resell).
export function ShopPage({ data, initialQuery }: { data: Data; initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [filters, setFilters] = useState<ShopFilters>({});
  const [sort, setSort] = useState<ShopSort>("best");
  const [result, setResult] = useState<ShopSearch | null>(null);
  const [market, setMarket] = useState<ShopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<ShopResult | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const sellsourceOn = isOn("sellsource");

  useEffect(() => {
    if (!query) return;
    let stale = false;
    setLoading(true);
    setError(null);
    setResult(null);
    // Your own SellSource items aren't shown to you as things to buy.
    const marketJob = sellsourceOn
      ? Promise.all([data.store.sellsource.browse({ q: query }), data.store.sellsource.me().catch(() => null)]).then(([ls, me]) => ls.filter((l) => l.sellerId !== me?.userId).map(fromMarket))
      : Promise.resolve([]);
    Promise.allSettled([data.store.shop.search(query, filters), marketJob]).then(([api, ss]) => {
      if (stale) return;
      if (api.status === "fulfilled") setResult(api.value);
      else setError((api.reason as Error).message);
      setMarket(ss.status === "fulfilled" ? ss.value : []);
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [query, filters, data.store, sellsourceOn]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
    go("shop", input.trim() ? { q: input.trim() } : undefined);
  };

  const all = sortResults(applyFilters([...market, ...(result?.results ?? [])], filters), sort);
  const links = query ? searchLinks(query) : [];

  return (
    <div>
      <PageHeader title="Shop" subtitle="Search for things to buy across marketplaces from one box." />
      <div className="px-4 md:px-8 py-5 flex flex-col gap-5 max-w-6xl">
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Brand, item, size… e.g. Lululemon Align 6"
              aria-label="Search marketplaces"
              className={`${inputClass} pl-9 py-2.5 text-[15px]`}
            />
          </div>
          <button type="submit" className={primaryButton}>
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
            Up to
            <input
              type="number"
              min={1}
              inputMode="decimal"
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) || undefined }))}
              placeholder="any price"
              className={`${inputClass} w-24 py-1`}
              aria-label="Highest price"
            />
          </label>
          <select value={filters.condition ?? ""} onChange={(e) => setFilters((f) => ({ ...f, condition: (e.target.value || undefined) as ShopFilters["condition"] }))} className={selectClass} aria-label="Condition">
            <option value="">New or used</option>
            <option value="new">New only</option>
            <option value="used">Used only</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as ShopSort)} className={selectClass} aria-label="Sort">
            <option value="best">Best match</option>
            <option value="low">Lowest price with shipping</option>
            <option value="high">Highest price</option>
          </select>
        </div>

        {!query && (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState icon={ShoppingBag} title="Find it anywhere, buy it in one tap" text="Hubby searches SellSource, eBay and Etsy right here, and opens the same search on every other marketplace." />
            <div className="flex flex-wrap justify-center gap-2 pb-8 px-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s);
                    setQuery(s);
                  }}
                  className="px-3 py-1.5 rounded-full border border-border text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {query && links.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Also search “{query}” on</h2>
                <p className="text-xs text-muted-foreground mt-0.5">These marketplaces don't let other apps search them, so each one opens in a new tab with your search filled in.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((l) => (
                <a key={l.platform} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full border border-border text-xs font-medium hover:bg-muted">
                  <PlatformIcon platform={l.platform} className="w-3.5 h-3.5" />
                  {MARKETPLACES[l.platform].name}
                  <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>
        )}

        {query && (
          <section>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground">
                {loading ? "Searching…" : `${all.length} result${all.length === 1 ? "" : "s"} in Hubby`}
              </h2>
              {result && <SourceNotes result={result} sellsource={sellsourceOn} />}
            </div>
            {error && <p className="text-sm text-rose-700 mb-3">{error}</p>}
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : all.length === 0 ? (
              <div className="rounded-xl border border-border bg-card">
                <EmptyState icon={Search} title="Nothing here for that search" text="Try fewer words, or use the marketplace buttons above." />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {all.map((r) => (
                  <ResultCard key={r.id} r={r} added={added.has(r.id)} onBought={() => setBought(r)} />
                ))}
              </div>
            )}
          </section>
        )}

        <p className="text-[12px] text-muted-foreground flex gap-1.5 max-w-3xl">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          SellSource items check out right here. Other marketplaces only let you pay on their own site, so Buy opens the listing there. Bought something to resell? Tap “I bought it” and it's
          added to your inventory with what you paid.
        </p>
      </div>
      {bought && (
        <BoughtModal
          r={bought}
          onClose={() => setBought(null)}
          onSave={(paid) => {
            const item = itemFromPurchase(bought, paid, nextSku(data.inventory, data.settings.skuFormat), newId());
            data.saveInventory([item], "Bought in Shop");
            setAdded((s) => new Set(s).add(bought.id));
            setBought(null);
          }}
        />
      )}
    </div>
  );
}

function SourceNotes({ result, sellsource }: { result: ShopSearch; sellsource: boolean }) {
  const off = result.sources.filter((s) => s.status !== "ok");
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {sellsource && <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent">SellSource</span>}
      {result.sources.map((s) => (
        <span key={s.platform} title={s.message} className={`px-2 py-0.5 rounded-full ${s.status === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
          {s.platform}
          {s.status === "off" ? ": not set up" : s.status === "error" ? ": didn't load" : ""}
        </span>
      ))}
      {off.length > 0 && <span className="sr-only">{off.map((o) => `${o.platform} ${o.message}`).join(". ")}</span>}
    </div>
  );
}

function ResultCard({ r, added, onBought }: { r: ShopResult; added: boolean; onBought: () => void }) {
  const here = r.source === "sellsource";
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <a href={r.url} target={here ? undefined : "_blank"} rel="noreferrer" className="block aspect-square bg-muted relative">
        {r.image ? (
          <img src={r.image} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <PlatformIcon platform={r.platform} className="w-8 h-8 opacity-60" />
          </span>
        )}
        <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${here ? "bg-accent text-accent-foreground" : "bg-card/90 text-foreground"}`}>{TAG[r.source]}</span>
      </a>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {here ? <Store className="w-3 h-3 text-accent" /> : <PlatformIcon platform={r.platform} className="w-3 h-3" />}
          {here ? (r.seller ?? "SellSource") : MARKETPLACES[r.platform].name}
          {r.condition && <span className="truncate">· {r.condition}</span>}
        </p>
        <p className="text-sm text-foreground leading-snug line-clamp-2">{r.title}</p>
        <p className="mt-auto pt-1">
          <span className="font-semibold text-foreground">{money(r.price)}</span>
          <span className="text-[11px] text-muted-foreground ml-1.5">
            {r.shipping === undefined ? "+ shipping" : r.shipping === 0 ? "free shipping" : `+ ${money(r.shipping)} ship`}
          </span>
        </p>
        <div className="flex gap-1.5 pt-1">
          <a
            href={r.url}
            target={here ? undefined : "_blank"}
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:bg-accent-hover"
          >
            {here ? "Buy" : `Buy on ${MARKETPLACES[r.platform].name}`}
            {!here && <ArrowUpRight className="w-3 h-3" />}
          </a>
          {!here && (
            <button
              type="button"
              onClick={onBought}
              disabled={added}
              title="Add it to your inventory with what you paid"
              className="px-2 py-1.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-60 inline-flex items-center gap-1"
            >
              {added ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <PackagePlus className="w-3.5 h-3.5" />}
              <span className="sr-only sm:not-sr-only">{added ? "Added" : "I bought it"}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function BoughtModal({ r, onClose, onSave }: { r: ShopResult; onClose: () => void; onSave: (paid: number) => void }) {
  const [paid, setPaid] = useState(String(delivered(r)));
  const n = Number(paid);
  return (
    <Modal onClose={onClose} label="Add to inventory">
      <ModalHeader title="Add to your inventory" subtitle="As a draft, with what you paid, so its profit counts when it sells." onClose={onClose} />
      <div className="p-5 flex flex-col gap-4">
        <p className="text-sm text-foreground">{r.title}</p>
        <Field label="What you paid, with shipping and tax">
          <input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} className={inputClass} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" disabled={!(n >= 0)} onClick={() => onSave(n)} className={primaryButton}>
            Add to inventory
          </button>
        </div>
      </div>
    </Modal>
  );
}
