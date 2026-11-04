import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bookmark, BookmarkCheck, Info, Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { Platform } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { COMP_COVERAGE, type Comp, type CompState, type LiveCompsResult, type SavedResearch, byPlatform, summarize, yourSales } from "@/lib/comps";
import { PLATFORM_INFO } from "@/lib/platforms";
import { EmptyState, PlatformIcon, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { go } from "../shell/route";

type Data = ReturnType<typeof useReshipData>;

const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n.toFixed(0)}`;
const keyOf = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
const SOURCE_TAG: Record<Comp["source"], string> = { yours: "Your sale", api: "Live", manual: "Added by you", sample: "Sample" };
const MANUAL_PLATFORMS: Platform[] = ["Poshmark", "Mercari", "eBay", "Depop", "Vinted", "Etsy", "WhatNot", "Facebook", "ThredUp", "OfferUp", "Curtsy", "Grailed", "Vestiaire", "Shopify", "Other"];

// Research: look up what an item sells for, and what it's listed at, across marketplaces.
export function ResearchPage({ data, initialQuery }: { data: Data; initialQuery: string }) {
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [live, setLive] = useState<LiveCompsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | CompState>("all");
  const [sort, setSort] = useState<"newest" | "low" | "high">("newest");
  const saved = data.settings.research ?? [];
  const entry = saved.find((s) => keyOf(s.query) === keyOf(query));

  useEffect(() => {
    if (!query) return;
    let stale = false;
    setLoading(true);
    setError(null);
    setLive(null);
    data.store.comps
      .search(query)
      .then((r) => !stale && setLive(r))
      .catch((e: Error) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [query, data.store]);

  const mine = useMemo(() => yourSales(query, data.orders), [query, data.orders]);
  const comps = useMemo(() => {
    // Saved comps (typed in, or kept from an earlier search) plus today's live results.
    const kept = entry?.comps ?? [];
    const ids = new Set(kept.map((c) => c.id));
    return [...mine, ...kept, ...(live?.comps ?? []).filter((c) => !ids.has(c.id))];
  }, [mine, live, entry]);
  const summary = useMemo(() => summarize(comps), [comps]);
  const table = useMemo(() => byPlatform(comps), [comps]);
  const shown = comps
    .filter((c) => show === "all" || c.state === show)
    .sort((a, b) => (sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : (b.date ?? "").localeCompare(a.date ?? "")));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setQuery(q);
    go("research", { q });
  };

  const saveEntries = (next: SavedResearch[]) => data.saveSettings({ ...data.settings, research: next });
  const upsertEntry = (fn: (e: SavedResearch) => SavedResearch) => {
    const base: SavedResearch = entry ?? { id: crypto.randomUUID(), query, comps: [], savedAt: new Date().toISOString() };
    const next = fn(base);
    saveEntries([next, ...saved.filter((s) => s.id !== base.id)]);
  };
  const isKept = (c: Comp) => !!entry?.comps.some((k) => k.id === c.id);
  const toggleKeep = (c: Comp) =>
    upsertEntry((e) => ({ ...e, comps: isKept(c) ? e.comps.filter((k) => k.id !== c.id) : [...e.comps, c], savedAt: new Date().toISOString() }));
  const addManual = (c: Comp) => upsertEntry((e) => ({ ...e, comps: [...e.comps, c], savedAt: new Date().toISOString() }));

  const etsyShown = comps.some((c) => c.platform === "Etsy" && c.source === "api");
  const notes = (live?.sources ?? []).filter((s) => s.status !== "ok" || s.message);

  return (
    <div>
      <PageHeader title="Research" subtitle="What an item sells for, and what it's listed at, across marketplaces" />
      <div className="px-4 md:px-8 py-4 space-y-5 max-w-6xl">
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Brand, item and size, like Nike Tech Fleece hoodie L"
              aria-label="Search comps"
              className={`${inputClass} pl-9 py-2`}
            />
          </div>
          <button type="submit" className={primaryButton} disabled={!input.trim()}>
            Search
          </button>
        </form>

        {!query && <SavedList saved={saved} onOpen={(q) => (setInput(q), setQuery(q), go("research", { q }))} onDelete={(id) => saveEntries(saved.filter((s) => s.id !== id))} />}

        {query && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Tile label="Sold" value={summary.sold ? money(summary.sold.median) : "No sales found"} sub={summary.sold ? `median of ${summary.sold.count}, ${money(summary.sold.low)} to ${money(summary.sold.high)}` : "Check the sold searches below"} />
              <Tile label="For sale now" value={summary.active ? money(summary.active.median) : "None found"} sub={summary.active ? `median asking of ${summary.active.count}` : undefined} />
              <Tile
                label="List at"
                accent
                value={summary.suggested ? `${money(summary.suggested.low)} to ${money(summary.suggested.high)}` : "Not enough comps"}
                sub={summary.suggested ? (summary.suggested.basis === "sold" ? "middle half of sold prices" : "middle half of asking prices (fewer than 3 sales found)") : "Save a few comps from the marketplaces below"}
              />
            </div>

            {loading && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up live listings…
              </p>
            )}
            {live?.comps.some((c) => c.source === "sample") && (
              <p className="text-xs text-muted-foreground flex gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Demo mode: the eBay and Etsy results are made-up samples. With your account, eBay and Etsy listings come in live, and eBay sold prices once eBay approves SellSync.</span>
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error} Your own sales and the marketplace searches below still work.</p>}
            {notes.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1">
                {notes.map((s) => (
                  <li key={`${s.platform}-${s.state}`} className="flex gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      {PLATFORM_INFO[s.platform].name} {s.state === "sold" ? "sold" : "for sale"}: {s.message ?? (s.status === "off" ? "not set up yet." : "didn't load.")}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {table.length > 0 && (
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <h2 className="px-4 py-3 text-sm font-medium border-b border-border">By marketplace</h2>
                <table className="w-full text-sm">
                  <thead className="text-[12px] text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Marketplace</th>
                      <th className="text-right font-medium px-4 py-2">Sold median</th>
                      <th className="text-right font-medium px-4 py-2">Asking median</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.platform} className="border-t border-border">
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <PlatformIcon platform={r.platform} className="w-3.5 h-3.5" /> {PLATFORM_INFO[r.platform].name}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.sold ? `${money(r.sold.median)} (${r.sold.count})` : "–"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.active ? `${money(r.active.median)} (${r.active.count})` : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-medium mr-auto">Comps for “{query}”</h2>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  {(["all", "sold", "active"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`px-2.5 py-1 ${show === k ? "bg-accent/15 text-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                      {k === "all" ? "All" : k === "sold" ? "Sold" : "For sale"}
                    </button>
                  ))}
                </div>
                <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectClass}>
                  <option value="newest">Newest</option>
                  <option value="low">Price, low to high</option>
                  <option value="high">Price, high to low</option>
                </select>
              </div>
              {shown.length === 0 ? (
                <EmptyState icon={Search} title={loading ? "Searching…" : "No comps here yet"} text="Open the marketplace searches below, then add any comp you find so it counts toward the price range." />
              ) : (
                <ul className="divide-y divide-border">
                  {shown.map((c) => (
                    <CompRow key={c.id} comp={c} kept={isKept(c)} onKeep={() => toggleKeep(c)} />
                  ))}
                </ul>
              )}
              <AddComp onAdd={addManual} />
            </section>

            <section>
              <h2 className="text-sm font-medium mb-1">Check every marketplace</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Marketplaces without an official API open in a new tab with your search already typed in. SellSync never reads those sites for you, so add the comps you find with “Add a comp”.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {COMP_COVERAGE.map((cov) => (
                  <div key={cov.platform} className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PlatformIcon platform={cov.platform} className="w-4 h-4" /> {PLATFORM_INFO[cov.platform].name}
                      <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-full ${cov.inApp.active === "yes" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {cov.inApp.active === "yes" ? "Live in SellSync" : "Opens the site"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground flex-1">{cov.why}</p>
                    <div className="flex gap-2">
                      {cov.soldUrl && (
                        <a href={cov.soldUrl(query)} target="_blank" rel="noreferrer" className={`${secondaryButton} !px-2.5 !py-1 text-xs`}>
                          Sold <ArrowUpRight className="w-3 h-3" />
                        </a>
                      )}
                      <a href={cov.activeUrl(query)} target="_blank" rel="noreferrer" className={`${secondaryButton} !px-2.5 !py-1 text-xs`}>
                        {cov.homeOnly ? `Open ${PLATFORM_INFO[cov.platform].name}` : "For sale"} <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {etsyShown && <p className="text-[11px] text-muted-foreground">The term “Etsy” is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-accent/40 bg-accent/5" : "border-border bg-card"}`}>
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className={`font-serif text-2xl mt-1 tabular-nums ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function CompRow({ comp: c, kept, onKeep }: { comp: Comp; kept: boolean; onKeep: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="px-4 py-2.5 flex items-center gap-3">
      {c.image && !broken ? (
        <img src={c.image} alt="" onError={() => setBroken(true)} className="w-10 h-10 rounded-md object-cover shrink-0 bg-muted" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-muted shrink-0 flex items-center justify-center">
          <PlatformIcon platform={c.platform} className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
              {c.title}
            </a>
          ) : (
            c.title
          )}
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <PlatformIcon platform={c.platform} /> {PLATFORM_INFO[c.platform].name}
          <span className={c.state === "sold" ? "text-emerald-700" : ""}>· {c.state === "sold" ? "Sold" : "For sale"}</span>
          {c.date && <span>· {c.date}</span>}
          {c.condition && <span>· {c.condition}</span>}
          <span className="px-1.5 rounded-full bg-muted text-[11px]">{SOURCE_TAG[c.source]}</span>
        </p>
      </div>
      <span className="font-mono tabular-nums text-sm">{money(c.price)}</span>
      {c.source !== "yours" && (
        <button type="button" onClick={onKeep} aria-label={kept ? "Remove from saved" : "Save this comp"} title={kept ? "Saved" : "Save"} className={kept ? "text-accent" : "text-muted-foreground hover:text-foreground"}>
          {c.source === "manual" ? <Trash2 className="w-4 h-4" /> : kept ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
        </button>
      )}
    </li>
  );
}

// A comp the seller found on a marketplace's own site, typed in by hand.
function AddComp({ onAdd }: { onAdd: (c: Comp) => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("Poshmark");
  const [state, setState] = useState<CompState>("sold");
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const amount = Number(price);
  if (!open)
    return (
      <div className="px-4 py-3 border-t border-border">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent font-medium flex items-center gap-1 hover:underline">
          <Plus className="w-3.5 h-3.5" /> Add a comp
        </button>
      </div>
    );
  return (
    <form
      className="px-4 py-3 border-t border-border grid grid-cols-2 sm:grid-cols-6 gap-2 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!(amount > 0)) return;
        const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
        onAdd({ id: `manual-${crypto.randomUUID()}`, platform, state, price: Math.round(amount * 100) / 100, title: title.trim() || `${PLATFORM_INFO[platform].name} comp`, url: link, date: new Date().toISOString().slice(0, 10), source: "manual" });
        setPrice("");
        setTitle("");
        setUrl("");
      }}
    >
      <select aria-label="Marketplace" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={selectClass}>
        {MANUAL_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PLATFORM_INFO[p].name}
          </option>
        ))}
      </select>
      <select aria-label="Sold or for sale" value={state} onChange={(e) => setState(e.target.value as CompState)} className={selectClass}>
        <option value="sold">Sold</option>
        <option value="active">For sale</option>
      </select>
      <input aria-label="Price" inputMode="decimal" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className={inputClass} />
      <input aria-label="Title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} col-span-2 sm:col-span-1`} />
      <input aria-label="Link" placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} className={`${inputClass} col-span-2 sm:col-span-1`} />
      <div className="flex gap-2 col-span-2 sm:col-span-1">
        <button type="submit" disabled={!(amount > 0)} className={`${primaryButton} !px-3 !py-1.5 text-xs flex-1`}>
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${secondaryButton} !px-3 !py-1.5 text-xs`}>
          Done
        </button>
      </div>
    </form>
  );
}

function SavedList({ saved, onOpen, onDelete }: { saved: SavedResearch[]; onOpen: (q: string) => void; onDelete: (id: string) => void }) {
  if (!saved.length)
    return <EmptyState icon={Search} title="Look up any item" text="See your own sales of it, live eBay and Etsy listings, and one-tap searches on Poshmark, Mercari, Depop, Vinted and more. Save the comps you want to keep." />;
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="px-4 py-3 text-sm font-medium border-b border-border">Saved research</h2>
      <ul className="divide-y divide-border">
        {saved.map((s) => {
          const sum = summarize(s.comps);
          return (
            <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
              <button type="button" onClick={() => onOpen(s.query)} className="flex-1 min-w-0 text-left">
                <p className="text-sm text-foreground truncate hover:underline">{s.query}</p>
                <p className="text-xs text-muted-foreground">
                  {s.comps.length} saved comp{s.comps.length === 1 ? "" : "s"}
                  {sum.sold && ` · sold median ${money(sum.sold.median)}`}
                  {sum.active && ` · asking median ${money(sum.active.median)}`}
                </p>
              </button>
              <button type="button" aria-label={`Delete ${s.query}`} onClick={() => onDelete(s.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
