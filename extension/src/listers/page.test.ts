// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mercariLister } from "./mercari";
import { delistStep, fillSellForm, type FillPayload } from "./page";
import { vintedLister } from "./vinted";

const payload = (over: Partial<FillPayload> = {}): FillPayload => ({
  fields: vintedLister.fields.map((f) => ({ ...f, value: { title: "Linen shirt", description: "Barely worn", price: "24" }[f.key] ?? "" })),
  photos: [],
  photoSelectors: vintedLister.photoSelectors,
  condition: "Very good",
  waitFor: "title",
  ...over,
});

describe("fillSellForm", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("waits until the form is drawn", () => {
    expect(fillSellForm(payload())).toBeNull();
  });

  it("fills fields by test id, by label, and picks the condition", () => {
    document.body.innerHTML = `
      <input data-testid="title--input" />
      <label for="d">Describe your item</label><textarea id="d"></textarea>
      <div><label>Price</label><input type="text" /></div>
      <ul><li>New with tags</li><li>Very good</li></ul>`;
    const seen: string[] = [];
    document.querySelector("input")!.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    const result = fillSellForm(payload());
    expect(result).toEqual({ filled: ["title", "description", "price", "condition"], missing: [] });
    expect(seen).toEqual(["Linen shirt"]);
    expect(document.querySelector("textarea")!.value).toBe("Barely worn");
    expect(document.querySelectorAll("input")[1].value).toBe("24");
  });

  it("reports what it couldn't find", () => {
    document.body.innerHTML = `<input name="title" />`;
    expect(fillSellForm(payload({ condition: undefined }))).toEqual({ filled: ["title"], missing: ["description", "price"] });
  });
});

describe("delistStep", () => {
  it("clicks through Mercari's deactivate steps, confirm dialog first", () => {
    document.body.innerHTML = `<button>Edit listing</button>`;
    const clicked: string[] = [];
    document.addEventListener("click", (e) => clicked.push((e.target as HTMLElement).textContent!));
    expect(delistStep(mercariLister.delist)).toBe("clicked");
    document.body.innerHTML = `<button>Save changes</button><button>Deactivate</button><div role="dialog"><button>Cancel</button><button>Deactivate</button></div>`;
    expect(delistStep(mercariLister.delist)).toBe("clicked");
    expect(clicked).toEqual(["Edit listing", "Deactivate"]);
  });

  it("knows when the listing is already down, gone or sold", () => {
    document.body.innerHTML = `<button>Activate</button>`;
    expect(delistStep(mercariLister.delist)).toBe("done");
    document.body.innerHTML = `<h1>This item is hidden</h1>`;
    expect(delistStep(vintedLister.delist)).toBe("done");
    document.body.innerHTML = `<h1>Page not found</h1>`;
    expect(delistStep(vintedLister.delist)).toBe("gone");
    document.body.innerHTML = `<div><span>Sold</span></div><button>Hide</button>`;
    expect(delistStep(vintedLister.delist)).toBe("sold");
  });

  it("waits when nothing matches yet", () => {
    document.body.innerHTML = `<p>Loading…</p>`;
    expect(delistStep(vintedLister.delist)).toBe("waiting");
  });
});
