import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { CheckCircle2, Clock, Layers, Package, Tag, Truck, X } from "lucide-react";
import type { LabelStatus, Order, Platform } from "@/lib/types";
import { SHIPMENT_LABEL, shipUrgency } from "@/lib/orderStatus";

export const ACCENT = "#B5607A";

export const PLATFORM_CONFIG: Record<Platform, { color: string; bg: string; domain?: string }> = {
  Poshmark: { color: "text-rose-700", bg: "bg-rose-50", domain: "poshmark.com" },
  Vinted: { color: "text-teal-700", bg: "bg-teal-50", domain: "vinted.com" },
  Depop: { color: "text-red-700", bg: "bg-red-50", domain: "depop.com" },
  Mercari: { color: "text-blue-700", bg: "bg-blue-50", domain: "mercari.com" },
  WhatNot: { color: "text-purple-700", bg: "bg-purple-50", domain: "whatnot.com" },
  Etsy: { color: "text-orange-700", bg: "bg-orange-50", domain: "etsy.com" },
  eBay: { color: "text-yellow-800", bg: "bg-yellow-50", domain: "ebay.com" },
  Other: { color: "text-stone-700", bg: "bg-stone-100" },
};

export const STATUS_CONFIG: Record<LabelStatus, { label: string; textColor: string; dot: string; icon: ComponentType<{ className?: string }> }> = {
  pending: { label: "To Print", textColor: "text-amber-600", dot: "bg-amber-400", icon: Clock },
  printed: { label: "Printed", textColor: "text-violet-600", dot: "bg-violet-400", icon: CheckCircle2 },
  shipped: { label: "Shipped", textColor: "text-emerald-600", dot: "bg-emerald-400", icon: Truck },
};

export const isBundle = (o: Order) => o.items.length > 1;
export const orderTitle = (o: Order) =>
  isBundle(o) ? `${o.items[0].name} + ${o.items.length - 1} more` : (o.items[0]?.name ?? "");

export function PlatformIcon({ platform, className = "w-3 h-3" }: { platform: Platform; className?: string }) {
  const domain = PLATFORM_CONFIG[platform].domain;
  if (!domain) return <Package className={`${className} text-muted-foreground`} />;
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" className={`${className} rounded-sm`} />;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${checked ? "bg-[#B5607A]" : "bg-[#C8BAC0]"}`}
      style={{ width: "2rem", height: "1.125rem" }}
    >
      <span
        className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-3.5" : "translate-x-0"}`}
        style={{ width: "0.875rem", height: "0.875rem" }}
      />
    </button>
  );
}

export function SkuCell({ sku, onSave }: { sku?: string; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sku || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onSave(draft.trim());
  };

  if (editing)
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(sku || "");
            setEditing(false);
          }
        }}
        className="w-full font-mono text-[11px] px-1.5 py-0.5 rounded border border-[#B5607A] bg-background text-foreground focus:outline-none"
        placeholder="e.g. LV-JEAN-28"
      />
    );

  if (sku)
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(sku);
          setEditing(true);
        }}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
        title="Click to edit SKU"
      >
        <Tag className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
        {sku}
      </button>
    );

  return (
    <button
      type="button"
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
      className="text-[11px] text-muted-foreground/50 hover:text-[#B5607A] transition-colors"
      title="Add SKU"
    >
      + SKU
    </button>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  const cfg = PLATFORM_CONFIG[platform];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <PlatformIcon platform={platform} />
      {platform}
    </span>
  );
}

export function StatusBadge({ status }: { status: LabelStatus }) {
  const { label, textColor, dot } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

// Status plus what matters next: the ship-by warning before shipping, the carrier status after.
export function OrderStatusCell({ order }: { order: Order }) {
  const urgency = shipUrgency(order);
  const shipment = order.shipment && order.shipment.status !== "label_created" ? SHIPMENT_LABEL[order.shipment.status] : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      {shipment ? (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${order.shipment?.status === "delivered" ? "text-emerald-700" : order.shipment?.status === "cancelled" ? "text-stone-500" : "text-sky-700"}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${order.shipment?.status === "delivered" ? "bg-emerald-500" : order.shipment?.status === "cancelled" ? "bg-stone-400" : "bg-sky-500"}`} />
          {shipment}
        </span>
      ) : (
        <StatusBadge status={order.status} />
      )}
      {urgency !== "ok" && (
        <span className={`text-[10px] font-medium ${urgency === "late" ? "text-rose-700" : "text-amber-700"}`}>{urgency === "late" ? "Late to ship" : "Ship today"}</span>
      )}
    </div>
  );
}

export function BundleBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700">
      <Layers className="w-3 h-3" />
      Bundle · {count} items
    </span>
  );
}

function Photo({ src, className }: { src?: string; className: string }) {
  if (!src)
    return (
      <div className={`${className} bg-muted flex items-center justify-center`}>
        <Package className="w-1/3 h-1/3 max-w-8 max-h-8 text-muted-foreground/60" />
      </div>
    );
  return <img src={src} alt="" className={`${className} object-cover`} />;
}

export function PhotoCollage({ photos, size = "sm" }: { photos: (string | undefined)[]; size?: "sm" | "lg" }) {
  if (photos.length <= 1) {
    return <Photo src={photos[0]} className={size === "sm" ? "w-9 h-9 rounded-md" : "w-full h-full"} />;
  }
  const shown = photos.slice(0, 4);
  if (size === "sm") {
    return (
      <div className="w-9 h-9 grid grid-cols-2 gap-px rounded-md overflow-hidden bg-border">
        {shown.map((p, i) => (
          <Photo key={i} src={p} className="w-full h-full" />
        ))}
      </div>
    );
  }
  if (shown.length === 3)
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
        <Photo src={shown[0]} className="w-full h-full row-span-2" />
        <Photo src={shown[1]} className="w-full h-full" />
        <Photo src={shown[2]} className="w-full h-full" />
      </div>
    );
  return (
    <div className={`w-full h-full grid grid-cols-2 gap-0.5 ${shown.length === 4 ? "grid-rows-2" : ""}`}>
      {shown.map((p, i) => (
        <Photo key={i} src={p} className="w-full h-full" />
      ))}
    </div>
  );
}

export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground ${className}`}>{children}</p>;
}

export function Modal({
  children,
  onClose,
  maxWidth = "max-w-md",
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
  label: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`bg-card rounded-t-xl sm:rounded-xl border border-border shadow-2xl w-full ${maxWidth} sm:mx-4 overflow-hidden flex flex-col max-h-[92vh]`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, subtitle, onClose, icon }: { title: string; subtitle?: ReactNode; onClose: () => void; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted transition-colors">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}

export const inputClass =
  "w-full text-sm px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:border-[#B5607A] focus:outline-none placeholder:text-muted-foreground/70";
export const selectClass =
  "text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:border-[#B5607A] focus:outline-none";
export const primaryButton =
  "px-4 py-2 rounded-md bg-[#B5607A] text-white text-sm font-medium hover:bg-[#9E4D6A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2";
export const secondaryButton =
  "px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
