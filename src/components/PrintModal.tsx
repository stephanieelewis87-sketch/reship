import { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Printer, Tag } from "lucide-react";
import type { Order, PrintOptions } from "@/lib/types";
import { BundleBadge, Modal, ModalHeader, PhotoCollage, PlatformBadge, SectionLabel, Toggle, isBundle, primaryButton, secondaryButton } from "./ui";

// The options chosen here become the defaults for one-click printing.
export function PrintModal({
  orders,
  defaults,
  onClose,
  onConfirm,
}: {
  orders: Order[];
  defaults: PrintOptions;
  onClose: () => void;
  onConfirm: (ids: string[], opts: PrintOptions) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(orders.map((o) => o.id)));
  const [opts, setOpts] = useState<PrintOptions>(defaults);
  const reprint = orders.length > 0 && orders.every((o) => o.status !== "pending");

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const selectedHasSku = selectedOrders.some((o) => o.items.some((i) => i.sku));
  const withoutLabel = selectedOrders.filter((o) => !o.label).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal onClose={onClose} label="Print labels">
      <ModalHeader title={reprint ? "Reprint Labels" : "Print Labels"} subtitle={`${selected.size} of ${orders.length} selected`} onClose={onClose} />

      {orders.length === 0 ? (
        <p className="px-6 py-8 text-sm text-muted-foreground text-center">Nothing is waiting to print.</p>
      ) : (
        <div className="divide-y divide-border max-h-56 overflow-y-auto">
          {orders.map((order) => (
            <label key={order.id} className="flex items-center gap-3 px-5 sm:px-6 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={selected.has(order.id)}
                onChange={() => toggle(order.id)}
                className="w-4 h-4 rounded border-border accent-rose-600 shrink-0"
              />
              <div className="shrink-0">
                <PhotoCollage photos={order.items.map((i) => i.photo)} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <PlatformBadge platform={order.platform} />
                  {isBundle(order) && <BundleBadge count={order.items.length} />}
                  <span className="font-mono text-[11px] text-muted-foreground">{order.orderId}</span>
                </div>
                <p className="text-sm text-foreground truncate">{isBundle(order) ? `Bundle · ${order.items.length} items` : order.items[0]?.name}</p>
                {order.label ? (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Label ready
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3" /> No label uploaded yet
                  </p>
                )}
              </div>
              <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap shrink-0">{order.carrier}</span>
            </label>
          ))}
        </div>
      )}

      <div className="border-t border-border px-5 sm:px-6 py-4 flex flex-col gap-3">
        <SectionLabel>Print options</SectionLabel>
        <div className={`flex items-center justify-between gap-3 ${!selectedHasSku ? "opacity-40" : ""}`}>
          <div className="flex items-center gap-2.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground leading-none">Include SKU on label</p>
              {!selectedHasSku && <p className="text-[11px] text-muted-foreground mt-0.5">No SKU on selected orders</p>}
            </div>
          </div>
          <Toggle
            label="Include SKU on label"
            checked={opts.skuOnLabel && selectedHasSku}
            onChange={() => selectedHasSku && setOpts((o) => ({ ...o, skuOnLabel: !o.skuOnLabel }))}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground leading-none">Print packing slip</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Separate page per order. Poshmark labels already include theirs.</p>
            </div>
          </div>
          <Toggle label="Print packing slip" checked={opts.packingSlip} onChange={() => setOpts((o) => ({ ...o, packingSlip: !o.packingSlip }))} />
        </div>
        {withoutLabel > 0 && (
          <p className="text-[11px] text-amber-800 bg-amber-50 rounded-md px-2.5 py-1.5">
            {withoutLabel} selected order{withoutLabel !== 1 ? "s have" : " has"} no marketplace label yet.
            {opts.packingSlip ? " Their packing slips will print, and they'll stay in To Print." : " They'll stay in To Print."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 px-5 sm:px-6 pb-4">
        <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            await onConfirm(Array.from(selected), opts);
            setBusy(false);
            onClose();
          }}
          disabled={selected.size === 0 || busy || (withoutLabel === selected.size && !opts.packingSlip)}
          className={`flex-1 ${primaryButton}`}
        >
          <Printer className="w-3.5 h-3.5" />
          {busy ? "Preparing…" : `${reprint ? "Reprint" : "Print"} ${selected.size - withoutLabel} Label${selected.size - withoutLabel !== 1 ? "s" : ""}`}
          {opts.packingSlip && selected.size > 0 && <span className="text-white/70 text-xs">+ slips</span>}
        </button>
      </div>
    </Modal>
  );
}
