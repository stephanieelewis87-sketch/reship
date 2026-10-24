import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Printer, RotateCcw, Upload } from "lucide-react";
import type { Order } from "@/lib/types";
import { trackingUrl } from "@/lib/tracking";
import { BundleBadge, OrderStatusCell, PhotoCollage, PlatformBadge, SkuCell, isBundle, orderTitle } from "./ui";

const LIST_COLUMNS = "2rem 3rem minmax(0,1.6fr) 7.5rem minmax(0,1fr) 7.5rem 6.5rem 8rem";

export interface OrderListProps {
  orders: Order[];
  viewMode: "list" | "grid";
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onOpen: (order: Order) => void;
  onSku: (order: Order, itemIndex: number, sku: string) => void;
  // Prints one order: its first print from To Print, or a reprint afterwards.
  onPrint: (order: Order) => void;
}

// The print, reprint or tracking action for one order.
function RowAction({ order, onPrint }: { order: Order; onPrint: (o: Order) => void }) {
  if (order.status === "pending")
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrint(order);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#B5607A] text-white text-[11px] font-medium hover:bg-[#9E4D6A]"
      >
        <Printer className="w-3 h-3" /> Print
      </button>
    );
  return (
    <div className="flex items-center gap-2">
      {order.label && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrint(order);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] font-medium text-foreground hover:bg-muted"
          title="Print this label again"
        >
          <RotateCcw className="w-3 h-3" /> Reprint
        </button>
      )}
      {order.tracking && (
        <a
          href={trackingUrl(order.carrier, order.tracking)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-[11px] text-[#B5607A] hover:underline"
        >
          Track <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

export function OrderList({ orders, viewMode, selectedIds, onToggle, onToggleAll, onOpen, onSku, onPrint }: OrderListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (viewMode === "grid")
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {orders.map((order) => {
          const isSelected = selectedIds.has(order.id);
          const bundle = isBundle(order);
          return (
            <div
              key={order.id}
              onClick={() => onToggle(order.id)}
              className={`bg-card border rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? "border-[#B5607A] ring-1 ring-[#B5607A]/30" : "border-border"}`}
            >
              <div className="relative h-44 bg-muted overflow-hidden">
                <PhotoCollage photos={order.items.map((i) => i.photo)} size="lg" />
                <div className="absolute top-2.5 right-2.5 bg-card/90 rounded px-1.5 py-0.5">
                  <OrderStatusCell order={order} />
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
                    onOpen(order);
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
                        <SkuCell sku={item.sku} onSave={(val) => onSku(order, i, val)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                    <SkuCell sku={order.items[0]?.sku} onSave={(val) => onSku(order, 0, val)} />
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">{order.carrier}</span>
                  <RowAction order={order} onPrint={onPrint} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <div className="hidden md:grid bg-muted/40 border-b border-border px-4 py-2 gap-x-3" style={{ gridTemplateColumns: LIST_COLUMNS }}>
        <div className="flex items-center">
          <input
            type="checkbox"
            aria-label="Select all"
            checked={orders.length > 0 && orders.every((o) => selectedIds.has(o.id))}
            onChange={() => onToggleAll(orders.map((o) => o.id))}
            className="w-3.5 h-3.5 rounded accent-rose-600"
          />
        </div>
        <div />
        {["Item / Bundle", "Platform", "Buyer", "Carrier", "Status", ""].map((h, i) => (
          <span key={i} className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {h}
          </span>
        ))}
      </div>

      {orders.map((order) => {
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
                  onChange={() => onToggle(order.id)}
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
                  onClick={() => onOpen(order)}
                  className="block max-w-full text-left text-sm text-foreground truncate hover:text-[#B5607A] hover:underline"
                >
                  {orderTitle(order)}
                </button>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="font-mono text-[11px] text-muted-foreground">{order.orderId}</p>
                  <span className="md:hidden">
                    <PlatformBadge platform={order.platform} />
                  </span>
                  {!bundle && <SkuCell sku={order.items[0]?.sku} onSave={(val) => onSku(order, 0, val)} />}
                  {bundle && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(order.id)}
                      className="inline-flex items-center gap-0.5 text-[11px] text-[#B5607A] hover:underline"
                    >
                      {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {expanded ? "Hide items" : "Show items"}
                    </button>
                  )}
                  {needsLabel && (
                    <button type="button" onClick={() => onOpen(order)} className="inline-flex items-center gap-0.5 text-[11px] text-amber-700 hover:underline">
                      <Upload className="w-3 h-3" />
                      No label yet
                    </button>
                  )}
                  <span className="md:hidden">
                    <RowAction order={order} onPrint={onPrint} />
                  </span>
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
                <OrderStatusCell order={order} />
              </div>
              <div className="hidden md:block">
                <RowAction order={order} onPrint={onPrint} />
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
                      <SkuCell sku={item.sku} onSave={(val) => onSku(order, i, val)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
