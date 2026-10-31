import { useState } from "react";
import { AlertTriangle, Check, Clapperboard, Loader2, Upload } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { cropFrame, sampleVideo, shrinkImage } from "@/lib/videoFrames";
import type { DetectedItem, VideoDraft } from "@/lib/videoListing";
import { MAX_AI_FRAMES, MAX_ITEMS, MAX_VIDEO_SECONDS, cleanDetected, emptyListing, itemsFromScenes, pickFrames, splitScenes } from "@/lib/videoListing";
import { Modal, ModalHeader, Toggle, primaryButton, secondaryButton } from "../ui";
import { DraftCard } from "./DraftCard";
import { AI_IMAGE_SIDE, toAi, useListingDrafts } from "./useListingDrafts";

type Data = ReturnType<typeof useReshipData>;
type Step = { kind: "pick" } | { kind: "working"; label: string; progress?: number } | { kind: "review" } | { kind: "saving"; done: number; total: number };

// Film up to 25 items, get a draft listing for each: snips from the video, an optional clean AI
// photo, and the title, details and price filled in.
export function VideoListing({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: (message: string) => void }) {
  const { ai, drafts, setDrafts, patch, patchListing, writeListing, makePhoto, fill, save: saveDrafts, photosOff, cancelled, busy, included } = useListingDrafts(data, "List with a video");
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [makePhotos, setMakePhotos] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          const frames = await Promise.all(picked.map((i) => shrinkImage(video.images[i], AI_IMAGE_SIDE).then(toAi)));
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

      await fill(made, makePhotos);
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "pick" });
    }
  }

  async function save() {
    try {
      const n = await saveDrafts((done, total) => setStep({ kind: "saving", done, total }));
      onSaved(`Saved ${n} draft${n === 1 ? "" : "s"} from your video. Open one to check it, then list it everywhere.`);
    } catch (e) {
      setError((e as Error).message);
      setStep({ kind: "review" });
    }
  }

  const close = () => {
    cancelled.current = true;
    onClose();
  };

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
