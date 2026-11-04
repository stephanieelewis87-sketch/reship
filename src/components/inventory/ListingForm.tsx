import { useState } from "react";
import { Check, ImagePlus, Loader2, Lock, ScanLine, Sparkles, Tag, Trash2, Upload, X } from "lucide-react";
import type { Condition, InventoryItem, Listing, Platform, Settings } from "@/lib/types";
import { ALL_PLATFORMS, CONDITIONS } from "@/lib/types";
import { isoDay } from "@/lib/analytics";
import { priceFor } from "@/lib/inventory";
import type { ListingAi, Store } from "@/lib/store";
import type { ItemChange } from "@/lib/types";
import { MARKETPLACES, MAX_LISTING_PHOTOS, PLAIN_COVER_PLATFORMS, parseListingLink } from "@/lib/marketplaces";
import { HistoryList } from "./GuardianPage";
import { Barcode } from "./SkuTools";
import type { ListingSuggestion } from "@/lib/videoListing";
import { shrinkImage, splitDataUrl } from "@/lib/videoFrames";
import { CoverPhotoEditor } from "./CoverPhotoEditor";
import { Field, PlatformIcon, SectionLabel, Toggle, inputClass, primaryButton, secondaryButton } from "../ui";
import { LabelChips } from "./LabelChips";
import { MinPriceNote } from "./MinPriceNote";
import { atLeastMinimum, underMinimum } from "@/lib/minPrice";
import { PLANS, type PlanId, listingRoom, marketplacesInUse, nextPlanFor } from "@/lib/plans";
import { PlanTag, upgradeFor, upgradeTo } from "../plans/PlanGate";

const num = (s: string) => (s.trim() === "" ? undefined : parseFloat(s) || 0);

