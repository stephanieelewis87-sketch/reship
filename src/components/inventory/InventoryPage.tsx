import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { Condition, InventoryItem, Listing, Platform } from "@/lib/types";
import { ALL_PLATFORMS, CONDITIONS } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { isoDay } from "@/lib/analytics";
import { duplicateSkus, isPartiallyDelisted, listedOn, nextSku, priceFor, relistState } from "@/lib/inventory";
import { newId } from "@/lib/ids";
import { Pills } from "../analytics/parts";
import { PageHeader } from "../shell/PageHeader";
import type { Route } from "../shell/route";
import { PlatformIcon, inputClass, selectClass } from "../ui";
import { LabelDots } from "./LabelChips";
import { ListingForm } from "./ListingForm";
import { QuickEdit } from "./QuickEdit";

type Data = ReturnType<typeof useReshipData>;
type StatusFilter = "all" | "draft" | "listed" | "sold";
type Issue = "" | "partial" | "stale" | "duplicate" | "nocost";
type Sort = "newest" | "oldest" | "name" | "price" | "sold";
const PAGE_SIZE = 25;

const ISSUES: { key: Issue; label: string }[] = [
  { key: "", label: "Any" },
  { key: "partial", label: "Partially delisted" },
  { key: "stale", label: "Not relisted in 60+ days" },
  { key: "duplicate", label: "Duplicate SKU" },
  { key: "nocost", label: "Missing cost" },
];

