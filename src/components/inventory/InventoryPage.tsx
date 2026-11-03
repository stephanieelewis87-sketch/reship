import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  Images,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  LayoutGrid,
  List,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Shirt,
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
import { salesHints } from "@/lib/videoListing";
import { Pills } from "../analytics/parts";
import { PageHeader } from "../shell/PageHeader";
import { go, type Route } from "../shell/route";
import { EmptyState, Menu, MenuItem, Modal, PlatformIcon, inputClass, selectClass } from "../ui";
import { LabelDots } from "./LabelChips";
import { ListingForm } from "./ListingForm";
import { QuickEdit } from "./QuickEdit";
import { PhotoListing } from "./PhotoListing";
import { VideoListing } from "./VideoListing";
import { ScanModal, SkuLabelsModal } from "./SkuTools";
import { GuardianPage } from "./GuardianPage";
import { LockedCard, LockedSection, PlanTag, currentPlan, upgradeFor } from "../plans/PlanGate";
import { type Feature, hasFeature } from "@/lib/plans";
import { checkInventory } from "@/lib/guardian";

type Data = ReturnType<typeof useReshipData>;
type StatusFilter = "all" | "draft" | "listed" | "sold";
type Issue = "" | "partial" | "stale" | "duplicate" | "nocost";
type Sort = "newest" | "oldest" | "name" | "price" | "sold";
const PAGE_SIZE = 24;
type View = "list" | "board";
const VIEW_KEY = "reship.inventory.view";
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
};

const ISSUES: { key: Issue; label: string }[] = [
  { key: "", label: "Any" },
  { key: "partial", label: "Partially delisted" },
  { key: "stale", label: "Not relisted in 60+ days" },
  { key: "duplicate", label: "Duplicate SKU" },
  { key: "nocost", label: "Missing cost" },
];

