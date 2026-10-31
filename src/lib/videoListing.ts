import type { Condition, InventoryItem } from "./types";
import { CONDITIONS } from "./types";

// "List with a video": the seller films up to 25 items, Reship finds each one, keeps snips from
// the video, and fills in a draft listing with a suggested price. This file holds the parts that
// don't need a browser or the AI service, so they can be tested.

export const MAX_ITEMS = 25;
export const MAX_VIDEO_SECONDS = 5 * 60;
// Frames sent to the AI to find the items. Enough for 25 items at two or three looks each.
export const MAX_AI_FRAMES = 60;

// One frame sampled from the video. sig is a tiny color thumbnail used to spot cuts between items;
// sharpness picks the clearest frame nearby.
export interface FrameSample {
  t: number; // seconds into the video
  sig: number[];
  sharpness: number;
}

// Where an item sits in a frame, as fractions of the frame's width and height.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// What the AI (or the scene split, when AI is off) found in the video.
export interface DetectedItem {
  label: string; // short name, e.g. "black Lululemon leggings"
  frames: number[]; // indexes into the frames that were sent
  bestFrame: number;
  box?: Box;
}

export interface PriceSuggestion {
  suggested: number;
  low: number;
  high: number;
  reasoning: string;
}

// The listing the AI writes for one item.
export interface ListingSuggestion {
  title: string;
  description: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
  condition?: Condition;
  tags: string[];
  price?: PriceSuggestion;
  flaws?: string; // anything a buyer should know, also kept in private notes
  confidence: "high" | "medium" | "low";
}

// The difference between two frame thumbnails, from 0 (same) to 1.
export function frameDistance(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

// Splits the video where the picture changes sharply, which is usually where the seller moves to
// the next item. Returns runs of sample indexes. Very short runs (a hand passing by) are merged
// into the run before them.
export function splitScenes(samples: FrameSample[], minSeconds = 1.2): number[][] {
  if (!samples.length) return [];
  const diffs = samples.slice(1).map((s, i) => frameDistance(samples[i].sig, s.sig));
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cutAt = Math.max(0.12, median * 4);
  const runs: number[][] = [[0]];
  diffs.forEach((d, i) => {
    if (d > cutAt) runs.push([i + 1]);
    else runs[runs.length - 1].push(i + 1);
  });
  const span = (r: number[]) => samples[r[r.length - 1]].t - samples[r[0]].t;
  const merged: number[][] = [];
  for (const r of runs) {
    if (merged.length && span(r) < minSeconds) merged[merged.length - 1].push(...r);
    else merged.push([...r]);
  }
  // A short first run gets folded into the next one instead.
  if (merged.length > 1 && span(merged[0]) < minSeconds) merged.splice(0, 2, [...merged[0], ...merged[1]]);
  // After a flash the camera comes back to the same item: join runs that look alike across the cut.
  const joined: number[][] = [];
  for (const r of merged) {
    const prev = joined[joined.length - 1];
    const near = prev && Math.min(...prev.slice(-3).map((i) => frameDistance(samples[i].sig, samples[r[0]].sig))) <= cutAt;
    if (near) prev.push(...r);
    else joined.push(r);
  }
  return joined;
}

// Picks which samples to send to the AI: the sharpest sample in each slice of the video, plus the
// sharpest of every scene so no item is skipped. Returns sample indexes in time order.
export function pickFrames(samples: FrameSample[], scenes: number[][], max = MAX_AI_FRAMES): number[] {
  if (!samples.length) return [];
  const sharpest = (ids: number[]) => ids.reduce((best, i) => (samples[i].sharpness > samples[best].sharpness ? i : best), ids[0]);
  const chosen = new Set<number>(scenes.map(sharpest));
  const slots = Math.max(0, max - chosen.size);
  const per = samples.length / Math.max(1, slots);
  for (let s = 0; s < slots && chosen.size < max; s++) {
    const from = Math.floor(s * per);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((s + 1) * per)));
    const ids = Array.from({ length: to - from }, (_, k) => from + k);
    if (ids.length) chosen.add(sharpest(ids));
  }
  return [...chosen].sort((a, b) => a - b).slice(0, max);
}