// Add or edit an item. Shared details are entered once; each marketplace gets its own price.
export function ListingForm({
  item,
  isNew,
  settings,
  ai,
  aiLocked,
  plan = "flow",
  inventory = [],
  salesNotes = [],
  onlyPlatform,
  onClose,
  onSave,
  onDelete,
  store,
  onPrintLabel,
}: {
  item: InventoryItem;
  isNew: boolean;
  settings: Settings;
  ai?: ListingAi | null;
  aiLocked?: boolean; // the plan doesn't include AI: the button opens the upgrade page
  plan?: PlanId;
  inventory?: InventoryItem[]; // the rest of the inventory, for the plan's limits
  salesNotes?: string[];
  onlyPlatform?: Platform; // opened from an empty marketplace square
  onClose: () => void;
  onSave: (item: InventoryItem, note?: string) => void;
  onDelete?: (id: string) => void;
  store?: Store;
  onPrintLabel?: (item: InventoryItem) => void;
}) {
  // SKUs are permanent once an item is saved: changing one breaks the link to past sales and
  // printed labels, so it takes an extra click.
  const [skuUnlocked, setSkuUnlocked] = useState(isNew || !item.sku.trim());
  const [refs, setRefs] = useState<Partial<Record<Platform, string>>>(() => Object.fromEntries(item.listings.map((l) => [l.platform, l.url ?? l.listingId ?? ""])));
  const [history, setHistory] = useState<ItemChange[] | null>(null);
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
  const [gen, setGen] = useState<{ busy: boolean; message?: string }>({ busy: false });
  const set = <K extends keyof InventoryItem>(k: K, v: InventoryItem[K]) => setD((x) => ({ ...x, [k]: v }));
  const photos = d.photos ?? (d.photo ? [d.photo] : []);
  // The brand tag and banner on the cover, while the first photo is still that finished cover.
  const coverEdit = d.coverEdit && d.coverEdit.applied === photos[0] ? d.coverEdit : undefined;
  const [coverOpen, setCoverOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const savePhoto = (dataUrl: string) => (store ? store.saveListingPhoto(dataUrl) : Promise.resolve(dataUrl));
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added = await Promise.all(
        [...files].filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, MAX_LISTING_PHOTOS - photos.length)).map(async (f) => {
          const local = URL.createObjectURL(f);
          try {
            return await savePhoto(await shrinkImage(local, 1600));
          } finally {
            URL.revokeObjectURL(local);
          }
        }),
      );
      setD((x) => ({ ...x, photos: [...(x.photos ?? (x.photo ? [x.photo] : [])), ...added].slice(0, MAX_LISTING_PHOTOS) }));
    } catch (e) {
      setGen({ busy: false, message: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };
  const base = num(text.listPrice);
  // Each chosen marketplace's price: the one typed in, or the base price after the pricing rule.
  const finalPrice = (p: Platform) => num(prices[p] ?? "") ?? priceFor(base, p, settings);
  const baseTooLow = underMinimum(base);
  const lowMarkets = [...chosen].filter((p) => underMinimum(finalPrice(p)));

  const build = (publish: boolean): InventoryItem => {
    const today = isoDay(new Date());
    const listings: Listing[] = [...item.listings.filter((l) => !(publish && chosen.has(l.platform) && l.status !== "sold"))];
    if (publish)
      chosen.forEach((p) => {
        const prev = item.listings.find((l) => l.platform === p);
        if (prev?.status === "sold") return;
        listings.push({ ...prev, platform: p, status: "active", listedAt: prev?.status === "active" ? prev.listedAt : today, price: finalPrice(p) });
      });
    // Listing links or IDs typed in for each marketplace.
    for (const [p, text] of Object.entries(refs) as [Platform, string][]) {
      const at = listings.findIndex((l) => l.platform === p);
      if (at === -1) continue;
      const ref = parseListingLink(p, text);
      // A link that doesn't check out is never saved; the listing keeps what it had.
      if (!ref.ok) continue;
      listings[at] = { ...listings[at], listingId: ref.listingId, url: ref.url };
    }
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
      coverEdit,
      listings,
      status: d.status === "sold" ? "sold" : active ? "listed" : "draft",
      listedAt: d.listedAt ?? (active ? today : undefined),
      updatedAt: new Date().toISOString(),
      createdAt: d.createdAt ?? new Date().toISOString(),
    };
  };

  // Writes the listing from the photos with AI. Only fills fields that are still empty.
  const generate = async () => {
    if (!ai || !photos.length) return;
    setGen({ busy: true });
    try {
      const images = (coverEdit ? [coverEdit.original, ...photos.slice(1)] : photos).slice(0, 4).map((p) => (p.startsWith("data:") ? splitDataUrl(p) : { url: p }));
      const l: ListingSuggestion = await ai.describe(images, d.title, settings.aiInstructions, salesNotes);
      setD((x) => ({
        ...x,
        title: x.title.trim() || l.title,
        description: x.description?.trim() || l.description,
        brand: x.brand || l.brand || undefined,
        category: x.category || l.category || undefined,
        size: x.size || l.size || undefined,
        color: x.color || l.color || undefined,
        condition: x.condition ?? l.condition,
        notes: l.flaws && !x.notes ? `Flaws: ${l.flaws}` : x.notes,
      }));
      if (l.price && !text.listPrice.trim()) setText((t) => ({ ...t, listPrice: String(atLeastMinimum(Math.round(l.price!.suggested))) }));
      setGen({ busy: false, message: l.price ? `Suggested $${Math.round(l.price.suggested)} (usually sells for $${Math.round(l.price.low)}–$${Math.round(l.price.high)}). ${l.price.reasoning}` : "Filled in from your photos." });
    } catch (e) {
      setGen({ busy: false, message: (e as Error).message });
    }
  };

  const valid = d.title.trim() && d.sku.trim();

  // Plan limits. Marketplaces: the ones already in use elsewhere plus the ones picked here, up to
  // the plan's number. New listings a day: an item counts once, the day it's first listed.
  const others = inventory.filter((i) => i.id !== item.id);
  const marketLimit = PLANS[plan].marketplaces;
  const inUse = new Set([...marketplacesInUse(others), ...chosen, ...item.listings.filter((l) => l.status === "active").map((l) => l.platform)]);
  const marketFull = marketLimit !== null && inUse.size >= marketLimit;
  const room = listingRoom(plan, others, isoDay(new Date()));
  const firstListing = !item.listedAt && !item.listings.some((l) => l.status === "active");
  const dailyFull = firstListing && room.left <= 0;
  const moreMarkets = nextPlanFor(plan, "marketplaces");
  const moreListings = nextPlanFor(plan, "listingsPerDay");

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add item" : "Edit item"} className="bg-card w-full max-w-3xl sm:my-6 sm:rounded-xl border border-border shadow-2xl flex flex-col min-h-full sm:min-h-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10 sm:rounded-t-xl">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">{isNew ? "Add item" : "Edit item"}</h2>
            <p className="text-xs text-muted-foreground">Enter it once. SellSync fills in each marketplace.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Photos</SectionLabel>
              <button
                type="button"
                disabled={!photos.length}
                onClick={() => setCoverOpen(true)}
                title={photos.length ? "Add a brand tag and a sale banner like BOGO or 50% OFF to your cover photo." : "Add a photo first."}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-accent hover:bg-rose-50 disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <Tag className="w-3.5 h-3.5" /> {coverEdit ? "Edit brand tag & banner" : "Brand tag & banner"}
              </button>
              <button
                type="button"
                disabled={!aiLocked && (!ai || !photos.length || gen.busy)}
                onClick={() => (aiLocked ? upgradeFor("ai") : void generate())}
                title={aiLocked ? "AI listing is on the Flow plan." : !ai ? "AI listing runs with your SellSync account; it's off in demo mode." : !photos.length ? "Add a photo first." : "Writes the title, description, details and a suggested price from your photos."}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-accent hover:bg-rose-50 disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
              >
                {gen.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate listing
                {aiLocked && <PlanTag feature="ai" />}
              </button>
            </div>
            {gen.message && <p className="text-[12px] text-muted-foreground">{gen.message}</p>}
            <div className="flex gap-2 flex-wrap">
              {photos.map((p, i) => (
                <div key={p + i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
                  <img src={p} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  {i === 0 && (
                    <button type="button" onClick={() => setCoverOpen(true)} className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center hover:bg-black/70" title="Customize cover photo">
                      Cover{coverEdit ? " ✓" : ""}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => set("photos", photos.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-0.5 rounded bg-card/90 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!photoUrl.trim() || photos.length >= MAX_LISTING_PHOTOS) return;
                  set("photos", [...photos, photoUrl.trim()]);
                  setPhotoUrl("");
                }}
              >
                <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <ImagePlus className="w-5 h-5" />
                </div>
                <input className={`${inputClass} w-56`} placeholder="Paste a photo link and press Enter" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} aria-label="Photo link" />
              </form>
              <label className={`${secondaryButton} self-center cursor-pointer`}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => (void upload(e.target.files), (e.target.value = ""))} />
              </label>
            </div>
            <PhotoCount count={photos.length} platforms={[...new Set([...chosen, ...item.listings.map((l) => l.platform)])]} />
            <button
              type="button"
              onClick={() => photos.length && setCoverOpen(true)}
              aria-disabled={!photos.length}
              className={`w-full flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left ${photos.length ? "border-accent/50 bg-accent/5 hover:bg-accent/10" : "border-border cursor-default"}`}
            >
              <span className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4 text-accent" />
              </span>
              <span className="text-sm">
                <span className="font-medium text-foreground">{coverEdit ? "Edit your cover's brand tag and sale banner" : "Customize your cover photo"}</span>
                <span className="block text-[12px] text-muted-foreground">
                  {photos.length
                    ? `Add a brand tag (100 brands, or type your own) and a sale banner like BOGO, 50% OFF or FREE GIFT WITH PURCHASE. ${PLAIN_COVER_PLATFORMS.map((p) => MARKETPLACES[p].name).join(" and ")} always get your plain photo, since they don't allow text added to photos.`
                    : "Add a photo first, then put a brand tag and a sale banner like BOGO or 50% OFF on it."}
                </span>
              </span>
            </button>
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
                <input
                  className={`${inputClass} ${baseTooLow ? "ring-2 ring-amber-400" : ""}`}
                  inputMode="decimal"
                  aria-invalid={baseTooLow}
                  value={text.listPrice}
                  onChange={(e) => setText({ ...text, listPrice: e.target.value })}
                />
              </Field>
              <Field label="Cost ($)">
                <input className={inputClass} inputMode="decimal" value={text.cost} onChange={(e) => setText({ ...text, cost: e.target.value })} placeholder="What you paid" />
              </Field>
              <Field label="Quantity">
                <input className={inputClass} inputMode="numeric" value={text.quantity} onChange={(e) => setText({ ...text, quantity: e.target.value })} />
              </Field>
              <Field label="SKU">
                <div className="relative">
                  <input className={`${inputClass} font-mono pr-7`} value={d.sku} readOnly={!skuUnlocked} onChange={(e) => set("sku", e.target.value)} />
                  {!skuUnlocked && (
                    <button
                      type="button"
                      title="SKUs stay the same for good. Click to change it anyway."
                      aria-label="Change SKU"
                      onClick={() => window.confirm("Change this SKU? Labels you've printed and past sales use the old one.") && setSkuUnlocked(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Location">
                <input className={inputClass} value={d.location ?? ""} onChange={(e) => set("location", e.target.value || undefined)} placeholder="Bin 4" />
              </Field>
              <Field label="Bought at">
                <input className={inputClass} value={d.source ?? ""} onChange={(e) => set("source", e.target.value || undefined)} placeholder="Goodwill" />
              </Field>
              <Field label="Bought on">
                <input type="date" className={inputClass} value={d.purchasedAt ?? ""} onChange={(e) => set("purchasedAt", e.target.value || undefined)} />
              </Field>
            </div>
            {d.sku.trim() && (
              <div className="flex items-center gap-3">
                <Barcode value={d.sku.trim()} className="h-8 w-40 rounded-sm border border-border" />
                {onPrintLabel && (
                  <button type="button" onClick={() => onPrintLabel(build(false))} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
                    <ScanLine className="w-3.5 h-3.5" /> Print SKU label
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <SectionLabel>Marketplaces</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-2">
              {ALL_PLATFORMS.map((p) => {
                const sold = item.listings.find((l) => l.platform === p)?.status === "sold";
                const on = chosen.has(p);
                const blocked = !on && marketFull && !inUse.has(p);
                return (
                  <div key={p} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${on ? "border-accent bg-rose-50/40" : "border-border"}`}>
                    <button
                      type="button"
                      disabled={sold || blocked}
                      title={blocked ? `${PLANS[plan].name} lists on up to ${marketLimit} marketplaces.${moreMarkets ? ` ${PLANS[moreMarkets].name} allows more.` : ""}` : undefined}
                      aria-pressed={on}
                      onClick={() => setChosen((c) => {
                        const n = new Set(c);
                        if (n.has(p)) n.delete(p);
                        else n.add(p);
                        return n;
                      })}
                      className="flex items-center gap-2 flex-1 text-left text-sm disabled:opacity-50"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-accent border-accent" : "border-border"}`}>{on && <Check className="w-3 h-3 text-accent-foreground" />}</span>
                      <PlatformIcon platform={p} className="w-4 h-4" /> {p}
                      {sold && <span className="text-[11px] text-emerald-700">sold here</span>}
                      {!sold && existing.has(p) && item.listings.find((l) => l.platform === p)?.status === "active" && <span className="text-[11px] text-muted-foreground">listed</span>}
                    </button>
                    <input
                      className={`${inputClass} w-20 text-right ${on && underMinimum(finalPrice(p)) ? "ring-2 ring-amber-400" : ""}`}
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
            {!baseTooLow && lowMarkets.length > 0 && <MinPriceNote detail={`The price on ${lowMarkets.join(", ")} is under the minimum after your pricing rule.`} />}
            {marketFull && (
              <p className="text-[12px] text-muted-foreground">
                {PLANS[plan].name} lists on up to {marketLimit} marketplaces ({[...inUse].join(", ")}).{" "}
                {moreMarkets && (
                  <button type="button" className="text-accent hover:underline" onClick={() => upgradeTo(moreMarkets)}>
                    {PLANS[moreMarkets].marketplaces === null ? `${PLANS[moreMarkets].name} lists everywhere.` : `${PLANS[moreMarkets].name} lists on up to ${PLANS[moreMarkets].marketplaces}.`}
                  </button>
                )}
              </p>
            )}
            {item.listings.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium text-foreground">Marketplace listing links</p>
                {item.listings.map((l) => {
                  const check = parseListingLink(l.platform, refs[l.platform] ?? "");
                  return (
                    <div key={l.platform}>
                      <label className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 w-24 shrink-0">
                          <PlatformIcon platform={l.platform} /> {l.platform}
                        </span>
                        <input
                          className={`${inputClass} font-mono text-xs ${check.ok ? "" : "border-destructive"}`}
                          value={refs[l.platform] ?? ""}
                          onChange={(e) => setRefs({ ...refs, [l.platform]: e.target.value })}
                          placeholder="Paste the listing link or ID"
                          aria-label={`${l.platform} listing link or ID`}
                          aria-invalid={!check.ok}
                        />
                      </label>
                      {!check.ok && <p className="text-[11px] text-destructive pl-[6.5rem] pt-0.5">{check.problem} This link won't be saved until it's fixed.</p>}
                    </div>
                  );
                })}
                <p className="text-[12px] text-muted-foreground">Linking each listing to this item lets Inventory Guardian spot duplicates and listings that come apart.</p>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground">Prices start from your pricing rules in Settings. SellSync records each listing here; posting to the marketplace itself runs through the SellSync browser extension.</p>
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
                  <span className="block text-[12px] text-muted-foreground">Marks a draft as finished so it shows up under Needs attention.</span>
                </span>
                <Toggle label="Ready to list" checked={!!d.readyToList} onChange={() => set("readyToList", !d.readyToList)} />
              </label>
            )}
          </section>

          {!isNew && store && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionLabel>History</SectionLabel>
                {history === null && (
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => store.listHistory(item.id).then(setHistory)}>
                    Show changes
                  </button>
                )}
              </div>
              {history && (history.length ? <HistoryList entries={history} /> : <p className="text-xs text-muted-foreground">No changes recorded yet.</p>)}
            </section>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2 sticky bottom-0 bg-card sm:rounded-b-xl">
          {!isNew && onDelete &&
            (confirmDelete ? (
              <button type="button" onClick={() => onDelete(item.id)} className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium">
                Confirm delete
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-muted">
                Delete
              </button>
            ))}
          {baseTooLow && <MinPriceNote className="flex-1" />}
          {dailyFull && (
            <p className="text-[12px] text-muted-foreground">
              You've listed {room.cap} new items today, {PLANS[plan].name}'s daily limit. Save it as a draft
              {moreListings && (
                <>
                  , or{" "}
                  <button type="button" className="text-accent hover:underline" onClick={() => upgradeTo(moreListings)}>
                    {PLANS[moreListings].listingsPerDay === null ? `go unlimited on ${PLANS[moreListings].name}` : `list ${PLANS[moreListings].listingsPerDay} a day on ${PLANS[moreListings].name}`}
                  </button>
                </>
              )}
              .
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={!valid || baseTooLow} onClick={() => onSave(build(false), "Saved.")} className={secondaryButton}>
              {d.status === "draft" || isNew ? "Save draft" : "Save"}
            </button>
            <button
              type="button"
              disabled={!valid || chosen.size === 0 || dailyFull || baseTooLow || lowMarkets.length > 0}
              onClick={() => onSave(build(true), `Listed on ${[...chosen].join(", ")}.`)}
              className={primaryButton}
            >
              List item{chosen.size ? ` (${chosen.size})` : ""}
            </button>
          </div>
        </div>
      </div>
      {coverOpen && photos[0] && (
        <CoverPhotoEditor
          photo={photos[0]}
          edit={coverEdit}
          brandHint={d.brand}
          savePhoto={savePhoto}
          onClose={() => setCoverOpen(false)}
          onApply={(photo, edit) => {
            setD((x) => ({ ...x, photos: [photo, ...photos.slice(1)], coverEdit: edit }));
            setCoverOpen(false);
          }}
        />
      )}
    </div>
  );
}

// How many photos the listing has, out of the most any marketplace takes, and which of the
// seller's marketplaces will only get the first few.
function PhotoCount({ count, platforms }: { count: number; platforms: Platform[] }) {
  const fewer = platforms.filter((p) => count > MARKETPLACES[p].photosMax).sort((a, b) => MARKETPLACES[a].photosMax - MARKETPLACES[b].photosMax);
  return (
    <p className="text-[12px] text-muted-foreground">
      {count} of {MAX_LISTING_PHOTOS} photos{count >= MAX_LISTING_PHOTOS ? " (the most any marketplace takes)" : ""}.
      {fewer.length > 0 && ` ${fewer.map((p) => `${MARKETPLACES[p].name} gets the first ${MARKETPLACES[p].photosMax}`).join(", ")}, so put your best photos first.`}
    </p>
  );
}
