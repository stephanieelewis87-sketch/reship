import { describe, expect, it } from "vitest";
import type { PhotoGroup, PhotoSample } from "./photoListing";
import { cleanGroups, groupByShoot, groupPhotos, mergeGroups, movePhotos, photoOrder, removePhotos, setCover } from "./photoListing";
import { draftToItem, emptyListing } from "./videoListing";

const flat = (shade: number) => Array.from({ length: 192 }, (_, i) => shade + (i % 3));
const photo = (name: string, time: number, shade = 100): PhotoSample => ({ name, time, sig: flat(shade) });

describe("photoOrder", () => {
  it("sorts by time, then by file name with numbers in order", () => {
    const order = photoOrder([
      { name: "IMG_10.jpg", time: 5 },
      { name: "IMG_9.jpg", time: 5 },
      { name: "IMG_1.jpg", time: 1 },
    ]);
    expect(order).toEqual([2, 1, 0]);
  });
});

describe("groupByShoot", () => {
  it("starts a new item after a long pause between shots", () => {
    // Three items, four shots each, a few seconds apart; a minute between items.
    const shots = [0, 1, 2].flatMap((item) => [0, 1, 2, 3].map((k) => photo(`IMG_${item * 4 + k}.jpg`, item * 60_000 + k * 3000)));
    const groups = groupByShoot(shots);
    expect(groups.map((g) => g.photos)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
    ]);
    expect(groups[0]).toMatchObject({ label: "Item 1", cover: 0 });
  });

  it("uses the pictures when every photo has the same time", () => {
    const shots = [20, 20, 22, 150, 151, 240].map((shade, i) => photo(`p${i}.jpg`, 1000, shade));
    expect(groupByShoot(shots).map((g) => g.photos)).toEqual([[0, 1, 2], [3, 4], [5]]);
  });

  it("puts the photos in shooting order whatever order they were picked in", () => {
    const shots = [photo("b.jpg", 90_000), photo("a.jpg", 0), photo("c.jpg", 93_000)];
    expect(groupByShoot(shots).map((g) => g.photos)).toEqual([[1], [0, 2]]);
  });

  it("stops at 25 items", () => {
    const shots = Array.from({ length: 30 }, (_, i) => photo(`p${i}.jpg`, i * 120_000));
    expect(groupByShoot(shots)).toHaveLength(25);
  });

  it("handles no photos", () => {
    expect(groupByShoot([])).toEqual([]);
  });
});

describe("cleanGroups", () => {
  it("drops bad photo numbers, keeps each photo in one item, and lists the leftovers", () => {
    const out = cleanGroups(
      [
        { label: " red dress ", photos: [3, 1, 99, -1], cover: 3 },
        { label: "", photos: [1, 2], cover: 7 },
        { label: "ghost", photos: [42], cover: 42 },
      ],
      6,
    );
    expect(out.groups).toEqual([
      { label: "red dress", photos: [3, 1], cover: 3 },
      { label: "Item 2", photos: [2], cover: 2 },
    ]);
    expect(out.left).toEqual([0, 4, 5]);
  });

  it("caps at 25 items", () => {
    const many: PhotoGroup[] = Array.from({ length: 30 }, (_, i) => ({ label: `thing ${i}`, photos: [i], cover: i }));
    const out = cleanGroups(many, 30);
    expect(out.groups).toHaveLength(25);
    expect(out.left).toEqual([25, 26, 27, 28, 29]);
  });
});

describe("fixing the sorting", () => {
  const groups: PhotoGroup[] = [
    { label: "jeans", photos: [0, 1, 2], cover: 0 },
    { label: "boots", photos: [3, 4], cover: 3 },
  ];

  it("moves photos to another item, keeping a cover in each", () => {
    const out = movePhotos(groups, [0, 2], 1);
    expect(out).toEqual([
      { label: "jeans", photos: [1], cover: 1 },
      { label: "boots", photos: [3, 4, 0, 2], cover: 3 },
    ]);
  });

  it("moves photos to a new item", () => {
    const out = movePhotos(groups, [4], "new");
    expect(out.map((g) => g.photos)).toEqual([[0, 1, 2], [3], [4]]);
    expect(out[2].cover).toBe(4);
  });

  it("removes an item once all its photos are moved out", () => {
    expect(movePhotos(groups, [3, 4], 0).map((g) => g.label)).toEqual(["jeans"]);
    expect(mergeGroups(groups, 1, 0)).toEqual([{ label: "jeans", photos: [0, 1, 2, 3, 4], cover: 0 }]);
  });

  it("takes photos out of use", () => {
    expect(removePhotos(groups, [0, 3, 4])).toEqual([{ label: "jeans", photos: [1, 2], cover: 1 }]);
  });

  it("sets the cover and puts it first", () => {
    const out = setCover(groups, 0, 2);
    expect(groupPhotos(out[0])).toEqual([2, 0, 1]);
    expect(setCover(groups, 0, 4)).toEqual(groups); // not that item's photo
  });
});

describe("draftToItem", () => {
  it("notes which tool made the draft", () => {
    const item = draftToItem(
      { id: "p0", include: true, label: "jeans", snips: ["a"], cover: "a", listing: { ...emptyListing(), title: "Levi's 501" }, priceText: "30", state: "done" },
      ["a"],
      "SKU-1",
      new Date("2026-10-31"),
      "List from photos",
    );
    expect(item.notes).toContain("Made with List from photos.");
    expect(item).toMatchObject({ title: "Levi's 501", listPrice: 30, status: "draft", readyToList: true });
  });
});
