import { describe, expect, it } from "vitest";
import type { InventoryItem } from "./types";
import type { FrameSample, VideoDraft } from "./videoListing";
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