// When AI is off (demo mode) each scene becomes one item, so the seller still gets a draft per item
// with its snips and fills in the words.
export function itemsFromScenes(scenes: number[][], picked: number[]): DetectedItem[] {
  const pos = new Map(picked.map((s, i) => [s, i]));
  return scenes
    .map((run, n) => {
      const frames = run.filter((s) => pos.has(s)).map((s) => pos.get(s)!);
      return { label: `Item ${n + 1}`, frames, bestFrame: frames[0] };
    })
    .filter((i) => i.frames.length)
    .slice(0, MAX_ITEMS);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

// Keeps what the AI said within bounds: real frame numbers, boxes inside the picture, 25 items at most.
export function cleanDetected(items: DetectedItem[], frameCount: number): DetectedItem[] {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < frameCount;
  return items
    .map((it): DetectedItem | null => {
      const frames = [...new Set(it.frames.filter(ok))];
      const bestFrame = ok(it.bestFrame) ? it.bestFrame : frames[0];
      if (bestFrame == null) return null;
      if (!frames.includes(bestFrame)) frames.unshift(bestFrame);
      let box: Box | undefined;
      if (it.box) {
        const x = clamp01(it.box.x);
        const y = clamp01(it.box.y);
        const w = Math.min(clamp01(it.box.w), 1 - x);
        const h = Math.min(clamp01(it.box.h), 1 - y);
        // A sliver isn't a useful crop; fall back to the whole frame.
        if (w > 0.05 && h > 0.05) box = { x, y, w, h };
      }
      return { label: it.label.trim() || "Item", frames, bestFrame, box };
    })
    .filter((x): x is DetectedItem => !!x)
    .slice(0, MAX_ITEMS);
}

// Grows a box a little so the crop doesn't cut into the item, keeping it inside the frame.
export function padBox(b: Box, pad = 0.08): Box {
  const x = Math.max(0, b.x - b.w * pad);
  const y = Math.max(0, b.y - b.h * pad);
  return { x, y, w: Math.min(1 - x, b.w * (1 + 2 * pad)), h: Math.min(1 - y, b.h * (1 + 2 * pad)) };
}

// What the seller's own sales say about prices, so suggestions fit their market. Short on purpose:
// the median sold price for their most common brands and categories.
export function salesHints(inventory: InventoryItem[], limit = 12): string[] {
  const sold = inventory.filter((i) => i.status === "sold" && (i.listPrice ?? 0) > 0);
  const groups = new Map<string, number[]>();
  const add = (key: string, price: number) => groups.set(key, [...(groups.get(key) ?? []), price]);
  for (const i of sold) {
    const price = i.listings.find((l) => l.status === "sold")?.price ?? i.listPrice!;
    if (i.brand) add(`Brand ${i.brand}`, price);
    if (i.category) add(`Category ${i.category}`, price);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  return [...groups]
    .filter(([, xs]) => xs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([k, xs]) => `${k}: ${xs.length} sold, median $${Math.round(median(xs))}`);
}

export const asCondition = (s?: string): Condition | undefined => CONDITIONS.find((c) => c.toLowerCase() === s?.trim().toLowerCase());

// A draft the seller reviews before it's saved. From a video, snips are cut from it; from photos,
// they're the seller's own photos of the item.
export interface VideoDraft {
  id: string;
  include: boolean;
  label: string;
  snips: string[]; // image data URLs cut from the video
  aiPhoto?: string; // clean product photo made by AI from the best snip
  aiPhotoState?: "making" | "failed";
  cover: string; // which photo shows first
  listing: ListingSuggestion;
  priceText: string;
  state: "waiting" | "writing" | "done" | "failed";
  error?: string;
}

// Turns a reviewed draft into an inventory item. It's saved as a draft, ready to crosslist.
// madeWith names the tool in the item's notes ("List with a video" or "List from photos").
export function draftToItem(d: VideoDraft, photos: string[], sku: string, now = new Date(), madeWith = "List with a video"): InventoryItem {
  const l = d.listing;
  const price = parseFloat(d.priceText);
  const notes = [l.flaws && `Flaws: ${l.flaws}`, l.price?.reasoning && `Price note: ${l.price.reasoning}`, `Made with ${madeWith}.`].filter(Boolean).join("\n");
  return {
    id: crypto.randomUUID(),
    sku,
    title: l.title.trim() || d.label,
    description: [l.description.trim(), l.tags.length ? l.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ") : ""].filter(Boolean).join("\n\n") || undefined,
    brand: l.brand || undefined,
    category: l.category || undefined,
    size: l.size || undefined,
    color: l.color || undefined,
    condition: l.condition,
    quantity: 1,
    listPrice: Number.isFinite(price) && price > 0 ? price : undefined,
    status: "draft",
    listings: [],
    photos,
    photo: photos[0],
    notes,
    readyToList: !!l.title.trim() && Number.isFinite(price) && price > 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// Cover first, then the rest without repeats.
export const orderedPhotos = (d: VideoDraft) => [...new Set([d.cover, ...(d.aiPhoto ? [d.aiPhoto] : []), ...d.snips].filter(Boolean))];

export const emptyListing = (): ListingSuggestion => ({ title: "", description: "", tags: [], confidence: "low" });

// Runs async jobs a few at a time, in order, and keeps going when one fails.
export async function eachLimit<T>(items: T[], limit: number, run: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        await run(items[i], i);
      } catch {
        // The job records its own failure; the rest carry on.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
