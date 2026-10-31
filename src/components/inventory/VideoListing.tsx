import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clapperboard, ImageOff, Loader2, Sparkles, Star, Trash2, Upload, Wand2 } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import type { AiImage } from "@/lib/store";
import { CONDITIONS } from "@/lib/types";
import type { Condition } from "@/lib/types";
import { nextSku } from "@/lib/inventory";
import { cropFrame, sampleVideo, shrinkImage, splitDataUrl } from "@/lib/videoFrames";
import type { DetectedItem, ListingSuggestion, VideoDraft } from "@/lib/videoListing";
import {
  MAX_AI_FRAMES,
  MAX_ITEMS,
  MAX_VIDEO_SECONDS,
  cleanDetected,
  draftToItem,
  eachLimit,
  emptyListing,
  itemsFromScenes,
  orderedPhotos,
  pickFrames,
  salesHints,
  splitScenes,
} from "@/lib/videoListing";
import { Field, Modal, ModalHeader, Toggle, inputClass, primaryButton, secondaryButton } from "../ui";

type Data = ReturnType<typeof useReshipData>;
type Step = { kind: "pick" } | { kind: "working"; label: string; progress?: number } | { kind: "review" } | { kind: "saving"; done: number; total: number };

const AI_FRAME_SIDE = 768;
const toAi = (url: string): AiImage => splitDataUrl(url);

