import { useEffect, useRef, useState } from "react";
import type { useReshipData } from "@/lib/useReshipData";
import type { AiImage } from "@/lib/store";
import { nextSku } from "@/lib/inventory";
import { shrinkImage, splitDataUrl } from "@/lib/videoFrames";
import type { ListingSuggestion, VideoDraft } from "@/lib/videoListing";
import { draftToItem, eachLimit, orderedPhotos, salesHints } from "@/lib/videoListing";

type Data = ReturnType<typeof useReshipData>;

export const AI_IMAGE_SIDE = 768;
export const toAi = (url: string): AiImage => splitDataUrl(url);

// The drafts behind List with a video and List from photos: AI writes each listing and,
// optionally, a clean photo; the seller edits; then they're saved as inventory drafts.
// photosPerItem is how many of an item's photos the AI reads when writing its listing.
export function useListingDrafts(data: Data, madeWith: string, photosPerItem = 4) {
  const ai = data.store.listingAi;
  const [drafts, setDrafts] = useState<VideoDraft[]>([]);
  const [photosOff, setPhotosOff] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => () => void (cancelled.current = true), []);

  const patch = (id: string, p: Partial<VideoDraft> | ((d: VideoDraft) => Partial<VideoDraft>)) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...(typeof p === "function" ? p(d) : p) } : d)));
  const patchListing = (id: string, p: Partial<ListingSuggestion>) => patch(id, (d) => ({ listing: { ...d.listing, ...p } }));

  async function writeListing(d: VideoDraft) {
    if (!ai || cancelled.current) return;
    patch(d.id, { state: "writing", error: undefined });
    try {
      const images = await Promise.all(d.snips.slice(0, photosPerItem).map((s) => shrinkImage(s, AI_IMAGE_SIDE).then(toAi)));
      const listing = await ai.describe(images, d.label, data.settings.aiInstructions, salesHints(data.inventory));
      patch(d.id, { listing, priceText: listing.price ? String(Math.round(listing.price.suggested)) : "", state: "done" });
    } catch (e) {
      patch(d.id, { state: "failed", error: (e as Error).message });
    }
  }

  // Returns false when AI photos aren't set up, so a batch can stop asking.
  async function makePhoto(d: VideoDraft): Promise<boolean> {
    if (!ai || cancelled.current) return false;
    const source = d.snips.includes(d.cover) ? d.cover : d.snips[0];
    patch(d.id, { aiPhotoState: "making" });
    try {
      const img = await ai.photo(toAi(await shrinkImage(source, 1024)), d.label);
      if (img === null) {
        setPhotosOff(true);
        patch(d.id, { aiPhotoState: undefined });
        return false;
      }
      // The clean photo becomes the cover unless the seller has since picked another one.
      patch(d.id, (cur) => ({ aiPhoto: img, aiPhotoState: undefined, cover: cur.cover === source ? img : cur.cover }));
    } catch {
      patch(d.id, { aiPhotoState: "failed" });
    }
    return true;
  }

  // Writes every listing, a few at a time, then the clean photos if asked.
  async function fill(made: VideoDraft[], withPhotos: boolean) {
    if (!ai) return;
    await eachLimit(made, 3, writeListing);
    if (!withPhotos) return;
    let on = true;
    await eachLimit(made, 2, async (d) => {
      if (on) on = await makePhoto(d);
    });
  }

  // Saves the included drafts to inventory and returns how many were saved.
  async function save(onProgress: (done: number, total: number) => void): Promise<number> {
    const chosen = drafts.filter((d) => d.include);
    onProgress(0, chosen.length);
    const items = [];
    let all = [...data.inventory];
    for (const [n, d] of chosen.entries()) {
      // Demo mode keeps photos in this browser, so they're kept small there.
      const photos = await Promise.all(orderedPhotos(d).slice(0, ai ? 8 : 3).map(async (p) => data.store.saveListingPhoto(ai ? p : await shrinkImage(p, 480))));
      const item = draftToItem(d, photos, nextSku(all), new Date(), madeWith);
      all = [...all, item];
      items.push(item);
      onProgress(n + 1, chosen.length);
    }
    data.saveInventory(items);
    return items.length;
  }

  const busy = drafts.some((d) => d.state === "writing" || d.state === "waiting");
  const included = drafts.filter((d) => d.include).length;

  return { ai, drafts, setDrafts, patch, patchListing, writeListing, makePhoto, fill, save, photosOff, cancelled, busy, included };
}
