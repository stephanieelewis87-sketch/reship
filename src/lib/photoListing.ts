import { MAX_ITEMS, frameDistance } from "./videoListing";

// "List from photos": the seller uploads a pile of photos of up to 25 items in one go, AI sorts
// them into one group per item, and each group becomes a draft listing. This file holds the parts
// that don't need a browser or the AI service, so they can be tested.

// Photos per batch. Enough for 25 items at four photos each, and within what the AI takes at once.
export const MAX_PHOTOS = 100;

// One uploaded photo. sig is a tiny color thumbnail used to tell items apart when AI is off.
export interface PhotoSample {
  name: string;
  time: number; // when the photo was taken or saved, in milliseconds
  sig: number[];
}

// One item: which photos show it (indexes into the batch) and which one makes the best cover.
export interface PhotoGroup {
  label: string;
  photos: number[];
  cover: number;
}

// Oldest first, then by file name, which is the order a phone takes them in.
export function photoOrder(samples: Pick<PhotoSample, "name" | "time">[]): number[] {
  return samples
    .map((_, i) => i)
    .sort((a, b) => samples[a].time - samples[b].time || samples[a].name.localeCompare(samples[b].name, undefined, { numeric: true }));
}

// When AI is off (demo mode), groups photos the way most sellers shoot: all of one item, then the
// next. A long pause between shots starts a new item. If the photos carry no useful times (all
// saved at once), a sharp change in the picture does instead.
export function groupByShoot(samples: PhotoSample[]): PhotoGroup[] {
  if (!samples.length) return [];
  const order = photoOrder(samples);
  const gaps = order.slice(1).map((p, i) => samples[p].time - samples[order[i]].time);
  const useTime = gaps.filter((g) => g > 1000).length >= Math.min(gaps.length, 2);
  let isCut: (k: number) => boolean;
  if (useTime) {
    // Several times the usual pause, but never less than 20 seconds or more than a minute and a half.
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
    const cutAt = Math.min(90_000, Math.max(20_000, median * 3));
    isCut = (k) => gaps[k] > cutAt;
  } else {
    const diffs = order.slice(1).map((p, i) => frameDistance(samples[order[i]].sig, samples[p].sig));
    const sorted = [...diffs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const cutAt = Math.max(0.15, median * 2.5);
    isCut = (k) => diffs[k] > cutAt;
  }
  const runs: number[][] = [[order[0]]];
  order.slice(1).forEach((p, k) => {
    if (isCut(k)) runs.push([p]);
    else runs[runs.length - 1].push(p);
  });
  return runs.slice(0, MAX_ITEMS).map((photos, n) => ({ label: `Item ${n + 1}`, photos, cover: photos[0] }));
}

// Keeps what the AI said within bounds: real photo numbers, each photo in one item only, 25 items
// at most. Photos the AI left out come back in `left` so the seller can place them.
export function cleanGroups(groups: PhotoGroup[], photoCount: number): { groups: PhotoGroup[]; left: number[] } {
  const used = new Set<number>();
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < photoCount;
  const out: PhotoGroup[] = [];
  for (const g of groups) {
    if (out.length >= MAX_ITEMS) break;
    const photos = [...new Set([g.cover, ...g.photos])].filter((i) => ok(i) && !used.has(i));
    if (!photos.length) continue;
    photos.forEach((i) => used.add(i));
    // Keep the photos in upload order, with the cover first.
    const cover = ok(g.cover) && photos.includes(g.cover) ? g.cover : Math.min(...photos);
    const rest = photos.filter((i) => i !== cover).sort((a, b) => a - b);
    out.push({ label: g.label?.trim() || `Item ${out.length + 1}`, photos: [cover, ...rest], cover });
  }
  const left = Array.from({ length: photoCount }, (_, i) => i).filter((i) => !used.has(i));
  return { groups: out, left };
}

// The seller's fixes on the sorting screen. Each returns new groups and leaves the old ones alone.

// Moves photos into item `to` (an index into groups), or into a new item when `to` is "new".
// Items left with no photos are removed.
export function movePhotos(groups: PhotoGroup[], photos: number[], to: number | "new"): PhotoGroup[] {
  const moving = new Set(photos);
  const target = to === "new" ? null : groups[to];
  const next = groups.map((g) => {
    const kept = g.photos.filter((p) => !moving.has(p));
    const photosNow = g === target ? [...kept, ...photos.filter((p) => !kept.includes(p))] : kept;
    return { ...g, photos: photosNow, cover: photosNow.includes(g.cover) ? g.cover : photosNow[0] };
  });
  if (to === "new" && photos.length) next.push({ label: `Item ${groups.length + 1}`, photos: [...photos], cover: photos[0] });
  return next.filter((g) => g.photos.length);
}

// Takes photos out of every item (they won't be used).
export function removePhotos(groups: PhotoGroup[], photos: number[]): PhotoGroup[] {
  const gone = new Set(photos);
  return groups
    .map((g) => {
      const kept = g.photos.filter((p) => !gone.has(p));
      return { ...g, photos: kept, cover: kept.includes(g.cover) ? g.cover : kept[0] };
    })
    .filter((g) => g.photos.length);
}

// Joins item `from` into item `into`.
export function mergeGroups(groups: PhotoGroup[], from: number, into: number): PhotoGroup[] {
  if (from === into || !groups[from] || !groups[into]) return groups;
  return movePhotos(groups, groups[from].photos, into);
}

export const setCover = (groups: PhotoGroup[], g: number, photo: number): PhotoGroup[] => groups.map((x, i) => (i === g && x.photos.includes(photo) ? { ...x, cover: photo } : x));

// The cover first, then the item's other photos.
export const groupPhotos = (g: PhotoGroup): number[] => [g.cover, ...g.photos.filter((p) => p !== g.cover)];