// Film up to 25 items, get a draft listing for each: snips from the video, an optional clean AI
// photo, and the title, details and price filled in.
export function VideoListing({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: (message: string) => void }) {
  const ai = data.store.listingAi;
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [drafts, setDrafts] = useState<VideoDraft[]>([]);
  const [makePhotos, setMakePhotos] = useState(true);
  const [photosOff, setPhotosOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => void (cancelled.current = true), []);

  const patch = (id: string, p: Partial<VideoDraft> | ((d: VideoDraft) => Partial<VideoDraft>)) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...(typeof p === "function" ? p(d) : p) } : d)));
  const patchListing = (id: string, p: Partial<ListingSuggestion>) => patch(id, (d) => ({ listing: { ...d.listing, ...p } }));

  async function writeListing(d: VideoDraft) {
    if (!ai || cancelled.current) return;
    patch(d.id, { state: "writing", error: undefined });
    try {
      const images = await Promise.all(d.snips.slice(0, 4).map((s) => shrinkImage(s, AI_FRAME_SIDE).then(toAi)));
      const listing = await ai.describe(images, d.label, data.settings.aiInstructions, salesHints(data.inventory));
      patch(d.id, { listing, priceText: listing.price ? String(Math.round(listing.price.suggested)) : "", state: "done" });
    } catch (e) {
      patch(d.id, { state: "failed", error: (e as Error).message });
    }
  }

  async function makePhoto(d: VideoDraft): Promise<boolean> {
    if (!ai || cancelled.current) return false;
    patch(d.id, { aiPhotoState: "making" });
    try {
      const img = await ai.photo(toAi(await shrinkImage(d.snips[0], 1024)), d.label);
      if (img === null) {
        setPhotosOff(true);
        patch(d.id, { aiPhotoState: undefined });
        return false;
      }
      // The clean photo becomes the cover unless the seller already picked another one.
      patch(d.id, (cur) => ({ aiPhoto: img, aiPhotoState: undefined, cover: cur.cover === cur.snips[0] ? img : cur.cover }));
    } catch {
      patch(d.id, { aiPhotoState: "failed" });
    }
    return true;
  }

  async function start(file: File) {
    setError(null);
    cancelled.current = false;
    try {
      setStep({ kind: "working", label: "Reading your video", progress: 0 });
      const video = await sampleVideo(file, (p) => setStep({ kind: "working", label: "Reading your video", progress: p }));
      if (cancelled.current) return;
      const scenes = splitScenes(video.samples);
      const picked = pickFrames(video.samples, scenes, MAX_AI_FRAMES);

      let found: DetectedItem[] = [];
      if (ai) {
        setStep({ kind: "working", label: "Finding each item" });
        try {
          const frames = await Promise.all(picked.map((i) => shrinkImage(video.images[i], AI_FRAME_SIDE).then(toAi)));
          found = cleanDetected(await ai.detect(frames, picked.map((i) => video.samples[i].t)), picked.length);
          if (!found.length) setNotice("The AI didn't spot any items, so Reship split the video by scene instead.");
        } catch (e) {
          setNotice(`${(e as Error).message} Reship split the video by scene instead.`);
        }
      } else {
        setNotice("AI is off in demo mode, so Reship split your video into items by scene. With your Reship account, AI names, describes and prices each item and makes clean photos.");
      }
      if (!found.length) found = itemsFromScenes(scenes, picked);
      if (cancelled.current) return;

      setStep({ kind: "working", label: "Cutting snips from the video" });
      const made: VideoDraft[] = [];
      for (const [n, it] of found.entries()) {
        const best = await cropFrame(video.images[picked[it.bestFrame]], it.box);
        const others = await Promise.all(it.frames.filter((f) => f !== it.bestFrame).slice(0, 3).map((f) => cropFrame(video.images[picked[f]])));
        made.push({ id: `v${n}`, include: true, label: it.label, snips: [best, ...others], cover: best, listing: { ...emptyListing(), title: ai ? "" : it.label }, priceText: "", state: ai ? "waiting" : "done" });
      }
      setDrafts(made);
      setStep({ kind: "review" });

      if (ai) {
        await eachLimit(made, 3, writeListing);
        if (makePhotos) {
          let on = true;
          await eachLimit(made, 2, async (d) => {
            if (on) on = await makePhoto(d);
          });
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "pick" });
    }
  }

  async function save() {
    const chosen = drafts.filter((d) => d.include);
    setStep({ kind: "saving", done: 0, total: chosen.length });
    try {
      const items = [];
      let all = [...data.inventory];
      for (const [n, d] of chosen.entries()) {
        // Demo mode keeps photos in this browser, so they're kept small there.
        const photos = await Promise.all(orderedPhotos(d).slice(0, ai ? 8 : 3).map(async (p) => data.store.saveListingPhoto(ai ? p : await shrinkImage(p, 480))));
        const item = draftToItem(d, photos, nextSku(all));
        all = [...all, item];
        items.push(item);
        setStep({ kind: "saving", done: n + 1, total: chosen.length });
      }
      data.saveInventory(items);
      onSaved(`Saved ${items.length} draft${items.length === 1 ? "" : "s"} from your video. Open one to check it, then list it everywhere.`);
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "review" });
    }
  }

  const close = () => {
    cancelled.current = true;
    onClose();
  };
  const busy = drafts.some((d) => d.state === "writing" || d.state === "waiting");
  const included = drafts.filter((d) => d.include).length;

  return (
    <Modal onClose={step.kind === "review" || step.kind === "pick" ? close : () => {}} maxWidth="max-w-5xl" label="List with a video">
      <ModalHeader
        title="List with a video"
        subtitle={step.kind === "review" ? `${drafts.length} item${drafts.length === 1 ? "" : "s"} found. Check each one, then save them as drafts.` : `Film up to ${MAX_ITEMS} items. Reship finds each one and writes its listing.`}
        onClose={close}
        icon={<Clapperboard className="w-5 h-5 text-[#B5607A]" />}
      />
      <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-4">
        {error && (
          <div className="flex gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {notice && step.kind !== "pick" && <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">{notice}</div>}

        {step.kind === "pick" && (
          <div className="grid md:grid-cols-2 gap-6">
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-[#B5607A] hover:bg-rose-50/30">
              <Upload className="w-8 h-8 text-[#B5607A]" />
              <span className="font-medium text-sm">Choose or record a video</span>
              <span className="text-xs text-muted-foreground">Up to {MAX_VIDEO_SECONDS / 60} minutes. The video stays on your device; only still frames are sent.</span>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void start(f);
                }}
              />
            </label>
            <div className="space-y-3 text-sm">
              <p className="font-medium">For the best results</p>
              <ul className="space-y-1.5 text-muted-foreground text-[13px] list-disc pl-5">
                <li>Show one item at a time, for 2 to 3 seconds each.</li>
                <li>Turn it to show the brand tag, size tag and any flaws.</li>
                <li>Good light and a plain background help a lot.</li>
                <li>Up to {MAX_ITEMS} items per video.</li>
              </ul>
              {ai && (
                <label className="flex items-center justify-between gap-3 pt-2">
                  <span>
                    Make clean AI photos
                    <span className="block text-[11px] text-muted-foreground">A studio-style photo from the best snip. Your real snips are always kept too.</span>
                  </span>
                  <Toggle label="Make clean AI photos" checked={makePhotos} onChange={() => setMakePhotos(!makePhotos)} />
                </label>
              )}
            </div>
          </div>
        )}

        {step.kind === "working" && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#B5607A]" />
            <p>{step.label}…</p>
            {step.progress != null && (
              <div className="w-64 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-[#B5607A] transition-all" style={{ width: `${Math.round(step.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {step.kind === "saving" && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#B5607A]" />
            <p>
              Saving drafts… {step.done} of {step.total}
            </p>
          </div>
        )}

        {step.kind === "review" && (
          <>
            {photosOff && <p className="text-xs text-muted-foreground">Clean AI photos aren't set up on this account yet, so your drafts use the snips from the video.</p>}
            <div className="grid gap-3">
              {drafts.map((d, n) => (
                <DraftCard key={d.id} n={n + 1} d={d} canAi={!!ai} patch={(p) => patch(d.id, p)} patchListing={(p) => patchListing(d.id, p)} retry={() => void writeListing(d)} remakePhoto={() => void makePhoto(d)} photosOff={photosOff} />
              ))}
            </div>
          </>
        )}
      </div>

      {step.kind === "review" && (
        <div className="px-5 sm:px-6 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <p className="text-xs text-muted-foreground flex-1">{busy ? "Writing listings… you can edit the finished ones meanwhile." : "Prices are suggestions. Check them before you list."}</p>
          <button type="button" className={secondaryButton} onClick={() => setStep({ kind: "pick" })}>
            Another video
          </button>
          <button type="button" className={primaryButton} disabled={!included || busy} onClick={() => void save()}>
            <Check className="w-4 h-4" /> Save {included} draft{included === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function DraftCard({
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
