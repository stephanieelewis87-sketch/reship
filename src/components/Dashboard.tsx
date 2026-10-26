import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, FileUp, LayoutGrid, List, Menu, Plus, Printer, RotateCcw, Search, Truck, X } from "lucide-react";
import type { Order, OrderItem, Platform, PrintOptions } from "@/lib/types";
import { isAddressComplete } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { buildPrintJob } from "@/lib/printJob";
import { summarize } from "@/lib/orderStatus";
import { Sidebar, type View } from "./Sidebar";
import { PrintModal } from "./PrintModal";
import { BuyLabelsModal } from "./BuyLabelsModal";
import { OrderDrawer, blankOrder } from "./OrderDrawer";
import { ImportCsvModal } from "./ImportCsvModal";
import { SettingsModal, type SettingsTab } from "./SettingsModal";
import { OrderList } from "./OrderList";
import { orderTitle } from "./ui";
import { WithdrawShortcuts } from "./WithdrawShortcuts";

type Data = ReturnType<typeof useReshipData>;

const RECENT_PRINTED = 5;
const VIEW_TITLE: Record<View, string> = { home: "Home", pending: "To Print", printed: "Printed", shipped: "Shipped", all: "All orders" };
const byPrintedAt = (a: Order, b: Order) => (b.printedAt ?? b.date).localeCompare(a.printedAt ?? a.date);