// A small menu that closes when you click elsewhere.
function AddOption({ icon: Icon, title, hint, onClick }: { icon: typeof Plus; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-muted">
      <Icon className="w-4 h-4 mt-0.5 text-accent shrink-0" />
      <span>
        <span className="block text-sm text-foreground">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}


export function InventoryPage({ data, route }: { data: Data; route: Route }) {
  const { inventory, settings, saveInventory, deleteInventory } = data;
  const today = isoDay(new Date());
  const plan = currentPlan(settings);
  const can = (f: Feature) => hasFeature(plan, f);
  // Runs `go` when the plan has the feature, and opens the upgrade page when it doesn't.
  const gated = (f: Feature, go: () => void) => () => (can(f) ? go() : upgradeFor(f));
  const [status, setStatus] = useState<StatusFilter>((route.params.get("status") as StatusFilter) || "all");
  const [issue, setIssue] = useState<Issue>((route.params.get("issue") as Issue) || "");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [labelIn, setLabelIn] = useState<string[]>([]);
  const [labelOut, setLabelOut] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [scan, setScan] = useState(false);
  const [skuLabels, setSkuLabels] = useState<InventoryItem[] | null>(null);
  const [showFilters, setShowFilters] = useState(!!route.params.get("issue"));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{
    item: InventoryItem;
    isNew: boolean;
    platform?: Platform;
  } | null>(null);
  const [quick, setQuick] = useState<InventoryItem | null>(null);
  // #/inventory?video opens List with a video straight away (the Home page and homepage link here).
  const [video, setVideo] = useState(route.params.has("video"));
  useEffect(() => {
    if (route.params.has("video")) setVideo(true);
  }, [route]);
  // #/inventory?photos opens List from photos the same way.
  const [photoUpload, setPhotoUpload] = useState(route.params.has("photos"));
  useEffect(() => {
    if (route.params.has("photos")) setPhotoUpload(true);
  }, [route]);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // The choice just won't be remembered.
    }
  };

  const dupes = useMemo(() => duplicateSkus(inventory), [inventory]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = inventory.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q && ![i.title, i.sku, i.brand ?? "", i.notes ?? "", i.location ?? "", ...i.listings.map((l) => l.listingId ?? "")].some((s) => s.toLowerCase().includes(q))) return false;
      if (location && (location === "-" ? !!i.location : i.location !== location)) return false;
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
  }, [inventory, status, search, issue, labelIn, labelOut, location, sort, dupes, today]);
  const locations = useMemo(() => [...new Set(inventory.map((i) => i.location).filter((l): l is string => !!l))].sort(), [inventory]);
  const guardianAlerts = useMemo(() => checkInventory(inventory, data.orders).filter((i) => i.severity === "high").length, [inventory, data.orders]);

  useEffect(() => setPage(0), [status, search, issue, labelIn, labelOut, location, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  // Bulk selection covers the current page only, as the bar says.
  const selectedRows = shown.filter((i) => selected.has(i.id));
  const everListed = (p: Platform) => filtered.filter((i) => i.listings.some((l) => l.platform === p)).length;
  const counts = { all: inventory.length, draft: 0, listed: 0, sold: 0 };
  inventory.forEach((i) => counts[i.status]++);

  const patchListing = (item: InventoryItem, platform: Platform, patch: Partial<Listing>) =>
    saveInventory([
      {
        ...item,
        updatedAt: new Date().toISOString(),
        listings: item.listings.map((l) => (l.platform === platform ? { ...l, ...patch } : l)),
      },
    ]);
  const delistAll = (items: InventoryItem[]) => {
    if (!can("delisting")) return upgradeFor("delisting");
    return saveInventory(
      items.map((i) => ({
        ...i,
        status: i.status === "sold" ? "sold" : "draft",
        updatedAt: new Date().toISOString(),
        listings: i.listings.map((l) => (l.status === "active" ? { ...l, status: "delisted" as const } : l)),
      })),
    );
  };
  const copyItem = (item: InventoryItem) =>
    setForm({
      item: {
        ...item,
        id: newId(),
        sku: nextSku(inventory, settings.skuFormat),
        status: "draft",
        listings: [],
        soldAt: undefined,
        soldOrders: undefined,
        listedAt: undefined,
        createdAt: undefined,
      },
      isNew: true,
    });
  const deleteItem = (item: InventoryItem) => {
    if (window.confirm(`Delete ${item.title} from SellSync? Live listings on marketplaces stay up.`)) deleteInventory([item.id]);
  };
  const moveListing = (item: InventoryItem, l: Listing) =>
    saveInventory([
      {
        ...item,
        listings: item.listings.filter((x) => x.platform !== l.platform),
        updatedAt: new Date().toISOString(),
      },
      {
        ...item,
        id: newId(),
        sku: nextSku(inventory, settings.skuFormat),
        listings: [l],
        status: l.status === "sold" ? "sold" : l.status === "active" ? "listed" : "draft",
        soldOrders: undefined,
        createdAt: new Date().toISOString(),
      },
    ]);
  const listingActions = (item: InventoryItem, l: Listing) => ({
    onDelist: () => patchListing(item, l.platform, { status: "delisted" }),
    onRelist: () => patchListing(item, l.platform, { status: "active", relistedAt: today }),
    onMove: () => moveListing(item, l),
  });
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const blank = (): InventoryItem => ({
    id: newId(),
    sku: nextSku(inventory, settings.skuFormat),
    title: "",
    status: "draft",
    listings: [],
    quantity: 1,
    labels: [],
    purchasedAt: today,
  });

  const formModal = form && (
    <ListingForm
      key={form.item.id + (form.platform ?? "")}
      item={form.item}
      isNew={form.isNew}
      settings={settings}
      ai={can("ai") ? data.store.listingAi : null}
      aiLocked={!can("ai")}
      plan={plan}
      inventory={inventory}
      store={data.store}
      salesNotes={salesHints(inventory)}
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
      onPrintLabel={(i) => setSkuLabels([i])}
    />
  );
  const skuLabelsModal = skuLabels && <SkuLabelsModal items={skuLabels} onClose={() => setSkuLabels(null)} />;

  const clearFilters = () => {
    setStatus("all");
    setIssue("");
    setSearch("");
    setLocation("");
    setLabelIn([]);
    setLabelOut([]);
  };
  const emptyInventory =
    inventory.length === 0 ? (
      <EmptyState
        icon={Shirt}
        title="No items yet"
        text="Add your first item, list a pile at once from photos or a video, or sync your marketplaces with the SellSync extension."
        action={{ label: "Add an item", onClick: () => setForm({ item: blank(), isNew: true }) }}
      />
    ) : (
      <EmptyState icon={Search} title="No items match" text="Try a different search, or clear the filters." action={{ label: "Clear filters", onClick: clearFilters }} />
    );

  if (route.params.has("guardian") && !can("backups"))
    return <LockedSection feature="backups" title="Inventory Guardian" text="Daily backups of your inventory, one-click restore, listing checks and a history of every change." />;
  if (route.params.has("guardian"))
    return (
      <>
        <GuardianPage data={data} onOpenItem={(item) => setForm({ item, isNew: false })} />
        {formModal}
        {skuLabelsModal}
      </>
    );

  return (
    <div>
      <PageHeader title="Inventory" subtitle={`${counts.listed} listed · ${counts.draft} drafts · ${counts.sold} sold`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={gated("backups", () => go("inventory", { guardian: "" }))}
            title="Inventory Guardian: backups, recovery, listing checks and change history"
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
          >
            <ShieldCheck className="w-4 h-4" /> <span className="hidden sm:inline">Guardian</span>
            {!can("backups") && <PlanTag feature="backups" className="hidden sm:inline-flex" />}
            {guardianAlerts > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[11px] leading-4 text-center">{guardianAlerts}</span>}
          </button>
          <Menu
            align="right"
            button={(toggle) => (
              <button type="button" onClick={toggle} aria-label="Sync" title="Sync with your marketplaces" className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-border text-sm hover:bg-muted">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    setNotice("Full sync reads every listing and sale from your marketplaces. Open the SellSync extension and press Sync now; it also runs every 15 minutes.");
                  }}
                >
                  Full sync
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    setNotice("Quick sync checks for new sales only. Open the SellSync extension and press Sync now.");
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
            onClick={gated("videoListing", () => setVideo(true))}
            className="flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg bg-amber-400 text-amber-950 text-sm font-bold shadow-md shadow-amber-400/30 ring-2 ring-amber-300 hover:bg-amber-300 hover:shadow-lg transition"
          >
            <Clapperboard className="w-4 h-4" />
            <span className="hidden sm:inline">List with a video</span>
            <span className="sm:hidden">Video</span>
            {!can("videoListing") && <PlanTag feature="videoListing" />}
          </button>
          <Menu
            align="right"
            button={(toggle) => (
              <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-hover"
              >
                <Plus className="w-4 h-4" /> Add <ChevronDown className="w-3.5 h-3.5 -mr-0.5" />
              </button>
            )}
          >
            {(close) => (
              <div className="min-w-56">
                <AddOption icon={Plus} title="One item" hint="Fill in the details yourself" onClick={() => (close(), setForm({ item: blank(), isNew: true }))} />
                <AddOption icon={Images} title="From photos" hint={can("ai") ? "Up to 25 items, one listing each" : "AI listing, on Flow"} onClick={() => (close(), gated("ai", () => setPhotoUpload(true))())} />
                <AddOption icon={Clapperboard} title="From a video" hint={can("videoListing") ? "Film your pile, get drafts" : "Video listing, on Flow"} onClick={() => (close(), gated("videoListing", () => setVideo(true))())} />
                <AddOption icon={ScanLine} title="Scan a barcode" hint="Find or add an item by its SKU" onClick={() => (close(), setScan(true))} />
              </div>
            )}
          </Menu>
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
              className="pl-9 pr-3 py-1.5 text-sm bg-muted rounded-md border border-transparent focus:border-accent focus:outline-none w-full"
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
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs ${showFilters || issue || location || labelIn.length || labelOut.length ? "border-accent text-accent" : "border-border text-foreground"}`}
          >
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <div className="flex rounded-md border border-border overflow-hidden text-xs" role="group" aria-label="View">
            {(
              [
                ["list", "List", List],
                ["board", "Board", LayoutGrid],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 ${view === v ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
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
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground w-14">Location</span>
              <select className={selectClass} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Anywhere</option>
                <option value="-">No location yet</option>
                {locations.map((l) => (
                  <option key={l}>{l}</option>
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
        {view === "board" ? (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((i) => selected.has(i.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())}
              />
              Select this page
            </label>
            {shown.length === 0 ? (
              <div className="bg-card border border-border rounded-xl">{emptyInventory}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {shown.map((item) => (
                  <BoardCard
                    key={item.id}
                    item={item}
                    settings={settings}
                    today={today}
                    selected={selected.has(item.id)}
                    onToggle={() => toggleSelect(item.id)}
                    onEdit={() => setForm({ item, isNew: false })}
                    onQuick={() => setQuick(item)}
                    onListOn={(p) => setForm({ item, isNew: false, platform: p })}
                    actionsFor={(l) => listingActions(item, l)}
                    menu={<ItemMenu item={item} onEdit={() => setForm({ item, isNew: false })} onDelistAll={() => delistAll([item])} onCopy={() => copyItem(item)} onDelete={() => deleteItem(item)} onLabel={() => setSkuLabels([item])} />}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
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
                  <th className="text-left px-2 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-normal min-w-[240px]">Item</th>
                  {ALL_PLATFORMS.map((p) => (
                    <th key={p} className="px-1.5 py-2 font-normal" title={`${everListed(p)} of these items have been listed on ${p}`}>
                      <span className="flex flex-col items-center gap-0.5">
                        <PlatformIcon platform={p} className="w-4 h-4" />
                        <span className="text-[11px] text-muted-foreground">{p === "WhatNot" ? "Whatnot" : p}</span>
                        <span className="text-[11px] text-muted-foreground/70 tabular-nums">{everListed(p)}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={2 + ALL_PLATFORMS.length}>{emptyInventory}</td>
                  </tr>
                )}
                {shown.map((item) => (
                  <tr key={item.id} className={`border-b border-border/60 last:border-0 ${selected.has(item.id) ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 align-middle">
                      <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2.5">
                        {item.photo ? <img src={item.photo} alt="" className="w-11 h-11 rounded-md object-cover shrink-0" /> : <div className="w-11 h-11 rounded-md bg-muted shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setForm({ item, isNew: false })} className="text-sm font-medium text-foreground truncate max-w-[220px] text-left hover:text-accent">
                              {item.title || "Untitled"}
                            </button>
                            <button type="button" aria-label="Quick edit" title="Quick edit" onClick={() => setQuick(item)} className="p-0.5 text-muted-foreground hover:text-foreground">
                              <PanelRight className="w-3.5 h-3.5" />
                            </button>
                            <ItemMenu
                              item={item}
                              onEdit={() => setForm({ item, isNew: false })}
                              onDelistAll={() => delistAll([item])}
                              onCopy={() => copyItem(item)}
                              onDelete={() => deleteItem(item)}
                              onLabel={() => setSkuLabels([item])}
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground">
                            <span className="font-mono">{item.sku}</span>
                            {item.location && <span title="Location">@ {item.location}</span>}
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
                            <ListingCell item={item} listing={l} today={today} {...listingActions(item, l)} />
                          ) : item.status === "sold" ? (
                            <span className="inline-block w-10 h-10" />
                          ) : (
                            <button
                              type="button"
                              title={`List on ${p}`}
                              aria-label={`List ${item.title} on ${p}`}
                              onClick={() => setForm({ item, isNew: false, platform: p })}
                              className="w-10 h-10 rounded-md border border-dashed border-border hover:border-accent hover:bg-rose-50/40 inline-flex items-center justify-center text-muted-foreground/40 hover:text-accent"
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
        )}

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
          canCrosslist={can("crosslisting")}
          onDelist={() => {
            if (!can("delisting")) return upgradeFor("delisting");
            delistAll(selectedRows);
            setSelected(new Set());
          }}
          onLabels={() => setSkuLabels(selectedRows)}
        />
      )}

      {(video && !can("videoListing")) || (photoUpload && !can("ai")) ? (
        <Modal onClose={() => (setVideo(false), setPhotoUpload(false))} label="Upgrade">
          <div className="p-5">
            <LockedCard feature={video ? "videoListing" : "ai"} text={video ? "Film your pile for a few seconds and get a draft listing for every item." : "Upload photos of up to 25 items and AI writes one listing for each."} compact />
          </div>
        </Modal>
      ) : null}
      {video && can("videoListing") && (
        <VideoListing
          data={data}
          onClose={() => setVideo(false)}
          onSaved={(msg) => {
            setVideo(false);
            setStatus("draft");
            setNotice(msg);
          }}
        />
      )}
      {photoUpload && can("ai") && (
        <PhotoListing
          data={data}
          onClose={() => setPhotoUpload(false)}
          onSaved={(msg) => {
            setPhotoUpload(false);
            setStatus("draft");
            setNotice(msg);
          }}
        />
      )}
      {formModal}
      {skuLabelsModal}
      {scan && (
        <ScanModal
          inventory={inventory}
          onClose={() => setScan(false)}
          onOpen={(item) => {
            setScan(false);
            setForm({ item, isNew: false });
          }}
          onMove={(item, loc) => saveInventory([{ ...item, location: loc || undefined, updatedAt: new Date().toISOString() }])}
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
  const cfg = {
    draft: "bg-stone-100 text-stone-700",
    listed: "bg-sky-50 text-sky-800",
    sold: "bg-emerald-50 text-emerald-800",
  }[item.status];
  return <span className={`px-1.5 rounded ${cfg}`}>{item.status === "draft" ? (item.readyToList ? "Ready to list" : "Draft") : item.status === "listed" ? "Listed" : "Sold"}</span>;
}

function ItemMenu({
  item,
  onEdit,
  onDelistAll,
  onCopy,
  onDelete,
  onLabel,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onDelistAll: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onLabel: () => void;
}) {
  const run = (close: () => void, fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <Menu
      button={(toggle) => (
        <button type="button" aria-label="Item menu" onClick={toggle} className="p-0.5 text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem onClick={run(close, onEdit)}>Edit</MenuItem>
          {listedOn(item).length > 0 && <MenuItem onClick={run(close, onDelistAll)}>Delist everywhere</MenuItem>}
          <MenuItem onClick={run(close, onCopy)}>
            <Copy className="w-3.5 h-3.5" /> Copy
          </MenuItem>
          <MenuItem onClick={run(close, onLabel)}>
            <ScanLine className="w-3.5 h-3.5" /> Print SKU label
          </MenuItem>
          <MenuItem danger onClick={run(close, onDelete)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

interface ListingActions {
  onDelist: () => void;
  onRelist: () => void;
  onMove: () => void;
}

// The menu behind one marketplace listing: view, delist, relist or split it off.
function ListingMenu({
  item,
  listing,
  button,
  onDelist,
  onRelist,
  onMove,
}: {
  item: InventoryItem;
  listing: Listing;
  button: (toggle: () => void) => ReactNode;
} & ListingActions) {
  const run = (close: () => void, fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <Menu button={button}>
      {(close) => (
        <>
          <p className="px-3 py-1 text-[12px] text-muted-foreground capitalize">
            {listing.platform} · {listing.status}
            {listing.price != null ? ` · $${listing.price}` : ""}
          </p>
          {listing.url && (
            <a href={listing.url} target="_blank" rel="noreferrer" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-foreground">
              <ExternalLink className="w-3.5 h-3.5" /> View on {listing.platform}
            </a>
          )}
          {listing.status === "active" && <MenuItem onClick={run(close, onDelist)}>Delist</MenuItem>}
          {listing.status !== "sold" && (
            <MenuItem onClick={run(close, onRelist)}>
              <RotateCcw className="w-3.5 h-3.5" /> Relist
            </MenuItem>
          )}
          {item.listings.length > 1 && <MenuItem onClick={run(close, onMove)}>Move to new item</MenuItem>}
        </>
      )}
    </Menu>
  );
}

function RelistBadge({ listing, today }: { listing: Listing; today: string }) {
  const relist = relistState(listing, today);
  if (relist === "recent")
    return (
      <span className="rounded-full bg-amber-400 p-px" title="Relisted in the last 7 days">
        <RotateCcw className="w-2.5 h-2.5 text-white" />
      </span>
    );
  if (relist === "stale")
    return (
      <span className="rounded-full bg-stone-500 p-px" title="Not relisted in over 60 days">
        <Clock className="w-2.5 h-2.5 text-white" />
      </span>
    );
  return null;
}

// List view: one marketplace listing as a photo square.
function ListingCell({ item, listing, today, ...actions }: { item: InventoryItem; listing: Listing; today: string } & ListingActions) {
  return (
    <ListingMenu
      item={item}
      listing={listing}
      {...actions}
      button={(toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`${listing.platform} listing: ${listing.status}`}
          title={`${listing.platform}: ${listing.status}${listing.price != null ? ` at $${listing.price}` : ""}`}
          className="relative inline-block w-10 h-10 rounded-md overflow-hidden border border-border align-middle"
        >
          {item.photo ? (
            <img src={item.photo} alt="" className={`w-full h-full object-cover ${listing.status === "delisted" ? "grayscale opacity-40" : ""}`} />
          ) : (
            <span className="block w-full h-full bg-muted" />
          )}
          {listing.status === "sold" && (
            <span className="absolute inset-0 bg-emerald-600/60 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </span>
          )}
          {listing.status === "active" && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />}
          <span className="absolute bottom-0.5 right-0.5">
            <RelistBadge listing={listing} today={today} />
          </span>
        </button>
      )}
    />
  );
}

const LISTING_TONE = {
  active: "text-emerald-700",
  delisted: "text-muted-foreground",
  sold: "text-emerald-800 font-medium",
};
const LISTING_LABEL = { active: "Active", delisted: "Delisted", sold: "Sold" };

// Board view: one item as a card, with a row for each marketplace it's on.
function BoardCard({
  item,
  settings,
  today,
  selected,
  onToggle,
  onEdit,
  onQuick,
  onListOn,
  actionsFor,
  menu,
}: {
  item: InventoryItem;
  settings: Data["settings"];
  today: string;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onQuick: () => void;
  onListOn: (p: Platform) => void;
  actionsFor: (l: Listing) => ListingActions;
  menu: ReactNode;
}) {
  const notOn = ALL_PLATFORMS.filter((p) => !item.listings.some((l) => l.platform === p));
  return (
    <article className={`bg-card border rounded-xl overflow-hidden flex flex-col ${selected ? "border-accent ring-1 ring-accent/40" : "border-border"}`}>
      <div className="relative aspect-[16/9] sm:aspect-[4/3] bg-muted">
        {item.photo && <img src={item.photo} alt="" className="w-full h-full object-cover" />}
        <label className="absolute top-2 left-2 bg-card/90 rounded p-1 flex">
          <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected} onChange={onToggle} />
        </label>
        <span className="absolute top-2 right-2 text-[12px]">
          <StatusChip item={item} />
        </span>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <div className="flex items-start gap-1">
            <button type="button" onClick={onEdit} className="text-sm font-medium text-foreground text-left leading-snug hover:text-accent flex-1 min-w-0">
              {item.title || "Untitled"}
            </button>
            <button type="button" aria-label="Quick edit" title="Quick edit" onClick={onQuick} className="p-0.5 text-muted-foreground hover:text-foreground">
              <PanelRight className="w-3.5 h-3.5" />
            </button>
            {menu}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground mt-0.5">
            <span className="font-mono">{item.sku}</span>
            {item.listPrice != null && <span>${item.listPrice}</span>}
            {(item.quantity ?? 1) > 1 && <span>qty {item.quantity}</span>}
            <LabelDots defs={settings.labels} ids={item.labels} />
          </div>
        </div>
        <ul className="border-t border-border/70 divide-y divide-border/50 text-xs">
          {item.listings.length === 0 && <li className="py-1.5 text-muted-foreground">Not listed anywhere yet.</li>}
          {item.listings.map((l) => (
            <li key={l.platform}>
              <ListingMenu
                item={item}
                listing={l}
                {...actionsFor(l)}
                button={(toggle) => (
                  <button type="button" onClick={toggle} aria-label={`${l.platform} listing: ${l.status}`} className="w-full flex items-center gap-2 py-1.5 hover:bg-muted/60 rounded text-left">
                    <PlatformIcon platform={l.platform} className="w-3.5 h-3.5" />
                    <span className="flex-1 text-foreground">{l.platform === "WhatNot" ? "Whatnot" : l.platform}</span>
                    <RelistBadge listing={l} today={today} />
                    <span className={LISTING_TONE[l.status]}>{LISTING_LABEL[l.status]}</span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">{l.price != null ? `$${l.price}` : ""}</span>
                  </button>
                )}
              />
            </li>
          ))}
        </ul>
        {item.status !== "sold" && notOn.length > 0 && (
          <div className="mt-auto flex items-center gap-1 flex-wrap pt-1">
            <span className="text-[12px] text-muted-foreground mr-0.5">List on</span>
            {notOn.map((p) => (
              <button
                key={p}
                type="button"
                title={`List on ${p}`}
                aria-label={`List ${item.title} on ${p}`}
                onClick={() => onListOn(p)}
                className="w-6 h-6 rounded-md border border-dashed border-border hover:border-accent hover:bg-rose-50/40 inline-flex items-center justify-center"
              >
                <PlatformIcon platform={p} className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// Actions for the checked rows on this page.
function BulkBar({
  data,
  items,
  canCrosslist,
  onDone,
  onDelist,
  onLabels,
}: {
  data: Data;
  items: InventoryItem[];
  canCrosslist: boolean;
  onDone: (msg?: string) => void;
  onDelist: () => void;
  onLabels: () => void;
}) {
  const { settings, saveInventory, deleteInventory } = data;
  const [mode, setMode] = useState<"" | "crosslist" | "label" | "edit">("");
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set());
  const [edit, setEdit] = useState<{
    condition: string;
    quantity: string;
    cost: string;
    location: string;
  }>({ condition: "", quantity: "", cost: "", location: "" });
  const today = isoDay(new Date());
  const crosslist = () => {
    saveInventory(
      items
        .filter((i) => i.status !== "sold")
        .map((i) => {
          const listings = [...i.listings];
          platforms.forEach((p) => {
            const at = listings.findIndex((l) => l.platform === p);
            const next: Listing = {
              platform: p,
              status: "active",
              listedAt: today,
              price: priceFor(i.listPrice, p, settings),
            };
            if (at === -1) listings.push(next);
            else if (listings[at].status === "delisted")
              listings[at] = {
                ...listings[at],
                status: "active",
                relistedAt: today,
              };
          });
          return {
            ...i,
            listings,
            status: "listed" as const,
            listedAt: i.listedAt ?? today,
            updatedAt: new Date().toISOString(),
          };
        }),
    );
    onDone(`Crosslisted ${items.length} item${items.length !== 1 ? "s" : ""} to ${[...platforms].join(", ")}.`);
  };
  const applyEdit = () => {
    saveInventory(
      items.map((i) => ({
        ...i,
        condition: (edit.condition || i.condition) as Condition | undefined,
        quantity: edit.quantity ? Math.max(1, parseInt(edit.quantity) || 1) : i.quantity,
        cost: edit.cost ? parseFloat(edit.cost) || 0 : i.cost,
        location: edit.location.trim() || i.location,
        updatedAt: new Date().toISOString(),
      })),
      "Bulk edit",
    );
    onDone(`Updated ${items.length} item${items.length !== 1 ? "s" : ""}.`);
  };
  return (
    <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl bg-foreground text-background rounded-xl shadow-2xl p-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium mr-2">{items.length} selected on this page</span>
        <button
          type="button"
          onClick={() => (canCrosslist ? setMode(mode === "crosslist" ? "" : "crosslist") : upgradeFor("crosslisting"))}
          className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20 flex items-center gap-1"
        >
          Crosslist {!canCrosslist && <PlanTag feature="crosslisting" />}
        </button>
        <button type="button" onClick={() => setMode(mode === "label" ? "" : "label")} className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20 flex items-center gap-1">
          <Tag className="w-3.5 h-3.5" /> Labels
        </button>
        <button type="button" onClick={() => setMode(mode === "edit" ? "" : "edit")} className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20">
          Bulk edit
        </button>
        <button type="button" onClick={onLabels} className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20 flex items-center gap-1">
          <ScanLine className="w-3.5 h-3.5" /> SKU labels
        </button>
        <button type="button" onClick={onDelist} className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-background/20">
          Delist
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${items.length} items from SellSync? Live listings on marketplaces stay up.`)) {
              deleteInventory(items.map((i) => i.id));
              onDone();
            }
          }}
          className="px-2.5 py-1 rounded-md bg-background/10 hover:bg-rose-500/70"
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
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${platforms.has(p) ? "bg-background text-foreground" : "bg-background/10"}`}
            >
              <PlatformIcon platform={p} /> {p}
            </button>
          ))}
          <button type="button" disabled={!platforms.size} onClick={crosslist} className="ml-auto px-3 py-1 rounded-md bg-accent text-accent-foreground text-xs font-medium disabled:opacity-50">
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
                  saveInventory(
                    items.map((i) => ({
                      ...i,
                      labels: all ? (i.labels ?? []).filter((x) => x !== l.id) : [...new Set([...(i.labels ?? []), l.id])],
                    })),
                  )
                }
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${all ? "bg-background text-foreground" : "bg-background/10"}`}
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
          <input className={inputClass} placeholder="Location" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
          <button type="button" onClick={applyEdit} className="px-3 py-1.5 rounded-md bg-accent text-accent-foreground text-xs font-medium">
            Apply to {items.length}
          </button>
        </div>
      )}
    </div>
  );
}
