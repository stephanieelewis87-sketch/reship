import { useState } from "react";
import { Check, ImagePlus, Sparkles, Trash2, X } from "lucide-react";
import type { Condition, InventoryItem, Listing, Platform, Settings } from "@/lib/types";
import { ALL_PLATFORMS, CONDITIONS } from "@/lib/types";
import { isoDay } from "@/lib/analytics";
import { priceFor } from "@/lib/inventory";
import { Field, PlatformIcon, SectionLabel, Toggle, inputClass, primaryButton, secondaryButton } from "../ui";
import { LabelChips } from "./LabelChips";

const num = (s: string) => (s.trim() === "" ? undefined : parseFloat(s) || 0);

// Add or edit an item. Shared details are entered once; each marketplace gets its own price.
export function ListingForm({
  item,
  isNew,
  settings,
  onlyPlatform,
  onClose,
  onSave,
  onDelete,
}: {
  item: InventoryItem;
  isNew: boolean;
  settings: Settings;
  onlyPlatform?: Platform; // opened from an empty marketplace square
  onClose: () => void;
  onSave: (item: InventoryItem, note?: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [d, setD] = useState<InventoryItem>(item);
  const [text, setText] = useState({
    listPrice: item.listPrice?.toString() ?? "",
    cost: item.cost?.toString() ?? "",
    quantity: String(item.quantity ?? 1),
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const existing = new Set(item.listings.map((l) => l.platform));
  const [chosen, setChosen] = useState<Set<Platform>>(() => new Set(onlyPlatform ? [onlyPlatform] : item.listings.filter((l) => l.status === "active").map((l) => l.platform)));
  const [prices, setPrices] = useState<Partial<Record<Platform, string>>>(() =>
    Object.fromEntries(item.listings.map((l) => [l.platform, l.price?.toString() ?? ""])),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof InventoryItem>(k: K, v: InventoryItem[K]) => setD((x) => ({ ...x, [k]: v }));
  const photos = d.photos ?? (d.photo ? [d.photo] : []);
  const base = num(text.listPrice);

  const build = (publish: boolean): InventoryItem => {
    const today = isoDay(new Date());
    const listings: Listing[] = [...item.listings.filter((l) => !(publish && chosen.has(l.platform) && l.status !== "sold"))];
    if (publish)
      chosen.forEach((p) => {
        const prev = item.listings.find((l) => l.platform === p);
        if (prev?.status === "sold") return;
        listings.push({ ...prev, platform: p, status: "active", listedAt: prev?.status === "active" ? prev.listedAt : today, price: num(prices[p] ?? "") ?? priceFor(base, p, settings) });
      });
    const active = listings.some((l) => l.status === "active");
    return {
      ...d,
      title: d.title.trim(),
      sku: d.sku.trim(),
      listPrice: base,
      cost: num(text.cost),
      quantity: Math.max(1, Math.round(num(text.quantity) ?? 1)),
      photos,
      photo: photos[0],
      listings,
      status: d.status === "sold" ? "sold" : active ? "listed" : "draft",
      listedAt: d.listedAt ?? (active ? today : undefined),
      updatedAt: new Date().toISOString(),
      createdAt: d.createdAt ?? new Date().toISOString(),
    };
  };

  const valid = d.title.trim() && d.sku.trim();

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add item" : "Edit item"} className="bg-card w-full max-w-3xl sm:my-6 sm:rounded-xl border border-border shadow-2xl flex flex-col min-h-full sm:min-h-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10 sm:rounded-t-xl">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">{isNew ? "Add item" : "Edit item"}</h2>
            <p className="text-xs text-muted-foreground">Enter it once. Reship fills in each marketplace.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Photos</SectionLabel>
              <button
                type="button"
                disabled
                title="Writes the title, description and details from your photos. Arrives with Listy."
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate listing (soon)
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {photos.map((p, i) => (
                <div key={p + i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center">Cover</span>}
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => set("photos", photos.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-0.5 rounded bg-white/90 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!photoUrl.trim()) return;
                  set("photos", [...photos, photoUrl.trim()]);
                  setPhotoUrl("");
                }}
              >
                <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <ImagePlus className="w-5 h-5" />
                </div>
                <input className={`${inputClass} w-56`} placeholder="Paste a photo link and press Enter" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} aria-label="Photo link" />
              </form>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel>Details</SectionLabel>
            <Field label="Title">
              <input className={inputClass} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Lululemon Align Leggings 25in Black Size 6" />
            </Field>
            <Field label="Description">
              <textarea className={`${inputClass} min-h-24`} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Brand">
                <input className={inputClass} value={d.brand ?? ""} onChange={(e) => set("brand", e.target.value || undefined)} />
              </Field>
              <Field label="Category">
                <input className={inputClass} value={d.category ?? ""} onChange={(e) => set("category", e.target.value || undefined)} />
              </Field>
              <Field label="Size">
                <input className={inputClass} value={d.size ?? ""} onChange={(e) => set("size", e.target.value || undefined)} />
              </Field>
              <Field label="Color">
                <input className={inputClass} value={d.color ?? ""} onChange={(e) => set("color", e.target.value || undefined)} />
              </Field>
              <Field label="Condition">
                <select className={inputClass} value={d.condition ?? ""} onChange={(e) => set("condition", (e.target.value || undefined) as Condition | undefined)}>
                  <option value="">Choose…</option>
                  {CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Price ($)">
                <input className={inputClass} inputMode="decimal" value={text.listPrice} onChange={(e) => setText({ ...text, listPrice: e.target.value })} />
              </Field>
              <Field label="Cost ($)">
                <input className={inputClass} inputMode="decimal" value={text.cost} onChange={(e) => setText({ ...text, cost: e.target.value })} placeholder="What you paid" />
              </Field>
              <Field label="Quantity">
                <input className={inputClass} inputMode="numeric" value={text.quantity} onChange={(e) => setText({ ...text, quantity: e.target.value })} />
              </Field>
              <Field label="SKU">
                <input className={`${inputClass} font-mono`} value={d.sku} onChange={(e) => set("sku", e.target.value)} />
              </Field>
              <Field label="Bought at">
                <input className={inputClass} value={d.source ?? ""} onChange={(e) => set("source", e.target.value || undefined)} placeholder="Goodwill" />
              </Field>
              <Field label="Bought on">
                <input type="date" className={inputClass} value={d.purchasedAt ?? ""} onChange={(e) => set("purchasedAt", e.target.value || undefined)} />
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel>Marketplaces</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-2">
              {ALL_PLATFORMS.map((p) => {
                const sold = item.listings.find((l) => l.platform === p)?.status === "sold";
                const on = chosen.has(p);
                return (
                  <div key={p} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${on ? "border-[#B5607A] bg-rose-50/40" : "border-border"}`}>
                    <button
                      type="button"
                      disabled={sold}
                      aria-pressed={on}
                      onClick={() => setChosen((c) => {
                        const n = new Set(c);
                        if (n.has(p)) n.delete(p);
                        else n.add(p);
                        return n;
                      })}
                      className="flex items-center gap-2 flex-1 text-left text-sm disabled:opacity-50"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-[#B5607A] border-[#B5607A]" : "border-border"}`}>{on && <Check className="w-3 h-3 text-white" />}</span>
                      <PlatformIcon platform={p} className="w-4 h-4" /> {p}
                      {sold && <span className="text-[10px] text-emerald-700">sold here</span>}
                      {!sold && existing.has(p) && item.listings.find((l) => l.platform === p)?.status === "active" && <span className="text-[10px] text-muted-foreground">listed</span>}
                    </button>
                    <input
                      className={`${inputClass} w-20 text-right`}
                      inputMode="decimal"
                      aria-label={`${p} price`}
                      placeholder={priceFor(base, p, settings)?.toString() ?? "$"}
                      value={prices[p] ?? ""}
                      onChange={(e) => setPrices({ ...prices, [p]: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Prices start from your pricing rules in Settings. Reship records each listing here; posting to the marketplace itself runs through the Reship browser extension.</p>
          </section>

          <section className="space-y-3">
            <SectionLabel>Private notes and labels</SectionLabel>
            <Field label="Private notes (never posted)">
              <textarea className={`${inputClass} min-h-16`} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} placeholder="Bin 4, small stain on cuff" />
            </Field>
            <LabelChips defs={settings.labels} value={d.labels ?? []} onChange={(labels) => set("labels", labels)} />
            {d.status !== "sold" && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Ready to list
                  <span className="block text-[11px] text-muted-foreground">Marks a draft as finished so it shows up under Needs attention.</span>
                </span>
                <Toggle label="Ready to list" checked={!!d.readyToList} onChange={() => set("readyToList", !d.readyToList)} />
              </label>
            )}
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2 sticky bottom-0 bg-card sm:rounded-b-xl">
          {!isNew && onDelete &&
            (confirmDelete ? (
              <button type="button" onClick={() => onDelete(item.id)} className="px-3 py-2 rounded-md bg-destructive text-white text-sm font-medium">
                Confirm delete
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-muted">
                Delete
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={!valid} onClick={() => onSave(build(false), "Saved.")} className={secondaryButton}>
              {d.status === "draft" || isNew ? "Save draft" : "Save"}
            </button>
            <button
              type="button"
              disabled={!valid || chosen.size === 0}
              onClick={() => onSave(build(true), `Listed on ${[...chosen].join(", ")}.`)}
              className={primaryButton}
            >
              List item{chosen.size ? ` (${chosen.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
