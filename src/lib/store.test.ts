import { describe, expect, it } from "vitest";
import { chunks, fetchAllRows, mergeById } from "./store";

describe("fetchAllRows", () => {
  it("keeps reading pages until a short one comes back", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: String(i) }));
    const calls: [number, number][] = [];
    const query = () => ({
      range: async (from: number, to: number) => {
        calls.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      },
    });
    expect(await fetchAllRows(query)).toHaveLength(2345);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("passes errors on", async () => {
    const query = () => ({ range: async () => ({ data: null, error: { message: "nope" } }) });
    await expect(fetchAllRows(query)).rejects.toEqual({ message: "nope" });
  });
});

describe("chunks and mergeById", () => {
  it("splits big saves", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("puts new records first and replaces changed ones", () => {
    const merged = mergeById([{ id: "a", v: 1 }, { id: "b", v: 1 }], [{ id: "b", v: 2 }, { id: "c", v: 1 }]);
    expect(merged).toEqual([{ id: "c", v: 1 }, { id: "a", v: 1 }, { id: "b", v: 2 }]);
  });
});
