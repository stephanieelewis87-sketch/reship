import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileUp,
  LayoutGrid,
  List,
  Menu,
  Plus,
  Printer,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { LabelStatus, Order, OrderItem, Platform, PrintOptions } from "@/lib/types";
import { isAddressComplete } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { buildPrintJob } from "@/lib/printJob";
import { trackingUrl } from "@/lib/tracking";
import { Sidebar } from "./Sidebar";
import { PrintModal } from "./PrintModal";
import { BuyLabelsModal } from "./BuyLabelsModal";
import { OrderDrawer, blankOrder } from "./OrderDrawer";
import { ImportCsvModal } from "./ImportCsvModal";
import { SettingsModal, type SettingsTab } from "./SettingsModal";
import { BundleBadge, PhotoCollage, PlatformBadge, SkuCell, StatusBadge, isBundle, orderTitle } from "./ui";

const LIST_COLUMNS = "2rem 3rem minmax(0,1.6fr) 7.5rem minmax(0,1fr) 8.5rem 5.5rem";

type Data = ReturnType<typeof useReshipData>;

export function Dashboard({
  data,
  email,
  demoMode,
  onSignOut,
}: {
  data: Data;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
}) {
  const { orders, settings, saveOrders, patchOrders, deleteOrders, saveSettings, attachLabel, removeLabel, loadLabels } = data;

  const [activePlatforms, setActivePlatforms] = useState<Set<Platform>>(new Set());
  const [activeStatus, setActiveStatus] = useState<LabelStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [printOrders, setPrintOrders] = useState<Order[] | null>(null);
  const [buyFor, setBuyFor] = useState<Order[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [drawer, setDrawer] = useState<{ order: Order; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        const platformMatch = activePlatforms.size === 0 || activePlatforms.has(o.platform);
        const statusMatch = activeStatus === "all" || o.status === activeStatus;
        const q = search.toLowerCase();
        const searchMatch =
          !q ||
          o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)) ||
          o.buyer.toLowerCase().includes(q) ||
          o.orderId.toLowerCase().includes(q);
        return platformMatch && statusMatch && searchMatch;
      }),
    [orders, activePlatforms, activeStatus, search],
  );

  const pendingOrders = filteredOrders.filter((o) => o.status === "pending");
  const selectedPending = filteredOrders.filter((o) => selectedIds.has(o.id) && o.status === "pending");
  const sampleCount = orders.filter((o) => o.source === "sample").length;

  const toggleSelectAll = () => {
    const allIds = filteredOrders.map((o) => o.id);
    setSelectedIds(allIds.every((id) => selectedIds.has(id)) ? new Set() : new Set(allIds));
  };

  const updateItemSku = (order: Order, itemIndex: number, sku: string) =>
    saveOrders([{ ...order, items: order.items.map((item, i): OrderItem => (i === itemIndex ? { ...item, sku: sku || undefined } : item)) }]);

  // Combines the chosen orders' label PDFs (and packing slips) into one file and opens it to print.
  const handlePrintConfirm = async (ids: string[], opts: PrintOptions) => {
    const chosen = orders.filter((o) => ids.includes(o.id));
    // Open the tab right away, while the click still counts, so pop-up blockers allow it.
    const win = window.open("", "_blank");
    try {
      const labels = await loadLabels(chosen);
      const job = await buildPrintJob({ orders: chosen, labels, skuOnLabel: opts.skuOnLabel, packingSlip: opts.packingSlip, settings });
      if (job.pageCount === 0) {
        win?.close();
        setNotice({ text: "None of those orders has a label yet.", ok: false });
        return;
      }
      const url = URL.createObjectURL(new Blob([job.pdf], { type: "application/pdf" }));
      if (win) win.location.href = url;
      else window.location.assign(url);
      if (job.printedOrderIds.length) patchOrders(job.printedOrderIds, () => ({ status: "printed" }));
      const skipped = job.missingLabelIds.length + job.unreadableLabelIds.length;
      setNotice(
        job.unreadableLabelIds.length
          ? { text: `${job.unreadableLabelIds.length} label file${job.unreadableLabelIds.length !== 1 ? "s" : ""} couldn't be read. Try uploading ${job.unreadableLabelIds.length !== 1 ? "them" : "it"} again.`, ok: false }
          : { text: `Opened ${job.printedOrderIds.length} label${job.printedOrderIds.length !== 1 ? "s" : ""} to print${skipped ? `; ${skipped} order${skipped !== 1 ? "s" : ""} without a label stayed in To Print` : ""}.`, ok: true },
      );
      setSelectedIds(new Set());
    } catch (e) {
      win?.close();
      setNotice({ text: `Couldn't prepare the labels: ${e instanceof Error ? e.message : e}`, ok: false });
    }
  };

  const viewLabel = async (order: Order) => {
    const win = window.open("", "_blank");
    const blob = (await loadLabels([order])).get(order.id);
    if (!blob) {
      win?.close();
      setNotice({ text: "That label file couldn't be found. Try uploading it again.", ok: false });
      return;
    }
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    if (win) win.location.href = url;
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <Sidebar
        orders={orders}
        activeStatus={activeStatus}
        activePlatforms={activePlatforms}
        displayName={settings.displayName}
        subtitle={demoMode ? "Demo mode" : (email ?? "")}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onStatus={(s) => {
          setActiveStatus(s);
          setSidebarOpen(false);
        }}
        onTogglePlatform={(p) => setActivePlatforms((prev) => toggleIn(prev, p))}
        onClearFilters={() => {
          setActivePlatforms(new Set());
          setActiveStatus("all");
        }}
        onOpenAccount={() => setSettingsTab("account")}
        onOpenSettings={() => setSettingsTab("settings")}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {demoMode && (
          <div className="px-4 md:px-8 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
            Demo mode: orders are saved in this browser only.
          </div>
        )}
        {(notice || data.error) && (
          <div
            className={`px-4 md:px-8 py-2 border-b text-xs flex items-center gap-2 ${notice?.ok && !data.error ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{data.error ? `Couldn't save: ${data.error}` : notice?.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setNotice(null);
                data.clearError();
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="px-4 md:px-8 py-4 md:py-6 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">Shipping Labels</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setPrintOrders(selectedPending.length > 0 ? selectedPending : pendingOrders)}
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg bg-amber-400 text-amber-950 text-sm font-medium hover:bg-amber-300 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              {selectedPending.length > 0 ? `Print ${selectedPending.length} Selected` : "To Print"}
            </button>
          </div>
        </div>

        <div className="px-4 md:px-8 py-3 border-b border-border flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders, items, SKUs…"
              aria-label="Search orders"
              className="pl-9 pr-3 py-1.5 text-sm bg-muted rounded-md border border-transparent focus:border-[#B5607A] focus:outline-none transition-colors placeholder:text-muted-foreground w-full md:w-64"
            />
          </div>
          <button
            type="button"
            onClick={() => setDrawer({ order: blankOrder(settings.defaultCarrier), isNew: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
          >
            <Plus className="w-3.5 h-3.5" /> Add order
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
          >
            <FileUp className="w-3.5 h-3.5" /> Import CSV
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-0.5 border border-border rounded-md overflow-hidden">
              <button
                type="button"
                aria-label="List view"
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
          {data.loading ? (
            <p className="text-sm text-muted-foreground text-center py-20">Loading orders…</p>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No orders found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {orders.length === 0 ? "Add an order or import a CSV from your marketplace to get started" : "Try adjusting your filters"}
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="hidden md:grid bg-muted/40 border-b border-border px-4 py-2 gap-x-3" style={{ gridTemplateColumns: LIST_COLUMNS }}>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id))}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-rose-600"
                  />
                </div>
                <div />
                {["Item / Bundle", "Platform", "Buyer", "Carrier", "Status"].map((h) => (
                  <span key={h} className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {h}
                  </span>
                ))}
              </div>

              {filteredOrders.map((order) => {
                const isSelected = selectedIds.has(order.id);
                const bundle = isBundle(order);
                const expanded = expandedIds.has(order.id);
                const needsLabel = order.status === "pending" && !order.label;

                return (
                  <div key={order.id} className={`border-b border-border last:border-0 ${isSelected ? "bg-rose-50/50" : ""}`}>
                    <div
                      className="grid items-center px-3 md:px-4 py-2.5 gap-x-3 hover:bg-muted/20 transition-colors grid-cols-[1.5rem_2.5rem_1fr_auto] md:[grid-template-columns:var(--cols)]"
                      style={{ "--cols": LIST_COLUMNS } as React.CSSProperties}
                    >
                      <div>
                        <input
                          type="checkbox"
                          aria-label={`Select order ${order.orderId}`}
                          checked={isSelected}
                          onChange={() => setSelectedIds((prev) => toggleIn(prev, order.id))}
                          className="w-3.5 h-3.5 rounded accent-rose-600"
                        />
                      </div>
                      <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0">
                        <PhotoCollage photos={order.items.map((i) => i.photo)} size="sm" />
                      </div>
                      <div className="min-w-0">
                        {bundle && (
                          <div className="mb-0.5">
                            <BundleBadge count={order.items.length} />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setDrawer({ order, isNew: false })}
                          className="block max-w-full text-left text-sm text-foreground truncate hover:text-[#B5607A] hover:underline"
                        >
                          {orderTitle(order)}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="font-mono text-[11px] text-muted-foreground">{order.orderId}</p>
                          <span className="md:hidden">
                            <PlatformBadge platform={order.platform} />
                          </span>
                          {!bundle && <SkuCell sku={order.items[0]?.sku} onSave={(val) => updateItemSku(order, 0, val)} />}
                          {bundle && (
                            <button
                              type="button"
                              onClick={() => setExpandedIds((prev) => toggleIn(prev, order.id))}
                              className="inline-flex items-center gap-0.5 text-[11px] text-[#B5607A] hover:underline"
                            >
                              {expanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  Hide items
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  Show items
                                </>
                              )}
                            </button>
                          )}
                          {needsLabel && (
                            <button
                              type="button"
                              onClick={() => setDrawer({ order, isNew: false })}
                              className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 hover:underline"
                            >
                              <Upload className="w-3 h-3" />
                              No label yet
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <PlatformBadge platform={order.platform} />
                      </div>
                      <div className="hidden md:block min-w-0">
                        <p className="text-sm text-muted-foreground truncate">@{order.buyer}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">{order.carrier}</p>
                      </div>
                      <div>
                        <StatusBadge status={order.status} />
                      </div>
                    </div>

                    {bundle && expanded && (
                      <div className="bg-muted/30 border-t border-border divide-y divide-border">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 py-2 pl-4 pr-2">
                            <div className="w-7 h-7 rounded overflow-hidden bg-muted shrink-0">
                              <PhotoCollage photos={[item.photo]} size="sm" />
                            </div>
                            <p className="text-xs text-foreground flex-1 truncate">{item.name}</p>
                            <div className="shrink-0">
                              <SkuCell sku={item.sku} onSave={(val) => updateItemSku(order, i, val)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {filteredOrders.map((order) => {
                const isSelected = selectedIds.has(order.id);
                const bundle = isBundle(order);
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedIds((prev) => toggleIn(prev, order.id))}
                    className={`bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? "border-[#B5607A] ring-1 ring-[#B5607A]/30" : "border-border"}`}
                  >
                    <div className="relative h-44 bg-muted overflow-hidden">
                      <PhotoCollage photos={order.items.map((i) => i.photo)} size="lg" />
                      <div className="absolute top-2.5 right-2.5 bg-card/90 rounded px-1.5 py-0.5">
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
                        <PlatformBadge platform={order.platform} />
                        {bundle && <BundleBadge count={order.items.length} />}
                      </div>
                    </div>

                    <div className="p-3.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawer({ order, isNew: false });
                        }}
                        className="text-left text-sm font-medium text-foreground leading-snug mb-1 hover:text-[#B5607A] hover:underline"
                      >
                        {orderTitle(order)}
                      </button>
                      <p className="font-mono text-[11px] text-muted-foreground mb-2">
                        {order.orderId} · @{order.buyer}
                      </p>

                      {bundle ? (
                        <div className="mb-3 space-y-1.5 border border-border rounded-md p-2 bg-muted/30">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                                <PhotoCollage photos={[item.photo]} size="sm" />
                              </div>
                              <p className="text-[11px] text-foreground truncate flex-1">{item.name}</p>
                              <SkuCell sku={item.sku} onSave={(val) => updateItemSku(order, i, val)} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                          <SkuCell sku={order.items[0]?.sku} onSave={(val) => updateItemSku(order, 0, val)} />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">{order.carrier}</span>
                        {order.status === "pending" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrintOrders([order]);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#B5607A] text-white text-xs font-medium hover:bg-[#9E4D6A] transition-colors"
                          >
                            <Printer className="w-3 h-3" />
                            Print
                          </button>
                        ) : order.tracking ? (
                          <a
                            href={trackingUrl(order.carrier, order.tracking)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-[#B5607A] hover:underline"
                          >
                            Track <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {printOrders && <PrintModal orders={printOrders} onClose={() => setPrintOrders(null)} onConfirm={handlePrintConfirm} />}

      {buyFor && (
        <BuyLabelsModal
          orders={buyFor}
          hasShipFrom={isAddressComplete(settings.shipFrom)}
          onClose={() => setBuyFor(null)}
          onSaveParcels={(rows) =>
            saveOrders(
              rows.map((r) => {
                const o = orders.find((x) => x.id === r.id)!;
                return { ...o, parcel: r.parcel, carrier: r.carrier };
              }),
            )
          }
        />
      )}

      {importOpen && (
        <ImportCsvModal
          existing={orders}
          defaultCarrier={settings.defaultCarrier}
          onClose={() => setImportOpen(false)}
          onImport={(imported) => {
            saveOrders(imported);
            setNotice({ text: `Imported ${imported.length} order${imported.length !== 1 ? "s" : ""}.`, ok: true });
          }}
        />
      )}

      {drawer && (
        <OrderDrawer
          key={drawer.order.id}
          order={drawer.order}
          isNew={drawer.isNew}
          onClose={() => setDrawer(null)}
          onSave={(o, label) => {
            saveOrders([o]);
            if (label.file) attachLabel(o, label.file);
            else if (label.remove) removeLabel(o);
            setDrawer(null);
          }}
          onViewLabel={viewLabel}
          onBuyLabel={(o) => {
            setDrawer(null);
            setBuyFor([o]);
          }}
          onDelete={(id) => {
            deleteOrders([id]);
            setDrawer(null);
          }}
        />
      )}

      {settingsTab && (
        <SettingsModal
          defaultTab={settingsTab}
          settings={settings}
          email={email}
          demoMode={demoMode}
          sampleCount={sampleCount}
          onClose={() => setSettingsTab(null)}
          onSave={saveSettings}
          onSignOut={onSignOut}
          onClearSamples={() => deleteOrders(orders.filter((o) => o.source === "sample").map((o) => o.id))}
        />
      )}
    </div>
  );
}
