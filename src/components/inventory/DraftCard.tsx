import { ImageOff, Loader2, Sparkles, Star, Trash2, Wand2 } from "lucide-react";
import { CONDITIONS } from "@/lib/types";
import type { Condition } from "@/lib/types";
import type { ListingSuggestion, VideoDraft } from "@/lib/videoListing";
import { Field, inputClass } from "../ui";

// One draft listing to check before saving: its photos (tap to pick the cover) and the fields the
// AI filled in. Used by List with a video and List from photos.
export function DraftCard({
  n,
  d,
  canAi,
  patch,
  patchListing,
  retry,
  remakePhoto,
  photosOff,
}: {
  n: number;
  d: VideoDraft;
  canAi: boolean;
  patch: (p: Partial<VideoDraft>) => void;
  patchListing: (p: Partial<ListingSuggestion>) => void;
  retry: () => void;
  remakePhoto: () => void;
  photosOff: boolean;
}) {
  const l = d.listing;
  const photos = [...(d.aiPhoto ? [d.aiPhoto] : []), ...d.snips];
  const writing = d.state === "waiting" || d.state === "writing";
  return (
    <div className={`rounded-xl border p-3 sm:p-4 flex flex-col md:flex-row gap-4 ${d.include ? "border-border" : "border-dashed border-border opacity-60"}`}>
      <div className="md:w-64 shrink-0 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={d.include} onChange={() => patch({ include: !d.include })} aria-label={`Include item ${n}`} className="accent-[#B5607A]" />
          <span className="font-mono text-muted-foreground">#{n}</span>
          <span className="truncate">{d.label}</span>
        </div>
        <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted relative">
          <img src={d.cover} alt="" className="w-full h-full object-contain" />
          {d.cover === d.aiPhoto && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-white/90 text-[10px] font-medium flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#B5607A]" /> AI photo</span>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className={`relative w-12 h-12 rounded-md overflow-hidden border group ${p === d.cover ? "border-[#B5607A] ring-1 ring-[#B5607A]" : "border-border"}`}>
              <button type="button" onClick={() => patch({ cover: p })} aria-label="Use as cover photo" className="w-full h-full">
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
              {p === d.aiPhoto && <Sparkles className="absolute bottom-0.5 left-0.5 w-3 h-3 text-white drop-shadow" />}
              {p !== d.cover && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => patch(p === d.aiPhoto ? { aiPhoto: undefined } : { snips: d.snips.filter((s) => s !== p) })}
                  className="absolute top-0 right-0 p-0.5 rounded-bl bg-white/90 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          {d.aiPhotoState === "making" && (
            <div className="w-12 h-12 rounded-md border border-dashed border-border flex items-center justify-center" title="Making a clean AI photo">
              <Loader2 className="w-4 h-4 animate-spin text-[#B5607A]" />
            </div>
          )}
          {canAi && !photosOff && !d.aiPhoto && d.aiPhotoState !== "making" && (
            <button type="button" onClick={remakePhoto} title={d.aiPhotoState === "failed" ? "The AI photo failed. Try again." : "Make a clean AI photo"} className="w-12 h-12 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-[#B5607A]">
              {d.aiPhotoState === "failed" ? <ImageOff className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Star className="w-3 h-3" /> Tap a photo to make it the cover.
        </p>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {writing && (
          <p className="text-xs text-[#B5607A] flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {d.state === "writing" ? "Writing the listing…" : "Waiting its turn…"}
          </p>
        )}
        {d.state === "failed" && (
          <p className="text-xs text-rose-700 flex items-center gap-2">
            {d.error ?? "The listing couldn't be written."}
            <button type="button" onClick={retry} className="underline">
              Try again
            </button>
          </p>
        )}
        <Field label="Title">
          <input className={inputClass} value={l.title} disabled={writing} onChange={(e) => patchListing({ title: e.target.value })} placeholder="Brand, item, style, color, size" />
        </Field>
        <Field label="Description">
          <textarea className={`${inputClass} min-h-20`} value={l.description} disabled={writing} onChange={(e) => patchListing({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Field label="Brand">
            <input className={inputClass} value={l.brand ?? ""} disabled={writing} onChange={(e) => patchListing({ brand: e.target.value })} />
          </Field>
          <Field label="Category">
            <input className={inputClass} value={l.category ?? ""} disabled={writing} onChange={(e) => patchListing({ category: e.target.value })} />
          </Field>
          <Field label="Condition">
            <select className={inputClass} value={l.condition ?? ""} disabled={writing} onChange={(e) => patchListing({ condition: (e.target.value || undefined) as Condition | undefined })}>
              <option value="">Choose…</option>
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <input className={inputClass} value={l.size ?? ""} disabled={writing} onChange={(e) => patchListing({ size: e.target.value })} />
          </Field>
          <Field label="Color">
            <input className={inputClass} value={l.color ?? ""} disabled={writing} onChange={(e) => patchListing({ color: e.target.value })} />
          </Field>
          <Field label="Price ($)">
            <input className={inputClass} inputMode="decimal" value={d.priceText} disabled={writing} onChange={(e) => patch({ priceText: e.target.value })} />
          </Field>
        </div>
        {l.price && (
          <div className="text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2">
            <span className="font-medium">
              Suggested ${Math.round(l.price.suggested)} · usually sells for ${Math.round(l.price.low)}–${Math.round(l.price.high)}
            </span>
            {l.confidence !== "high" && <span className="text-emerald-800/80"> ({l.confidence} confidence)</span>}
            <span className="block text-emerald-800/90 mt-0.5">{l.price.reasoning}</span>
          </div>
        )}
        {l.flaws && <p className="text-xs text-amber-800">Flaws noted: {l.flaws}</p>}
        {l.tags.length > 0 && <p className="text-[11px] text-muted-foreground">Tags: {l.tags.join(", ")}</p>}
      </div>
    </div>
  );
}
