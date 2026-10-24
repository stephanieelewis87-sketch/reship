import { useState } from "react";
import { FileText, Printer, Tag } from "lucide-react";
import type { Order, PrintOptions } from "@/lib/types";
import { BundleBadge, Modal, ModalHeader, PhotoCollage, PlatformBadge, SectionLabel, Toggle, isBundle, primaryButton, secondaryButton } from "./ui";

export function PrintModal({
  orders,
  onClose,
  onConfirm,
}: {
  orders: Order[];
  onClose: () => void;
  onConfirm: (ids: string[], opts: PrintOptions) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(orders.map((o) => o.id)));
  const [opts, setOpts] = useState<PrintOptions>({ skuOnLabel: false, packingSlip: true });

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const selectedHasSku = selectedOrders.some((o) => o.items.some((i) => i.sku));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal onClose={onClose} label="Print labels">
      <ModalHeader title="Print Labels" subtitle={`${selected.size} of ${orders.length} selected`} onClose={onClose} />

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
              <p className="text-[11px] text-muted-foreground mt-0.5">Separate page per order</p>
            </div>
          </div>
          <Toggle label="Print packing slip" checked={opts.packingSlip} onChange={() => setOpts((o) => ({ ...o, packingSlip: !o.packingSlip }))} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Shipping labels themselves print once label buying is connected. For now this marks orders as printed and prints packing slips.
        </p>
      </div>

      <div className="flex items-center gap-2 px-5 sm:px-6 pb-4">
        <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm(Array.from(selected), opts);
            onClose();
          }}
          disabled={selected.size === 0}
          className={`flex-1 ${primaryButton}`}
        >
          <Printer className="w-3.5 h-3.5" />
          Print {selected.size} Label{selected.size !== 1 ? "s" : ""}
          {opts.packingSlip && selected.size > 0 && <span className="text-white/70 text-xs">+ slips</span>}
        </button>
      </div>
    </Modal>
  );
}
