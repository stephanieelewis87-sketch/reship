// Functions that run inside a marketplace tab through chrome.scripting.executeScript. Each one
// must be self-contained: no imports and nothing from outside its own body, only its argument.

export interface FieldSpec {
  key: string; // shown back to the seller, e.g. "title"
  value: string;
  selectors: string[];
  labels: string[]; // regex sources matched against label, aria-label and placeholder text
}

export interface FillPayload {
  fields: FieldSpec[];
  photos: { name: string; dataUrl: string }[];
  photoSelectors: string[];
  // Text of the option to click for the item's condition, e.g. "Like new".
  condition?: string;
  // The form isn't drawn yet while this field can't be found.
  waitFor: string;
}

export interface FillResult {
  filled: string[];
  missing: string[];
}

// Fills a sell form the way typing would, so the marketplace's own page code sees every change.
// Returns null while the form hasn't appeared yet.
export function fillSellForm(p: FillPayload): FillResult | null {
  const visible = (el: HTMLElement) => !el.hidden && el.getAttribute("aria-hidden") !== "true";
  const textOf = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const find = (selectors: string[], labels: string[]): HTMLInputElement | HTMLTextAreaElement | null => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(s);
      if (el) return el;
    }
    const res = labels.map((l) => new RegExp(l, "i"));
    const inputs = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]):not([type=file]), textarea")];
    for (const re of res) {
      const direct = inputs.find((i) => re.test(i.getAttribute("aria-label") ?? "") || re.test(i.getAttribute("placeholder") ?? "") || re.test(i.name ?? ""));
      if (direct) return direct;
      for (const label of document.querySelectorAll("label")) {
        if (!re.test(textOf(label))) continue;
        const target =
          (label.htmlFor && document.getElementById(label.htmlFor)) ||
          label.querySelector("input, textarea") ||
          label.parentElement?.querySelector("input:not([type=hidden]):not([type=file]), textarea");
        if (target) return target as HTMLInputElement | HTMLTextAreaElement;
      }
    }
    return null;
  };
  const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    el.focus();
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  };

  const waitField = p.fields.find((f) => f.key === p.waitFor);
  if (waitField && !find(waitField.selectors, waitField.labels)) return null;

  const filled: string[] = [];
  const missing: string[] = [];
  for (const f of p.fields) {
    if (!f.value) continue;
    const el = find(f.selectors, f.labels);
    if (el) {
      setValue(el, f.value);
      filled.push(f.key);
    } else missing.push(f.key);
  }

  if (p.photos.length) {
    const input = p.photoSelectors.map((s) => document.querySelector<HTMLInputElement>(s)).find(Boolean);
    try {
      if (!input) throw new Error("no photo input");
      const dt = new DataTransfer();
      for (const photo of p.photos) {
        const [head, body] = photo.dataUrl.split(",");
        const type = head.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
        const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], photo.name, { type }));
      }
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      filled.push(`${p.photos.length} photo${p.photos.length === 1 ? "" : "s"}`);
    } catch {
      missing.push("photos");
    }
  }

  if (p.condition) {
    const want = p.condition.toLowerCase();
    const option = [...document.querySelectorAll<HTMLElement>("label, button, [role=radio], [role=option], [role=button], li")]
      .filter(visible)
      .find((el) => textOf(el).toLowerCase() === want);
    if (option) {
      option.click();
      filled.push("condition");
    } else missing.push("condition");
  }
  return { filled, missing };
}

export interface DelistSpec {
  // Button texts to click, in the order they appear (regex sources). The furthest step on screen is clicked.
  steps: string[];
  // Visible button text that means the listing is already down, e.g. "Activate".
  doneButton: string;
  // Page text that means the listing is already down.
  doneText: string;
  // Page text that means there's nothing to take down (deleted, not found).
  goneText: string;
}

export type DelistStepResult = "done" | "gone" | "sold" | "clicked" | "waiting";

// One step toward taking a listing down. Called about once a second until it says done or gone.
export function delistStep(spec: DelistSpec): DelistStepResult {
  const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const shown = (el: HTMLElement) => !el.hidden && el.getAttribute("aria-hidden") !== "true" && !(el as HTMLButtonElement).disabled;
  const buttons = [...document.querySelectorAll<HTMLElement>("button, [role=button], a")].filter(shown);
  const body = textOf(document.body);
  const doneButton = new RegExp(spec.doneButton, "i");
  if (buttons.some((b) => doneButton.test(textOf(b))) || new RegExp(spec.doneText, "i").test(body)) return "done";
  if (new RegExp(spec.goneText, "i").test(body)) return "gone";
  if ([...document.querySelectorAll<HTMLElement>("span, div, p")].some((el) => el.children.length === 0 && /^sold$/i.test(textOf(el)))) return "sold";
  for (let i = spec.steps.length - 1; i >= 0; i--) {
    const re = new RegExp(spec.steps[i], "i");
    const matches = buttons.filter((b) => re.test(textOf(b)));
    if (matches.length) {
      matches[matches.length - 1].click(); // a confirm dialog is drawn after the page's own button
      return "clicked";
    }
  }
  return "waiting";
}
