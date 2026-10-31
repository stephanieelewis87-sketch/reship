import { useState } from "react";
import { X } from "lucide-react";
import type { Condition, InventoryItem, Settings } from "@/lib/types";
import { CONDITIONS } from "@/lib/types";
import { shortDate } from "@/lib/analytics";
import { Field, PlatformIcon, SectionLabel, inputClass, primaryButton, secondaryButton } from "../ui";
import { LabelChips } from "./LabelChips";

const day = (iso?: string) => (iso ? shortDate(iso.slice(0, 10)) : "–");

// Edit the everyday fields of an item without leaving the grid.
export function QuickEdit({
  item,
  settings,
  onClose,
  onSave,
  onOpenFull,
}: {
  item: InventoryItem;
  settings: Settings;
  onClose: () => void;
  onSave: (i: InventoryItem) => void;
  onOpenFull: () => void;
}) {
  const [d, setD] = useState(item);
  const [price, setPrice] = useState(item.listPrice?.toString() ?? "");
  const [cost, setCost] = useState(item.cost?.toString() ?? "");
  const [qty, setQty] = useState(String(item.quantity ?? 1));
  const num = (s: string) => (s.trim() === "" ? undefined : parseFloat(s) || 0);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Quick edit" className="bg-card w-full sm:max-w-sm h-full flex flex-col shadow-2xl border-l border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            {item.photo ? <img src={item.photo} alt="" className="w-10 h-10 rounded-md object-cover" /> : <div className="w-10 h-10 rounded-md bg-muted" />}
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-foreground">Quick edit</h2>
              <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Field label="Title">
            <input className={inputClass} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Price ($)">
              <input className={inputClass} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Cost ($)">
              <input className={inputClass} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label="Quantity">
              <input className={inputClass} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SKU">
              <input className={`${inputClass} font-mono`} value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} />
            </Field>
            <Field label="Condition">
              <select className={inputClass} value={d.condition ?? ""} onChange={(e) => setD({ ...d, condition: (e.target.value || undefined) as Condition | undefined })}>
                <option value="">–</option>
                {CONDITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Private notes">
            <textarea className={`${inputClass} min-h-16`} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value || undefined })} />
          </Field>
          <div>
            <SectionLabel className="mb-2">Labels</SectionLabel>
            <LabelChips defs={settings.labels} value={d.labels ?? []} onChange={(labels) => setD({ ...d, labels })} />
          </div>
          <div>
            <SectionLabel className="mb-2">Listings</SectionLabel>
            {item.listings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not listed anywhere yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {item.listings.map((l) => (
                  <li key={l.platform} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={l.platform} /> {l.platform}
                    </span>
                    <span className="text-muted-foreground capitalize">
                      {l.status}
                      {l.price != null ? ` · $${l.price}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs border-t border-border pt-3">
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{day(item.createdAt ?? item.purchasedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Modified</dt>
              <dd>{day(item.updatedAt ?? item.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sold</dt>
              <dd>{day(item.soldAt)}</dd>
            </div>
          </dl>
        </div>
        <div className="px-5 py-3 border-t border-border flex gap-2">
          <button type="button" onClick={onOpenFull} className="text-xs text-muted-foreground hover:text-foreground mr-auto">
            Open full editor
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() =>
              onSave({ ...d, listPrice: num(price), cost: num(cost), quantity: Math.max(1, Math.round(num(qty) ?? 1)), updatedAt: new Date().toISOString() })
            }
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}
