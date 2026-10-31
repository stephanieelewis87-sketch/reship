import { useEffect, useState } from "react";
import { ExternalLink, FileText, Plus, ShoppingCart, Trash2, Upload, X } from "lucide-react";
import type { LabelStatus, Order, OrderItem, PackageType, Platform } from "@/lib/types";
import { ALL_PLATFORMS, CARRIER_SERVICES, PACKAGE_TYPES, emptyAddress } from "@/lib/types";
import { newId } from "@/lib/ids";
import { estimateFees, guessBrand, guessCategory } from "@/lib/analytics";
import { AddressFields } from "./AddressFields";
import { Field, PhotoCollage, SectionLabel, STATUS_CONFIG, inputClass, primaryButton, secondaryButton } from "./ui";

export interface LabelChange {
  file?: File;
  remove?: boolean;
}

export const blankOrder = (carrier: string): Order => ({
  id: newId(),
  platform: "Poshmark",
  orderId: "",
  buyer: "",
  items: [{ name: "" }],
  date: new Date().toISOString().slice(0, 10),
  status: "pending",
  carrier,
  shipTo: emptyAddress(),
  parcel: { weightLbs: null, packageType: "Soft Pack" },
  source: "manual",
});

// Side panel to view and edit one order, or to add a new one by hand.
export function OrderDrawer({
  order,
  isNew,
  onClose,
  onSave,
  onDelete,
  onViewLabel,
  onBuyLabel,
}: {
  order: Order;
  isNew: boolean;
  onClose: () => void;
  onSave: (o: Order, label: LabelChange) => void;
  onDelete: (id: string) => void;
  onViewLabel: (o: Order) => void;
  onBuyLabel: (o: Order) => void;
}) {
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [removeLabel, setRemoveLabel] = useState(false);
  const currentLabelName = labelFile?.name ?? (removeLabel ? undefined : order.label?.fileName);
  const [draft, setDraft] = useState<Order>(() => ({
    ...order,
    shipTo: order.shipTo ?? emptyAddress(),
    parcel: order.parcel ?? { weightLbs: null, packageType: "Soft Pack" },
  }));
  const [weightText, setWeightText] = useState(order.parcel?.weightLbs != null ? String(order.parcel.weightLbs) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof Order>(key: K, value: Order[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setItem = (i: number, patch: Partial<OrderItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

  const estimatedFees = draft.items.reduce((a, i) => a + estimateFees(draft.platform, i.price ?? 0), 0);
  const valid = draft.orderId.trim() && draft.items.some((i) => i.name.trim());

  const save = () => {
    const items = draft.items
      .filter((i) => i.name.trim())
      .map((i) => ({
        ...i,
        name: i.name.trim(),
        sku: i.sku?.trim() || undefined,
        photo: i.photo?.trim() || undefined,
        brand: i.brand?.trim() || undefined,
        category: i.category?.trim() || undefined,
      }));
    const hasAddress = draft.shipTo && Object.values(draft.shipTo).some((v) => v && v !== "US");
    onSave({
      ...draft,
      orderId: draft.orderId.trim(),
      buyer: draft.buyer.trim().replace(/^@/, ""),
      items,
      shipTo: hasAddress ? draft.shipTo : undefined,
      parcel: { weightLbs: parseFloat(weightText) || null, packageType: draft.parcel!.packageType },
      tracking: draft.tracking?.trim() || undefined,
      label: removeLabel ? undefined : draft.label,
    }, { file: labelFile ?? undefined, remove: removeLabel && !labelFile });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={isNew ? "Add order" : "Order details"} className="bg-card w-full sm:max-w-md h-full flex flex-col shadow-2xl border-l border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {!isNew && <PhotoCollage photos={draft.items.map((i) => i.photo)} size="sm" />}
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-foreground">{isNew ? "Add Order" : "Order Details"}</h2>
              {!isNew && <p className="font-mono text-[11px] text-muted-foreground truncate">{order.orderId}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <section className="space-y-3">
            <SectionLabel>Order</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Marketplace">
                <select className={inputClass} value={draft.platform} onChange={(e) => set("platform", e.target.value as Platform)}>
                  {[...ALL_PLATFORMS, "Other" as Platform].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Order number">
                <input className={`${inputClass} font-mono`} value={draft.orderId} onChange={(e) => set("orderId", e.target.value)} placeholder="PM-44821" />
              </Field>
              <Field label="Buyer username">
                <input className={inputClass} value={draft.buyer} onChange={(e) => set("buyer", e.target.value)} placeholder="jessica_m" />
              </Field>
              <Field label="Order date">
                <input type="date" className={inputClass} value={draft.date} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="Status">
                <select className={inputClass} value={draft.status} onChange={(e) => set("status", e.target.value as LabelStatus)}>
                  {(Object.keys(STATUS_CONFIG) as LabelStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_CONFIG[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tracking number">
                <input className={`${inputClass} font-mono`} value={draft.tracking ?? ""} onChange={(e) => set("tracking", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Shipping label</SectionLabel>
            {currentLabelName ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <FileText className="w-4 h-4 text-[#B5607A] shrink-0" />
                <p className="text-sm text-foreground truncate flex-1">{currentLabelName}</p>
                {!labelFile && order.label && (
                  <button type="button" onClick={() => onViewLabel(order)} className="text-xs text-[#B5607A] hover:underline flex items-center gap-1">
                    View <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove label"
                  onClick={() => {
                    setLabelFile(null);
                    setRemoveLabel(true);
                  }}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload the label PDF the marketplace gave you for this order.</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs text-[#B5607A] hover:underline flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" /> {currentLabelName ? "Replace label PDF" : "Upload label PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setLabelFile(f);
                      setRemoveLabel(false);
                    }
                  }}
                />
              </label>
              {!isNew && (
                <button type="button" onClick={() => onBuyLabel(order)} className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" /> Buy a different label
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Items</SectionLabel>
            {draft.items.map((item, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                <div className="flex gap-2">
                  <Field label="Item name" className="flex-1">
                    <input className={inputClass} value={item.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  </Field>
                  {draft.items.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }))}
                      className="self-end p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="SKU">
                    <input className={`${inputClass} font-mono`} value={item.sku ?? ""} onChange={(e) => setItem(i, { sku: e.target.value })} />
                  </Field>
                  <Field label="Price ($)">
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={item.price ?? ""}
                      onChange={(e) => setItem(i, { price: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0 })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Cost ($)">
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={item.cost ?? ""}
                      placeholder="What you paid"
                      onChange={(e) => setItem(i, { cost: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Brand">
                    <input className={inputClass} value={item.brand ?? ""} placeholder={guessBrand(item.name)} onChange={(e) => setItem(i, { brand: e.target.value || undefined })} />
                  </Field>
                  <Field label="Category">
                    <input className={inputClass} value={item.category ?? ""} placeholder={guessCategory(item.name)} onChange={(e) => setItem(i, { category: e.target.value || undefined })} />
                  </Field>
                </div>
                <Field label="Photo link">
                  <input className={inputClass} value={item.photo ?? ""} onChange={(e) => setItem(i, { photo: e.target.value })} placeholder="https://… (optional)" />
                </Field>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { name: "" }] }))}
              className="text-xs text-[#B5607A] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add another item (bundle)
            </button>
          </section>

          <section className="space-y-3">
            <SectionLabel>Money</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Marketplace fees ($)">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={draft.fees ?? ""}
                  placeholder={`About ${estimatedFees.toFixed(2)}`}
                  onChange={(e) => set("fees", e.target.value === "" ? undefined : parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Shipping you paid ($)">
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={draft.shippingCost ?? ""}
                  placeholder="0 if the buyer paid"
                  onChange={(e) => set("shippingCost", e.target.value === "" ? undefined : parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">Left blank, fees are estimated from {draft.platform}'s fee schedule for analytics.</p>
          </section>

          <section className="space-y-3">
            <SectionLabel>Ship to</SectionLabel>
            <AddressFields value={draft.shipTo!} onChange={(a) => set("shipTo", a)} />
          </section>

          <section className="space-y-3">
            <SectionLabel>Package</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Weight (lbs)">
                <input className={inputClass} inputMode="decimal" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
              </Field>
              <Field label="Package">
                <select
                  className={inputClass}
                  value={draft.parcel!.packageType}
                  onChange={(e) => set("parcel", { ...draft.parcel!, packageType: e.target.value as PackageType })}
                >
                  {PACKAGE_TYPES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Carrier">
                <select className={inputClass} value={draft.carrier} onChange={(e) => set("carrier", e.target.value)}>
                  {[...new Set([draft.carrier, ...CARRIER_SERVICES])].filter(Boolean).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
          {!isNew &&
            (confirmDelete ? (
              <button type="button" onClick={() => onDelete(order.id)} className="px-3 py-2 rounded-md bg-destructive text-white text-sm font-medium">
                Confirm delete
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-muted">
                Delete
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={!valid} className={primaryButton}>
              {isNew ? "Add order" : "Save"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
