import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FolderInput, Images, Loader2, Plus, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { readPhoto, shrinkImage } from "@/lib/videoFrames";
import type { VideoDraft } from "@/lib/videoListing";
import { MAX_ITEMS, emptyListing } from "@/lib/videoListing";
import type { PhotoGroup, PhotoSample } from "@/lib/photoListing";
import { MAX_PHOTOS, cleanGroups, groupByShoot, groupPhotos, movePhotos, photoOrder, removePhotos, setCover } from "@/lib/photoListing";
import { Modal, ModalHeader, Toggle, primaryButton, secondaryButton } from "../ui";
import { DraftCard } from "./DraftCard";
import { toAi, useListingDrafts } from "./useListingDrafts";

type Data = ReturnType<typeof useReshipData>;
type Step =
  | { kind: "pick" }
  | { kind: "working"; label: string; progress?: number }
  | { kind: "sort" }
  | { kind: "review" }
  | { kind: "saving"; done: number; total: number };

const GROUP_IMAGE_SIDE = 512;
const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Upload photos of up to 25 items in one go. AI sorts them into one group per item, the seller
// fixes anything it got wrong, and each group becomes a draft listing with its price filled in.
export function PhotoListing({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: (message: string) => void }) {
  const { ai, drafts, setDrafts, patch, patchListing, writeListing, makePhoto, fill, save: saveDrafts, photosOff, cancelled, busy, included } = useListingDrafts(data, "List from photos", 6);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [images, setImages] = useState<string[]>([]);
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [left, setLeft] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [makePhotos, setMakePhotos] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function start(fileList: FileList | File[]) {
    setError(null);
    setNotice(null);
    cancelled.current = false;
    const files = [...fileList].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return setError("Those weren't photos. Pick JPG, PNG or HEIC photos of your items.");
    const notes: string[] = [];
    // Take them in the order they were shot; past the cap, the latest ones are left for the next batch.
    const ordered = photoOrder(files.map((f) => ({ name: f.name, time: f.lastModified }))).map((i) => files[i]);
    const batch = ordered.slice(0, MAX_PHOTOS);
    if (ordered.length > MAX_PHOTOS) notes.push(`You picked ${ordered.length} photos. Reship took the first ${MAX_PHOTOS}; add the other ${ordered.length - MAX_PHOTOS} in your next batch.`);

    try {
      setStep({ kind: "working", label: "Reading your photos", progress: 0 });
      const read: string[] = [];
      const samples: PhotoSample[] = [];
      const failed: string[] = [];
      for (const [n, f] of batch.entries()) {
        try {
          const p = await readPhoto(f);
          read.push(p.image);
          samples.push({ name: f.name, time: f.lastModified, sig: p.sig });
        } catch {
          failed.push(f.name);
        }
        if (cancelled.current) return;
        setStep({ kind: "working", label: "Reading your photos", progress: (n + 1) / batch.length });
      }
      if (failed.length) notes.push(`${s(failed.length, "photo")} couldn't be opened in this browser (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}). HEIC photos open in Safari; elsewhere, export them as JPG.`);
      if (!read.length) throw new Error("None of these photos could be opened in this browser. Try JPG or PNG.");

      let found: { groups: PhotoGroup[]; left: number[] } | null = null;
      if (ai) {
        setStep({ kind: "working", label: `Sorting ${s(read.length, "photo")} into items` });
        try {
          const small = await Promise.all(read.map((img) => shrinkImage(img, GROUP_IMAGE_SIDE).then(toAi)));
          found = cleanGroups(await ai.group(small), read.length);
          if (!found.groups.length) {
            found = null;
            notes.push("The AI didn't spot any items, so Reship grouped your photos by when they were taken.");
          }
        } catch (e) {
          notes.push(`${(e as Error).message} Reship grouped your photos by when they were taken instead.`);
        }
      } else {
        notes.push("AI is off in demo mode, so Reship grouped your photos by when they were taken. With your Reship account, AI sorts them by item, then names, describes and prices each one.");
      }
      if (!found) {
        const g = groupByShoot(samples);
        const used = new Set(g.flatMap((x) => x.photos));
        found = { groups: g, left: samples.map((_, i) => i).filter((i) => !used.has(i)) };
      }
      if (cancelled.current) return;
      setImages(read);
      setGroups(found.groups);
      setLeft(found.left);
      setSelected([]);
      setNotice(notes.join(" ") || null);
      setStep({ kind: "sort" });
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "pick" });
    }
  }

  // The seller's fixes on the sorting screen. Photos not in any item go to "Not used".
  const apply = (next: PhotoGroup[]) => {
    const used = new Set(next.flatMap((g) => g.photos));
    setGroups(next);
    setLeft(images.map((_, i) => i).filter((i) => !used.has(i)));
    setSelected([]);
  };
  const toggle = (p: number) => setSelected((sel) => (sel.includes(p) ? sel.filter((x) => x !== p) : [...sel, p]));

  async function writeAll() {
    const made: VideoDraft[] = groups.map((g, n) => {
      const photos = groupPhotos(g).map((i) => images[i]);
      return {
        id: `p${n}`,
        include: true,
        label: g.label,
        snips: photos,
        cover: photos[0],
        listing: { ...emptyListing(), title: ai ? "" : g.label },
        priceText: "",
        state: ai ? "waiting" : "done",
      };
    });
    setDrafts(made);
    setStep({ kind: "review" });
    await fill(made, makePhotos);
  }

  async function save() {
    try {
      const n = await saveDrafts((done, total) => setStep({ kind: "saving", done, total }));
      onSaved(`Saved ${s(n, "draft")} from your photos. Open one to check it, then list it everywhere.`);
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "review" });
    }
  }

  const close = () => {
    cancelled.current = true;
    onClose();
  };
  const canClose = step.kind === "pick" || step.kind === "sort" || step.kind === "review";
  const subtitle =
    step.kind === "sort"
      ? `${s(images.length, "photo")} sorted into ${s(groups.length, "item")}. Fix anything that's in the wrong place, then write the listings.`
      : step.kind === "review"
        ? `${s(drafts.length, "item")}. Check each one, then save them as drafts.`
        : `Upload photos of up to ${MAX_ITEMS} items at once. Reship sorts them by item and writes each listing.`;

  return (
    <Modal onClose={canClose ? close : () => {}} maxWidth="max-w-5xl" label="List from photos">
      <ModalHeader title="List from photos" subtitle={subtitle} onClose={close} icon={<Images className="w-5 h-5 text-[#B5607A]" />} />
      <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-4">
        {error && (
          <div className="flex gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {notice && step.kind !== "pick" && <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900">{notice}</div>}

        {step.kind === "pick" && (
          <div className="grid md:grid-cols-2 gap-6">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void start(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-[#B5607A] hover:bg-rose-50/30 ${dragging ? "border-[#B5607A] bg-rose-50/40" : "border-border"}`}
            >
              <Upload className="w-8 h-8 text-[#B5607A]" />
              <span className="font-medium text-sm">Choose photos, or drop them here</span>
              <span className="text-xs text-muted-foreground">
                Up to {MAX_PHOTOS} photos of up to {MAX_ITEMS} items. Pick them all at once from your camera roll.
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files;
                  const files = f ? [...f] : [];
                  e.target.value = "";
                  if (files.length) void start(files);
                }}
              />
            </label>
            <div className="space-y-3 text-sm">
              <p className="font-medium">For the best results</p>
              <ul className="space-y-1.5 text-muted-foreground text-[13px] list-disc pl-5">
                <li>Shoot one item at a time: front, back, brand tag, size tag and any flaws.</li>
                <li>Start each item with a full photo of it. That's usually the cover.</li>
                <li>Good light and a plain background help a lot.</li>
                <li>You can fix the sorting before any listing is written.</li>
              </ul>
              {ai && (
                <label className="flex items-center justify-between gap-3 pt-2">
                  <span>
                    Also make clean AI photos
                    <span className="block text-[11px] text-muted-foreground">A studio-style photo from each cover. Your own photos are always kept too.</span>
                  </span>
                  <Toggle label="Also make clean AI photos" checked={makePhotos} onChange={() => setMakePhotos(!makePhotos)} />
                </label>
              )}
            </div>
          </div>
        )}

        {(step.kind === "working" || step.kind === "saving") && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-[#B5607A]" />
            <p>{step.kind === "saving" ? `Saving drafts… ${step.done} of ${step.total}` : `${step.label}…`}</p>
            {step.kind === "working" && step.progress != null && (
              <div className="w-64 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-[#B5607A] transition-all" style={{ width: `${Math.round(step.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {step.kind === "sort" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Tap photos to select them, then move them to another item or a new one. The starred photo is the cover.</p>
            {groups.map((g, gi) => (
              <div key={gi} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2 mb-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{gi + 1}</span>
                  <input
                    aria-label={`Name of item ${gi + 1}`}
                    value={g.label}
                    onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, label: e.target.value } : x)))}
                    className="flex-1 min-w-0 bg-transparent font-medium focus:outline-none focus:ring-1 focus:ring-[#B5607A] rounded px-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">{s(g.photos.length, "photo")}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {groupPhotos(g).map((p) => (
                    <Thumb key={p} src={images[p]} selected={selected.includes(p)} cover={p === g.cover} onToggle={() => toggle(p)} onCover={() => setGroups(setCover(groups, gi, p))} />
                  ))}
                  {selected.length > 0 && !selected.every((p) => g.photos.includes(p)) && (
                    <button
                      type="button"
                      onClick={() => apply(movePhotos(groups, selected, gi))}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-[#B5607A] text-[#B5607A] text-[11px] font-medium flex flex-col items-center justify-center gap-1 hover:bg-rose-50"
                    >
                      <FolderInput className="w-4 h-4" /> Move here
                    </button>
                  )}
                </div>
              </div>
            ))}
            {left.length > 0 && (
              <div className="rounded-xl border border-dashed border-border p-3">
                <p className="text-sm font-medium mb-2">
                  Not used <span className="text-xs font-normal text-muted-foreground">These won't be in any listing. Select them to move them to an item.</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {left.map((p) => (
                    <Thumb key={p} src={images[p]} selected={selected.includes(p)} onToggle={() => toggle(p)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step.kind === "review" && (
          <>
            {photosOff && <p className="text-xs text-muted-foreground">Clean AI photos aren't set up on this account yet, so your drafts use your own photos.</p>}
            <div className="grid gap-3">
              {drafts.map((d, n) => (
                <DraftCard key={d.id} n={n + 1} d={d} canAi={!!ai} patch={(p) => patch(d.id, p)} patchListing={(p) => patchListing(d.id, p)} retry={() => void writeListing(d)} remakePhoto={() => void makePhoto(d)} photosOff={photosOff} />
              ))}
            </div>
          </>
        )}
      </div>

      {step.kind === "sort" && (
        <div className="px-5 sm:px-6 py-3 border-t border-border flex flex-wrap items-center gap-2 shrink-0">
          {selected.length > 0 ? (
            <>
              <p className="text-xs flex-1 min-w-40">
                <span className="font-medium">{s(selected.length, "photo")} selected.</span> <span className="text-muted-foreground">Tap "Move here" on an item, or:</span>
              </p>
              <button type="button" className={secondaryButton} onClick={() => setSelected([])}>
                <X className="w-4 h-4" /> Clear
              </button>
              <button type="button" className={secondaryButton} onClick={() => apply(removePhotos(groups, selected))}>
                <Trash2 className="w-4 h-4" /> Don't use
              </button>
              <button type="button" className={secondaryButton} disabled={groups.length >= MAX_ITEMS && !groups.some((g) => g.photos.every((p) => selected.includes(p)))} onClick={() => apply(movePhotos(groups, selected, "new"))}>
                <Plus className="w-4 h-4" /> New item
              </button>
            </>
          ) : (
            <>
              <button type="button" className={secondaryButton} onClick={() => setStep({ kind: "pick" })}>
                <ArrowLeft className="w-4 h-4" /> Other photos
              </button>
              <p className="text-xs text-muted-foreground flex-1">{ai ? "Next, AI writes each listing with a suggested price." : "Next, you'll get a draft for each item to fill in."}</p>
              <button type="button" className={primaryButton} disabled={!groups.length} onClick={() => void writeAll()}>
                <Sparkles className="w-4 h-4" /> {ai ? `Write ${s(groups.length, "listing")}` : `Make ${s(groups.length, "draft")}`}
              </button>
            </>
          )}
        </div>
      )}

      {step.kind === "review" && (
        <div className="px-5 sm:px-6 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <p className="text-xs text-muted-foreground flex-1">{busy ? "Writing listings… you can edit the finished ones meanwhile." : "Prices are suggestions. Check them before you list."}</p>
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => setStep({ kind: "sort" })}>
            <ArrowLeft className="w-4 h-4" /> Sorting
          </button>
          <button type="button" className={primaryButton} disabled={!included || busy} onClick={() => void save()}>
            <Check className="w-4 h-4" /> Save {s(included, "draft")}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Thumb({ src, selected, cover, onToggle, onCover }: { src: string; selected: boolean; cover?: boolean; onToggle: () => void; onCover?: () => void }) {
  return (
    <div className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 group ${selected ? "border-[#B5607A]" : "border-transparent"}`}>
      <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={selected ? "Unselect photo" : "Select photo"} className="w-full h-full">
        <img src={src} alt="" className={`w-full h-full object-cover ${selected ? "opacity-70" : ""}`} />
      </button>
      {selected && (
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#B5607A] text-white flex items-center justify-center pointer-events-none">
          <Check className="w-3 h-3" />
        </span>
      )}
      {onCover && (
        <button
          type="button"
          onClick={onCover}
          aria-label={cover ? "Cover photo" : "Make this the cover"}
          title={cover ? "Cover photo" : "Make this the cover"}
          className={`absolute bottom-1 right-1 p-0.5 rounded bg-white/90 ${cover ? "" : "opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"}`}
        >
          <Star className={`w-3 h-3 ${cover ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
        </button>
      )}
    </div>
  );
}