// A small menu that closes when you click elsewhere.
function Menu({ button, children, align = "left" }: { button: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {button(() => setOpen((o) => !o))}
      {open && (
        <div className={`absolute z-30 mt-1 min-w-44 rounded-lg border border-border bg-card shadow-lg py-1 text-sm ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const MenuItem = ({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted ${danger ? "text-destructive" : "text-foreground"}`}>
    {children}
  </button>
);

export function InventoryPage({ data, route }: { data: Data; route: Route }) {
  const { inventory, settings, saveInventory, deleteInventory } = data;
  const today = isoDay(new Date());
  const [status, setStatus] = useState<StatusFilter>((route.params.get("status") as StatusFilter) || "all");
  const [issue, setIssue] = useState<Issue>((route.params.get("issue") as Issue) || "");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [labelIn, setLabelIn] = useState<string[]>([]);
  const [labelOut, setLabelOut] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(!!route.params.get("issue"));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ item: InventoryItem; isNew: boolean; platform?: Platform } | null>(null);
  const [quick, setQuick] = useState<InventoryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dupes = useMemo(() => duplicateSkus(inventory), [inventory]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = inventory.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q && ![i.title, i.sku, i.brand ?? "", i.notes ?? ""].some((s) => s.toLowerCase().includes(q))) return false;
      if (issue === "partial" && !isPartiallyDelisted(i)) return false;
      if (issue === "stale" && !(i.status === "listed" && i.listings.some((l) => relistState(l, today) === "stale"))) return false;
      if (issue === "duplicate" && !dupes.has(i.sku.trim().toLowerCase())) return false;
      if (issue === "nocost" && (i.cost != null || i.status === "sold")) return false;
      if (labelIn.length && !labelIn.every((l) => i.labels?.includes(l))) return false;
      if (labelOut.some((l) => i.labels?.includes(l))) return false;
      return true;
    });
    const created = (i: InventoryItem) => i.createdAt ?? i.listedAt ?? i.purchasedAt ?? "";
    const by: Record<Sort, (a: InventoryItem, b: InventoryItem) => number> = {
      newest: (a, b) => created(b).localeCompare(created(a)),
      oldest: (a, b) => created(a).localeCompare(created(b)),
      name: (a, b) => a.title.localeCompare(b.title),
      price: (a, b) => (b.listPrice ?? 0) - (a.listPrice ?? 0),
      sold: (a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""),
    };
    return rows.sort(by[sort]);
  }, [inventory, status, search, issue, labelIn, labelOut, sort, dupes, today]);

  useEffect(() => setPage(0), [status, search, issue, labelIn, labelOut, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  // Bulk selection covers the current page only, as the bar says.
  const selectedRows = shown.filter((i) => selected.has(i.id));
  const everListed = (p: Platform) => filtered.filter((i) => i.listings.some((l) => l.platform === p)).length;
  const counts = { all: inventory.length, draft: 0, listed: 0, sold: 0 };
  inventory.forEach((i) => counts[i.status]++);

  const patchListing = (item: InventoryItem, platform: Platform, patch: Partial<Listing>) =>
    saveInventory([{ ...item, updatedAt: new Date().toISOString(), listings: item.listings.map((l) => (l.platform === platform ? { ...l, ...patch } : l)) }]);
  const delistAll = (items: InventoryItem[]) =>
    saveInventory(
      items.map((i) => ({
        ...i,
        status: i.status === "sold" ? "sold" : "draft",
        updatedAt: new Date().toISOString(),
        listings: i.listings.map((l) => (l.status === "active" ? { ...l, status: "delisted" as const } : l)),
      })),
    );
  const blank = (): InventoryItem => ({
    id: newId(),
    sku: nextSku(inventory),
    title: "",
    status: "draft",
    listings: [],
    quantity: 1,
    labels: [],
    purchasedAt: today,
  });

  return (
    <div>
      <PageHeader title="Inventory" subtitle={`${counts.listed} listed · ${counts.draft} drafts · ${counts.sold} sold`}>
        <div className="flex items-center gap-2">
          <Menu
            align="right"
            button={(toggle) => (
              <button type="button" onClick={toggle} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted">
                <RefreshCw className="w-4 h-4" /> Resync
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    setNotice("Full sync reads every listing and sale from your marketplaces. Open the Reship extension and press Sync now; it also runs every 15 minutes.");
                  }}
                >
                  Full sync
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    setNotice("Quick sync checks for new sales only. Open the Reship extension and press Sync now.");
                  }}
                >
                  Quick sync
                </MenuItem>
                <MenuItem onClick={() => window.location.reload()}>Refresh this page</MenuItem>
              </>
            )}
          </Menu>
          <button
            type="button"
            onClick={() => setForm({ item: blank(), isNew: true })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#B5607A] text-white text-sm font-medium hover:bg-[#9E4D6A]"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
      </PageHeader>

      {notice && (
        <div className="px-4 md:px-8 py-2 border-b text-xs flex items-center gap-2 bg-sky-50 border-sky-200 text-sky-900">
          <span className="flex-1">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="px-4 md:px-8 pt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="overflow-x-auto max-w-full">
            <Pills
              value={status}
              onChange={setStatus}
              options={[
                { key: "all", label: `All (${counts.all})` },
                { key: "draft", label: `Drafts (${counts.draft})` },
                { key: "listed", label: `Listed (${counts.listed})` },
                { key: "sold", label: `Sold (${counts.sold})` },
              ]}
            />
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, SKU, brand, notes…"
              aria-label="Search inventory"
              className="pl-9 pr-3 py-1.5 text-sm bg-muted rounded-md border border-transparent focus:border-[#B5607A] focus:outline-none w-full"
            />
          </div>
          <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Item name</option>
            <option value="price">Price, high to low</option>
            <option value="sold">Sale detected at</option>
          </select>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-pressed={showFilters}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs ${showFilters || issue || labelIn.length || labelOut.length ? "border-[#B5607A] text-[#B5607A]" : "border-border text-foreground"}`}
          >
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
        </div>

        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-3 grid sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground w-14">Issues</span>
              <select className={selectClass} value={issue} onChange={(e) => setIssue(e.target.value as Issue)}>
                {ISSUES.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-14 pt-1">Labels</span>
              <div className="flex flex-wrap gap-1.5">
                {settings.labels.map((l) => {
                  const mode = labelIn.includes(l.id) ? "in" : labelOut.includes(l.id) ? "out" : "";
                  // Click cycles: include, exclude, off.
                  const next = () => {
                    if (mode === "") setLabelIn([...labelIn, l.id]);
                    else if (mode === "in") {
                      setLabelIn(labelIn.filter((x) => x !== l.id));
                      setLabelOut([...labelOut, l.id]);
                    } else setLabelOut(labelOut.filter((x) => x !== l.id));
                  };
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={next}
                      title="Click to include, again to exclude, again to clear"
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${mode === "in" ? "border-emerald-600 text-emerald-700" : mode === "out" ? "border-rose-600 text-rose-700 line-through" : "border-border text-muted-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                      {mode === "out" ? "not " : ""}
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 md:px-8 py-3">
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select page"
                    checked={shown.length > 0 && shown.every((i) => selected.has(i.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())}
                  />
                </th>
                <th className="text-left px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-normal min-w-[240px]">Item</th>
                {ALL_PLATFORMS.map((p) => (
                  <th key={p} className="px-1.5 py-2 font-normal" title={`${everListed(p)} of these items have been listed on ${p}`}>
                    <span className="flex flex-col items-center gap-0.5">
                      <PlatformIcon platform={p} className="w-4 h-4" />
                      <span className="text-[10px] text-muted-foreground">{p === "WhatNot" ? "Whatnot" : p}</span>
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums">{everListed(p)}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={2 + ALL_PLATFORMS.length} className="text-center text-sm text-muted-foreground py-12">
                    {inventory.length === 0 ? "No items yet. Add one, or sync your marketplaces with the Reship extension." : "No items match."}
                  </td>
                </tr>
              )}
              {shown.map((item) => (
                <tr key={item.id} className={`border-b border-border/60 last:border-0 ${selected.has(item.id) ? "bg-rose-50/40" : ""}`}>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.title}`}
                      checked={selected.has(item.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(item.id)) n.delete(item.id);
                          else n.add(item.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2.5">
                      {item.photo ? <img src={item.photo} alt="" className="w-11 h-11 rounded-md object-cover shrink-0" /> : <div className="w-11 h-11 rounded-md bg-muted shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setForm({ item, isNew: false })} className="text-sm font-medium text-foreground truncate max-w-[220px] text-left hover:text-[#B5607A]">
                            {item.title || "Untitled"}
                          </button>
                          <button type="button" aria-label="Quick edit" title="Quick edit" onClick={() => setQuick(item)} className="p-0.5 text-muted-foreground hover:text-foreground">
                            <PanelRight className="w-3.5 h-3.5" />
                          </button>
                          <Menu
                            button={(toggle) => (
                              <button type="button" aria-label="Item menu" onClick={toggle} className="p-0.5 text-muted-foreground hover:text-foreground">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    setForm({ item, isNew: false });
                                  }}
                                >
                                  Edit
                                </MenuItem>
                                {listedOn(item).length > 0 && (
                                  <MenuItem
                                    onClick={() => {
                                      close();
                                      delistAll([item]);
                                    }}
                                  >
                                    Delist everywhere
                                  </MenuItem>
                                )}
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    setForm({
                                      item: { ...item, id: newId(), sku: nextSku(inventory), status: "draft", listings: [], soldAt: undefined, soldOrders: undefined, listedAt: undefined, createdAt: undefined },
                                      isNew: true,
                                    });
                                  }}
                                >
                                  <Copy className="w-3.5 h-3.5" /> Copy
                                </MenuItem>
                                <MenuItem
                                  danger
                                  onClick={() => {
                                    close();
                                    if (window.confirm(`Delete ${item.title} from Reship? Live listings on marketplaces stay up.`)) deleteInventory([item.id]);
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </MenuItem>
                              </>
                            )}
                          </Menu>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                          <span className="font-mono">{item.sku}</span>
                          {item.listPrice != null && <span>${item.listPrice}</span>}
                          {(item.quantity ?? 1) > 1 && <span>qty {item.quantity}</span>}
                          <StatusChip item={item} />
                          <LabelDots defs={settings.labels} ids={item.labels} />
                        </div>
                      </div>
                    </div>
                  </td>
                  {ALL_PLATFORMS.map((p) => {
                    const l = item.listings.find((x) => x.platform === p);
                    return (
                      <td key={p} className="px-1.5 py-2 text-center">
                        {l ? (
                          <ListingCell
                            item={item}
                            listing={l}
                            today={today}
                            onDelist={() => patchListing(item, p, { status: "delisted" })}
                            onRelist={() => patchListing(item, p, { status: "active", relistedAt: today })}
                            onMove={() =>
                              saveInventory([
                                { ...item, listings: item.listings.filter((x) => x.platform !== p), updatedAt: new Date().toISOString() },
                                {
                                  ...item,
                                  id: newId(),
                                  sku: nextSku(inventory),
                                  listings: [l],
                                  status: l.status === "sold" ? "sold" : l.status === "active" ? "listed" : "draft",
                                  soldOrders: undefined,
                                  createdAt: new Date().toISOString(),
                                },
                              ])
                            }
                          />
                        ) : item.status === "sold" ? (
                          <span className="inline-block w-10 h-10" />
                        ) : (
                          <button
                            type="button"
                            title={`List on ${p}`}
                            aria-label={`List ${item.title} on ${p}`}
                            onClick={() => setForm({ item, isNew: false, platform: p })}
                            className="w-10 h-10 rounded-md border border-dashed border-border hover:border-[#B5607A] hover:bg-rose-50/40 inline-flex items-center justify-center text-muted-foreground/40 hover:text-[#B5607A]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            {filtered.length === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min(filtered.length, (page + 1) * PAGE_SIZE)}`} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="p-1.5 rounded-md border border-border disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 tabular-nums">
              {page + 1} / {pages}
            </span>
            <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="p-1.5 rounded-md border border-border disabled:opacity-40">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <BulkBar
          data={data}
          items={selectedRows}
          onDone={(msg) => {
            setSelected(new Set());
            if (msg) setNotice(msg);
          }}
          onDelist={() => {
            delistAll(selectedRows);
            setSelected(new Set());
          }}
        />
      )}

      {form && (
        <ListingForm
          key={form.item.id + (form.platform ?? "")}
          item={form.item}
          isNew={form.isNew}
          settings={settings}
          onlyPlatform={form.platform}
          onClose={() => setForm(null)}
          onSave={(i, msg) => {
            saveInventory([i]);
            setForm(null);
            if (msg) setNotice(msg);
          }}
          onDelete={(id) => {
            deleteInventory([id]);
            setForm(null);
          }}
        />
      )}
      {quick && (
        <QuickEdit
          item={quick}
          settings={settings}
          onClose={() => setQuick(null)}
          onSave={(i) => {
            saveInventory([i]);
            setQuick(null);
          }}
          onOpenFull={() => {
            setForm({ item: quick, isNew: false });
            setQuick(null);
          }}
        />
      )}
    </div>
  );
}

function StatusChip({ item }: { item: InventoryItem }) {
  if (isPartiallyDelisted(item)) return <span className="px-1.5 rounded bg-amber-50 text-amber-800">Sold · still listed</span>;
  const cfg = { draft: "bg-stone-100 text-stone-700", listed: "bg-sky-50 text-sky-800", sold: "bg-emerald-50 text-emerald-800" }[item.status];
  return (
    <span className={`px-1.5 rounded ${cfg}`}>
      {item.status === "draft" ? (item.readyToList ? "Ready to list" : "Draft") : item.status === "listed" ? "Listed" : "Sold"}
    </span>
  );
}

// One marketplace listing: its photo, with a menu to view, delist, relist or split it off.
function ListingCell({
  item,
  listing,
  today,
  onDelist,
  onRelist,
  onMove,
}: {
  item: InventoryItem;
  listing: Listing;
  today: string;
  onDelist: () => void;
  onRelist: () => void;
  onMove: () => void;
}) {
  const relist = relistState(listing, today);
  return (
    <Menu
      button={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`${listing.platform} listing: ${listing.status}`}
          title={`${listing.platform}: ${listing.status}${listing.price != null ? ` at $${listing.price}` : ""}`}
          className="relative inline-block w-10 h-10 rounded-md overflow-hidden border border-border align-middle"
        >
          {item.photo ? <img src={item.photo} alt="" className={`w-full h-full object-cover ${listing.status === "delisted" ? "grayscale opacity-40" : ""}`} /> : <span className="block w-full h-full bg-muted" />}
          {listing.status === "sold" && (
            <span className="absolute inset-0 bg-emerald-600/60 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </span>
          )}
          {listing.status === "active" && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
          {relist === "recent" && (
            <span className="absolute bottom-0.5 right-0.5 rounded-full bg-amber-400 p-px" title="Relisted in the last 7 days">
              <RotateCcw className="w-2.5 h-2.5 text-white" />
            </span>
          )}
          {relist === "stale" && (
            <span className="absolute bottom-0.5 right-0.5 rounded-full bg-stone-500 p-px" title="Not relisted in over 60 days">
              <Clock className="w-2.5 h-2.5 text-white" />
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-3 py-1 text-[11px] text-muted-foreground capitalize">
            {listing.platform} · {listing.status}
            {listing.price != null ? ` · $${listing.price}` : ""}
          </p>
          {listing.url && (
            <a href={listing.url} target="_blank" rel="noreferrer" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-foreground">
              <ExternalLink className="w-3.5 h-3.5" /> View on {listing.platform}
            </a>
          )}
          {listing.status === "active" && (
            <MenuItem
              onClick={() => {
                close();
                onDelist();
              }}
            >
              Delist
            </MenuItem>
          )}
          {listing.status !== "sold" && (
            <MenuItem
              onClick={() => {
                close();
                onRelist();
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Relist
            </MenuItem>
          )}
          {item.listings.length > 1 && (
            <MenuItem
              onClick={() => {
                close();
                onMove();
              }}
            >
              Move to new item
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

// Actions for the checked rows on this page.
function BulkBar({ data, items, onDone, onDelist }: { data: Data; items: InventoryItem[]; onDone: (msg?: string) => void; onDelist: () => void }) {
  const { settings, saveInventory, deleteInventory } = data;
  const [mode, setMode] = useState<"" | "crosslist" | "label" | "edit">("");
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());
  const [edit, setEdit] = useState<{ condition: string; quantity: string; cost: string; skuPrefix: string }>({ condition: "", quantity: "", cost: "", skuPrefix: "" });
  const today = isoDay(new Date());
  const crosslist = () => {
    saveInventory(
      items
        .filter((i) => i.status !== "sold")
        .map((i) => {
          const listings = [...i.listings];
          platforms.forEach((p) => {
            const at = listings.findIndex((l) => l.platform === p);
            const next: Listing = { platform: p, status: "active", listedAt: today, price: priceFor(i.listPrice, p, settings) };
            if (at === -1) listings.push(next);
            else if (listings[at].status === "delisted") listings[at] = { ...listings[at], status: "active", relistedAt: today };
          });
          return { ...i, listings, status: "listed" as const, listedAt: i.listedAt ?? today, updatedAt: new Date().toISOString() };
        }),
    );
    onDone(`Crosslisted ${items.length} item${items.length !== 1 ? "s" : ""} to ${[...platforms].join(", ")}.`);
  };
  const applyEdit = () => {
    saveInventory(
      items.map((i, n) => ({
        ...i,
        condition: (edit.condition || i.condition) as Condition | undefined,
        quantity: edit.quantity ? Math.max(1, parseInt(edit.quantity) || 1) : i.quantity,
        cost: edit.cost ? parseFloat(edit.cost) || 0 : i.cost,
        sku: edit.skuPrefix ? `${edit.skuPrefix}-${String(n + 1).padStart(3, "0")}` : i.sku,
        updatedAt: new Date().toISOString(),
      })),
    );
    onDone(`Updated ${items.length} item${items.length !== 1 ? "s" : ""}.`);
  };
  return (
    <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl bg-foreground text-background rounded-xl shadow-2xl p-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium mr-2">{items.length} selected on this page</span>
        <button type="button" onClick={() => setMode(mode === "crosslist" ? "" : "crosslist")} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20">
          Crosslist
        </button>
        <button type="button" onClick={() => setMode(mode === "label" ? "" : "label")} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1">
          <Tag className="w-3.5 h-3.5" /> Labels
        </button>
        <button type="button" onClick={() => setMode(mode === "edit" ? "" : "edit")} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20">
          Bulk edit
        </button>
        <button type="button" onClick={onDelist} className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20">
          Delist
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${items.length} items from Reship? Live listings on marketplaces stay up.`)) {
              deleteInventory(items.map((i) => i.id));
              onDone();
            }
          }}
          className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-rose-500/70"
        >
          Delete
        </button>
        <button type="button" aria-label="Clear selection" onClick={() => onDone()} className="ml-auto p-1 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
      {mode === "crosslist" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {ALL_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platforms.has(p)}
              onClick={() =>
                setPlatforms((s) => {
                  const n = new Set(s);
                  if (n.has(p)) n.delete(p);
                  else n.add(p);
                  return n;
                })
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${platforms.has(p) ? "bg-white text-foreground" : "bg-white/10"}`}
            >
              <PlatformIcon platform={p} /> {p}
            </button>
          ))}
          <button type="button" disabled={!platforms.size} onClick={crosslist} className="ml-auto px-3 py-1 rounded-md bg-[#B5607A] text-white text-xs font-medium disabled:opacity-50">
            List on {platforms.size || "…"}
          </button>
        </div>
      )}
      {mode === "label" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {settings.labels.map((l) => {
            const all = items.every((i) => i.labels?.includes(l.id));
            return (
              <button
                key={l.id}
                type="button"
                onClick={() =>
                  saveInventory(items.map((i) => ({ ...i, labels: all ? (i.labels ?? []).filter((x) => x !== l.id) : [...new Set([...(i.labels ?? []), l.id])] })))
                }
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${all ? "bg-white text-foreground" : "bg-white/10"}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                {all ? `Remove ${l.name}` : `Add ${l.name}`}
              </button>
            );
          })}
        </div>
      )}
      {mode === "edit" && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end text-foreground">
          <select className={inputClass} value={edit.condition} onChange={(e) => setEdit({ ...edit, condition: e.target.value })} aria-label="Condition">
            <option value="">Condition…</option>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className={inputClass} placeholder="Quantity" inputMode="numeric" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
          <input className={inputClass} placeholder="Cost each ($)" inputMode="decimal" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
          <input className={inputClass} placeholder="New SKU prefix" value={edit.skuPrefix} onChange={(e) => setEdit({ ...edit, skuPrefix: e.target.value.toUpperCase() })} />
          <button type="button" onClick={applyEdit} className="px-3 py-1.5 rounded-md bg-[#B5607A] text-white text-xs font-medium">
            Apply to {items.length}
          </button>
        </div>
      )}
    </div>
  );
}
