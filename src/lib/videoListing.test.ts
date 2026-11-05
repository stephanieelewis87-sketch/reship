import { describe, expect, it } from "vitest";
import type { InventoryItem } from "./types";
import type { FrameSample, VideoDraft } from "./videoListing";
import { blockAverage, touchUpPixels } from "./videoFrames";
import { asCondition, cleanDetected, draftToItem, eachLimit, emptyListing, itemsFromScenes, orderedPhotos, padBox, pickFrames, salesHints, splitScenes } from "./videoListing";

// A frame whose thumbnail is one flat color, with a little noise so frames of the same item differ slightly.
const frame = (t: number, shade: number, sharpness = 10): FrameSample => ({ t, sig: Array.from({ length: 192 }, (_, i) => shade + (i % 3)), sharpness });

// Three items, each filmed for about 3 seconds, sampled every half second.
const video = (shades: number[], each = 6) => shades.flatMap((s, n) => Array.from({ length: each }, (_, k) => frame((n * each + k) * 0.5, s, k === 2 ? 50 : 10)));

describe("splitScenes", () => {
  it("finds a scene per item", () => {
    const scenes = splitScenes(video([20, 140, 240]));
    expect(scenes).toHaveLength(3);
    expect(scenes.map((s) => s.length)).toEqual([6, 6, 6]);
  });

  it("folds a short flash (a hand passing) into the scene before it", () => {
    const s = [...video([20], 6), frame(3, 250), ...video([20], 6).map((f) => ({ ...f, t: f.t + 3.5 }))];
    expect(splitScenes(s)).toHaveLength(1);
  });

  it("splits a handheld video that pans from item to item with no sharp cut", () => {
    // Three items, 10 seconds each, a shaky camera, and a 2-second pan between them.
    const shadeAt = (t: number) => {
      const items = [30, 130, 230];
      const n = Math.min(2, Math.floor(t / 10));
      const into = t - n * 10;
      const base = n > 0 && into < 2 ? items[n - 1] + ((items[n] - items[n - 1]) * into) / 2 : items[n];
      return base + 15 * Math.sin(t * 7.3);
    };
    const samples = Array.from({ length: 60 }, (_, k) => frame(k * 0.5, shadeAt(k * 0.5)));
    const scenes = splitScenes(samples);
    expect(scenes).toHaveLength(3);
    // Each cut lands during the pan to the next item (10–12s and 20–22s).
    const starts = scenes.map((s) => samples[s[0]].t);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThanOrEqual(10);
    expect(starts[1]).toBeLessThanOrEqual(12);
    expect(starts[2]).toBeGreaterThanOrEqual(20);
    expect(starts[2]).toBeLessThanOrEqual(22);
  });

  it("doesn't cut a steady shot of one item", () => {
    const samples = Array.from({ length: 40 }, (_, k) => frame(k * 0.5, 100 + 15 * Math.sin(k * 3.7)));
    expect(splitScenes(samples)).toHaveLength(1);
  });

  it("handles an empty video", () => {
    expect(splitScenes([])).toEqual([]);
  });
});

describe("pickFrames", () => {
  it("keeps the sharpest frame of every scene and stays under the cap", () => {
    const samples = video([20, 140, 240]);
    const scenes = splitScenes(samples);
    const picked = pickFrames(samples, scenes, 5);
    expect(picked.length).toBeLessThanOrEqual(5);
    // Sample 2 of each scene is the sharp one.
    expect(picked).toEqual(expect.arrayContaining([2, 8, 14]));
    expect([...picked].sort((a, b) => a - b)).toEqual(picked);
  });
});

describe("itemsFromScenes", () => {
  it("makes one item per scene, using the frames that were picked", () => {
    const samples = video([20, 140, 240]);
    const scenes = splitScenes(samples);
    const picked = pickFrames(samples, scenes, 6);
    const items = itemsFromScenes(scenes, picked);
    expect(items.map((i) => i.label)).toEqual(["Item 1", "Item 2", "Item 3"]);
    items.forEach((i) => expect(i.frames.length).toBeGreaterThan(0));
  });
});

describe("cleanDetected", () => {
  it("drops bad frame numbers, fixes boxes, and caps at 25 items", () => {
    const many = Array.from({ length: 30 }, (_, n) => ({ label: `thing ${n}`, frames: [0, 1, 99], bestFrame: 1, box: { x: 0.9, y: -0.2, w: 0.5, h: 0.5 } }));
    const out = cleanDetected(many, 4);
    expect(out).toHaveLength(25);
    expect(out[0].frames).toEqual([0, 1]);
    expect(out[0].box).toEqual({ x: 0.9, y: 0, w: expect.closeTo(0.1, 5), h: 0.5 });
  });

  it("uses the first good frame when the best one is out of range, and drops items with none", () => {
    const out = cleanDetected(
      [
        { label: " jeans ", frames: [2, 3], bestFrame: 12 },
        { label: "ghost", frames: [50], bestFrame: 50 },
      ],
      4,
    );
    expect(out).toEqual([{ label: "jeans", frames: [2, 3], bestFrame: 2, box: undefined }]);
  });

  it("ignores a box too thin to crop", () => {
    expect(cleanDetected([{ label: "x", frames: [0], bestFrame: 0, box: { x: 0.1, y: 0.1, w: 0.01, h: 0.5 } }], 1)[0].box).toBeUndefined();
  });
});