function StatCard({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left bg-card border border-border rounded-xl px-4 py-3 hover:border-[#B5607A]/40 hover:shadow-sm transition-all">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </button>
  );
}

export function Dashboard({
  data,
  email,
  demoMode,
  onSignOut,
  onResetDemo,
}: {
  data: Data;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
  onResetDemo?: () => void;
}) {
  const { orders, settings, saveOrders, patchOrders, deleteOrders, saveSettings, attachLabel, removeLabel, loadLabels } = data;

  const [view, setView] = useState<View>("home");
  const [activePlatforms, setActivePlatforms] = useState<Set<Platform>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [printOrders, setPrintOrders] = useState<Order[] | null>(null);
  const [printing, setPrinting] = useState(false);
  const [buyFor, setBuyFor] = useState<Order[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [drawer, setDrawer] = useState<{ order: Order; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const printDefaults: PrintOptions = { skuOnLabel: settings.printSkuOnLabel, packingSlip: settings.printPackingSlip, qrCodes: settings.printQrCodes };

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  // Platform and search filters apply everywhere; the view picks the status.
  const matching = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        (activePlatforms.size === 0 || activePlatforms.has(o.platform)) &&
        (!q ||
          o.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)) ||
          o.buyer.toLowerCase().includes(q) ||
          o.orderId.toLowerCase().includes(q)),
    );
  }, [orders, activePlatforms, search]);

  const toPrint = matching.filter((o) => o.status === "pending");
  const recentPrinted = matching.filter((o) => o.status === "printed").sort(byPrintedAt);
  const listed =
    view === "home" ? toPrint : view === "all" ? matching : view === "printed" ? recentPrinted : matching.filter((o) => o.status === view);
  const summary = useMemo(() => summarize(orders), [orders]);
  const selected = listed.filter((o) => selectedIds.has(o.id));
  const selectedPending = selected.filter((o) => o.status === "pending");
  const selectedReprint = selected.filter((o) => o.status !== "pending" && o.label);
  const sampleCount = orders.filter((o) => o.source === "sample").length;

  const goTo = (v: View) => {
    setView(v);
    setSelectedIds(new Set());
    setSidebarOpen(false);
  };

  const updateItemSku = (order: Order, itemIndex: number, sku: string) =>
    saveOrders([{ ...order, items: order.items.map((item, i): OrderItem => (i === itemIndex ? { ...item, sku: sku || undefined } : item)) }]);

  // Combines the orders' label PDFs (and packing slips) into one file and opens it to print.
  // First prints move orders from To Print to Printed; reprints leave the status alone.
  const print = async (chosen: Order[], opts: PrintOptions) => {
    if (!chosen.length) return;
    // Open the tab right away, while the click still counts, so pop-up blockers allow it.
    const win = window.open("", "_blank");
    setPrinting(true);
    try {
      const labels = await loadLabels(chosen);
      const job = await buildPrintJob({ orders: chosen, labels, skuOnLabel: opts.skuOnLabel, packingSlip: opts.packingSlip, qrCodes: opts.qrCodes, settings });
      if (job.pageCount === 0) {
        win?.close();
        setNotice({ text: "None of those orders has a label yet.", ok: false });
        return;
      }
      const url = URL.createObjectURL(new Blob([job.pdf], { type: "application/pdf" }));
      if (win) win.location.href = url;
      else window.location.assign(url);
      const now = new Date().toISOString();
      if (job.printedOrderIds.length)
        patchOrders(job.printedOrderIds, (o) => ({ status: o.status === "pending" ? "printed" : o.status, printedAt: now }));
      const skipped = job.missingLabelIds.length + job.unreadableLabelIds.length;
      const verb = chosen.every((o) => o.status !== "pending") ? "Reprinting" : "Opened";
      setNotice(
        job.unreadableLabelIds.length
          ? { text: `${job.unreadableLabelIds.length} label file${job.unreadableLabelIds.length !== 1 ? "s" : ""} couldn't be read. Try uploading ${job.unreadableLabelIds.length !== 1 ? "them" : "it"} again.`, ok: false }
          : { text: `${verb} ${job.printedOrderIds.length} label${job.printedOrderIds.length !== 1 ? "s" : ""}${skipped ? `; ${skipped} order${skipped !== 1 ? "s" : ""} without a label stayed in To Print` : ""}.`, ok: true },
      );
      setSelectedIds(new Set());
    } catch (e) {
      win?.close();
      setNotice({ text: `Couldn't prepare the labels: ${e instanceof Error ? e.message : e}`, ok: false });
    } finally {
      setPrinting(false);
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
  const allToPrint = orders.filter((o) => o.status === "pending");
  const readyToPrint = allToPrint.filter((o) => o.label).length;
  // Some marketplaces (Mercari) also offer a drop-off QR code, so the seller can skip the printer label.
  const qrReady = allToPrint.filter((o) => o.label?.qrCode).length;
  const printNoun = settings.printQrCodes && qrReady === readyToPrint ? "QR code" : "label";
  const qrToggle = qrReady > 0 && (
    <div role="group" aria-label="What to print" className="flex rounded-lg border border-border p-0.5 text-xs">
      {([false, true] as const).map((qr) => (
        <button
          key={String(qr)}
          type="button"
          aria-pressed={settings.printQrCodes === qr}
          onClick={() => saveSettings({ ...settings, printQrCodes: qr })}
          className={`px-2.5 py-1.5 rounded-md ${settings.printQrCodes === qr ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          title={qr ? `Print the drop-off QR code for the ${qrReady} order${qrReady !== 1 ? "s" : ""} that have one` : "Print shipping labels"}
        >
          {qr ? "QR codes" : "Labels"}
        </button>
      ))}
    </div>
  );

  // The one button that matters: print everything waiting, with the saved options.
  const printButton =
    selectedReprint.length > 0 ? (
      <button
        type="button"
        disabled={printing}
        onClick={() => print(selectedReprint, printDefaults)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        <RotateCcw className="w-4 h-4" /> Reprint {selectedReprint.length} selected
      </button>
    ) : selectedPending.length > 0 ? (
      <button
        type="button"
        disabled={printing}
        onClick={() => print(selectedPending, printDefaults)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400 text-amber-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-50"
      >
        <Printer className="w-4 h-4" /> Print {selectedPending.length} selected
      </button>
    ) : allToPrint.length > 0 ? (
      <button
        type="button"
        disabled={printing}
        onClick={() => print(allToPrint, printDefaults)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-400 text-amber-950 text-sm font-semibold hover:bg-amber-300 shadow-sm disabled:opacity-50"
      >
        <Printer className="w-4 h-4" />
        {printing ? "Preparing…" : `Print all ${readyToPrint} ${printNoun}${readyToPrint !== 1 ? "s" : ""}`}
      </button>
    ) : (
      <span className="flex items-center gap-1.5 text-sm text-emerald-700">
        <CheckCircle2 className="w-4 h-4" /> All caught up
      </span>
    );

  const listBody = (rows: Order[], empty: string) =>
    rows.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-border rounded-xl">
        <CheckCircle2 className="w-7 h-7 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    ) : (
      <OrderList
        orders={rows}
        viewMode={viewMode}
        selectedIds={selectedIds}
        onToggle={(id) => setSelectedIds((prev) => toggleIn(prev, id))}
        onToggleAll={(ids) => setSelectedIds(ids.every((id) => selectedIds.has(id)) ? new Set() : new Set(ids))}
        onOpen={(order) => setDrawer({ order, isNew: false })}
        onSku={updateItemSku}
        onPrint={(order) => print([order], printDefaults)}
      />
    );

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <Sidebar
        orders={orders}
        activeStatus={view}
        activePlatforms={activePlatforms}
        displayName={settings.displayName}
        subtitle={demoMode ? "Demo mode" : (email ?? "")}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onStatus={goTo}
        onTogglePlatform={(p) => setActivePlatforms((prev) => toggleIn(prev, p))}
        onClearFilters={() => setActivePlatforms(new Set())}
        onOpenAccount={() => setSettingsTab("account")}
        onOpenSettings={() => setSettingsTab("settings")}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {demoMode && (
          <div className="px-4 md:px-8 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-3">
            <span className="flex-1">Demo mode: sample orders, saved in this browser only.</span>
            {onResetDemo && (
              <button type="button" onClick={onResetDemo} className="underline hover:no-underline">
                Reset demo
              </button>
            )}
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

        <div className="px-4 md:px-8 py-4 md:py-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="md:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">{VIEW_TITLE[view]}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {(view === "home" || view === "pending") && allToPrint.length > 0 && selected.length === 0 && (
              <button type="button" onClick={() => setPrintOrders(allToPrint)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                Choose labels & options
              </button>
            )}
            {qrToggle}
            {printButton}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === "home" && (
            <section className="px-4 md:px-8 pt-5 space-y-3">
              {summary.late.length > 0 && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-900">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="text-sm flex-1 min-w-0">
                    <p className="font-medium">
                      {summary.late.length} order{summary.late.length !== 1 ? "s are" : " is"} late to ship
                    </p>
                    <p className="text-xs mt-0.5 truncate">
                      {summary.late
                        .slice(0, 3)
                        .map((o) => `${orderTitle(o)} (${o.platform})`)
                        .join(" · ")}
                      {summary.late.length > 3 ? ` and ${summary.late.length - 3} more` : ""}. Marketplaces expect shipping within 3 business days.
                    </p>
                  </div>
                </div>
              )}
              {summary.late.length === 0 && summary.due.length > 0 && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {summary.due.length} order{summary.due.length !== 1 ? "s" : ""} should ship today.
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="To print" value={summary.toPrint} hint={`${readyToPrint} label${readyToPrint !== 1 ? "s" : ""} ready`} tone="text-amber-600" onClick={() => goTo("pending")} />
                <StatCard label="Printed" value={summary.printed} hint="Waiting for drop-off" tone="text-violet-600" onClick={() => goTo("printed")} />
                <StatCard label="In transit" value={summary.inTransit} hint="On the way to buyers" tone="text-sky-600" onClick={() => goTo("shipped")} />
                <StatCard label="Delivered" value={summary.delivered} hint="Arrived" tone="text-emerald-600" onClick={() => goTo("shipped")} />
              </div>
              <WithdrawShortcuts platforms={[...new Set(orders.map((o) => o.platform))]} />
            </section>
          )}

          <div className="px-4 md:px-8 py-3 mt-2 flex items-center gap-2 md:gap-3 flex-wrap">
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
                {listed.length} order{listed.length !== 1 ? "s" : ""}
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

          <div className="px-4 md:px-8 pb-8 space-y-6">
            {data.loading ? (
              <p className="text-sm text-muted-foreground text-center py-20">Loading orders…</p>
            ) : view === "home" ? (
              <>
                <section>
                  <h2 className="font-display text-sm font-semibold text-foreground mb-2">To Print</h2>
                  {listBody(toPrint, orders.length === 0 ? "No orders yet. Sync a marketplace, add an order or import a CSV." : "Nothing waiting to print.")}
                </section>
                {recentPrinted.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-display text-sm font-semibold text-muted-foreground">Recently printed</h2>
                      <button type="button" onClick={() => goTo("printed")} className="flex items-center gap-1 text-xs text-[#B5607A] hover:underline">
                        See all printed <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="opacity-90">{listBody(recentPrinted.slice(0, RECENT_PRINTED), "")}</div>
                  </section>
                )}
              </>
            ) : (
              listBody(
                listed,
                view === "printed" ? "No printed labels waiting to ship." : view === "shipped" ? "Nothing shipped yet." : view === "pending" ? "Nothing waiting to print." : "No orders found.",
              )
            )}
            {view === "shipped" && listed.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Truck className="w-3 h-3" /> Shipping status comes from the marketplace each time the Reship extension syncs.
              </p>
            )}
          </div>
        </div>
      </main>

      {printOrders && (
        <PrintModal
          orders={printOrders}
          defaults={printDefaults}
          onClose={() => setPrintOrders(null)}
          onConfirm={async (ids, opts) => {
            if (opts.skuOnLabel !== settings.printSkuOnLabel || opts.packingSlip !== settings.printPackingSlip || opts.qrCodes !== settings.printQrCodes)
              saveSettings({ ...settings, printSkuOnLabel: opts.skuOnLabel, printPackingSlip: opts.packingSlip, printQrCodes: opts.qrCodes });
            await print(
              orders.filter((o) => ids.includes(o.id)),
              opts,
            );
          }}
        />
      )}

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