describe("padBox", () => {
  it("grows the box but keeps it inside the frame", () => {
    const b = padBox({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(b.x).toBe(0);
    expect(b.y).toBeCloseTo(0.46);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y + b.h).toBeLessThanOrEqual(1);
  });
});

const sold = (brand: string, category: string, price: number): InventoryItem => ({
  id: crypto.randomUUID(),
  sku: "S",
  title: "t",
  brand,
  category,
  listPrice: price,
  status: "sold",
  listings: [{ platform: "Poshmark", status: "sold", price }],
});

describe("salesHints", () => {
  it("gives median sold prices for brands and categories sold at least twice", () => {
    const hints = salesHints([sold("Lululemon", "Leggings", 40), sold("Lululemon", "Leggings", 60), sold("Lululemon", "Tops", 30), sold("Zara", "Tops", 10)]);
    expect(hints).toContain("Brand Lululemon: 3 sold, median $40");
    expect(hints).toContain("Category Leggings: 2 sold, median $50");
    expect(hints.some((h) => h.includes("Zara"))).toBe(false);
  });
});

const draft = (p: Partial<VideoDraft> = {}): VideoDraft => ({
  id: "v0",
  include: true,
  label: "black leggings",
  snips: ["data:snip1", "data:snip2"],
  cover: "data:snip1",
  listing: {
    ...emptyListing(),
    title: "Lululemon Align Leggings 25in Black Size 6",
    description: "Buttery soft.",
    brand: "Lululemon",
    condition: "Like new",
    tags: ["yoga pants", "align"],
    flaws: "light pilling at thighs",
    price: { suggested: 58, low: 45, high: 65, reasoning: "Align leggings in like-new condition sell for $45 to $65." },
    confidence: "high",
  },
  priceText: "58",
  state: "done",
  ...p,
});

describe("draftToItem", () => {
  it("makes a draft inventory item with the listing, price, photos and notes", () => {
    const d = draft({ aiPhoto: "data:ai", cover: "data:ai" });
    const item = draftToItem(d, orderedPhotos(d), "RS-1001");
    expect(item).toMatchObject({
      sku: "RS-1001",
      title: "Lululemon Align Leggings 25in Black Size 6",
      brand: "Lululemon",
      condition: "Like new",
      listPrice: 58,
      status: "draft",
      listings: [],
      photo: "data:ai",
      photos: ["data:ai", "data:snip1", "data:snip2"],
      readyToList: true,
    });
    expect(item.description).toBe("Buttery soft.\n\n#yogapants #align");
    expect(item.notes).toContain("Flaws: light pilling at thighs");
  });

  it("isn't ready to list without a title or price", () => {
    const item = draftToItem(draft({ priceText: "", listing: { ...emptyListing() } }), ["data:snip1"], "RS-1002");
    expect(item.title).toBe("black leggings");
    expect(item.listPrice).toBeUndefined();
    expect(item.readyToList).toBe(false);
  });
});

describe("asCondition", () => {
  it("matches the app's conditions regardless of case", () => {
    expect(asCondition("like new")).toBe("Like new");
    expect(asCondition("Mint")).toBeUndefined();
  });
});

describe("eachLimit", () => {
  it("runs everything, a few at a time, past failures", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await eachLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (n === 3) throw new Error("boom");
      done.push(n);
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 4, 5]);
  });
});

describe("blockAverage", () => {
  it("averages each block of the image into one thumbnail cell", () => {
    // A 4x4 image: left half black, right half white, shrunk to 2x2.
    const px: number[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) px.push(...(x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(blockAverage(px, 4, 2)).toEqual([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]);
  });
});

describe("itemsFromScenes covers", () => {
  it("uses the sharpest frame from the middle of the scene, not the blurry pan at its start", () => {
    // One 5-second scene; the sharpest frame (t=0) is the camera arriving, the best middle one is t=2.5.
    const sharp = [90, 10, 20, 30, 40, 60, 35, 25, 15, 12, 80];
    const samples = sharp.map((s, k) => frame(k * 0.5, 100, s));
    const ids = samples.map((_, k) => k);
    const [item] = itemsFromScenes([ids], ids, samples);
    expect(item.bestFrame).toBe(5);
    expect(item.frames.slice(0, 3)).toEqual([5, 4, 6]);
  });
});

describe("touchUpPixels", () => {
  // A w×h image from a function giving each pixel's [r, g, b].
  const img = (w: number, h: number, f: (x: number, y: number) => number[]) => {
    const px: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(...f(x, y), 255);
    return px;
  };
  const meanOf = (px: ArrayLike<number>, c: number) => {
    let s = 0;
    for (let i = c; i < px.length; i += 4) s += px[i];
    return s / (px.length / 4);
  };

  it("brightens a dim, flat video frame", () => {
    const dim = img(20, 20, (x, y) => Array(3).fill(30 + ((x + y) % 10) * 6));
    expect(meanOf(touchUpPixels(dim, 20, 20), 1)).toBeGreaterThan(meanOf(dim, 1) * 1.2);
  });

  it("takes out most of a yellow light cast", () => {
    const yellow = img(20, 20, (x) => [150 + x, 140 + x, 90 + x]);
    const out = touchUpPixels(yellow, 20, 20);
    expect(meanOf(out, 0) - meanOf(out, 2)).toBeLessThan(meanOf(yellow, 0) - meanOf(yellow, 2));
  });

  it("leaves a well-lit, balanced photo nearly as it was", () => {
    const good = img(20, 20, (x, y) => Array(3).fill(10 + ((x * 20 + y) % 236)));
    const out = touchUpPixels(good, 20, 20);
    for (let c = 0; c < 3; c++) expect(Math.abs(meanOf(out, c) - meanOf(good, c))).toBeLessThan(8);
  });
});
