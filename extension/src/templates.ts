// Content script for Poshmark and Depop: when the seller clicks into a comment or message box, a
// small SellSync button appears beside it. Picking a template types it into the box. The seller
// reads it and presses Post or Send; this script never submits anything, never reads other
// shoppers' data, and does nothing until the seller clicks.
import type { Platform } from "../../src/lib/types";
import { CONTEXT_LABEL, fillTemplate, type MessageContext, type MessageTemplate } from "../../src/lib/messaging";

export function platformFor(host: string): Platform | null {
  if (/(^|\.)poshmark\.com$/.test(host)) return "Poshmark";
  if (/(^|\.)depop\.com$/.test(host)) return "Depop";
  return null;
}

// Which kinds of templates fit the page: Poshmark order pages are for that buyer's order, other
// Poshmark comment boxes are bundles (My Shoppers) or listings; Depop messages can be either.
export function contextsFor(platform: Platform, path: string): MessageContext[] {
  if (platform === "Poshmark") return /\/order\//.test(path) ? ["pastBuyer"] : ["bundle"];
  return ["potentialBuyer", "pastBuyer"];
}

type Box = HTMLTextAreaElement | HTMLElement;

const isBox = (el: EventTarget | null): el is Box =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);

// Types text into the box the way a person would, so the page's own code sees the change.
export function insertInto(box: Box, text: string) {
  box.focus();
  if (box instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    const next = box.value.trim() ? `${box.value.trimEnd()} ${text}` : text;
    if (setter) setter.call(box, next);
    else box.value = next;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

function start(platform: Platform) {
  let templates: MessageTemplate[] | null = null;
  let seller = "";
  let current: Box | null = null;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483647;display:none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      button{font:500 12px system-ui,sans-serif;cursor:pointer}
      .chip{background:#b76e79;color:#fff;border:0;border-radius:999px;padding:4px 10px;box-shadow:0 1px 4px rgba(0,0,0,.2)}
      .menu{display:none;margin-top:4px;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.15);padding:6px;width:260px;max-height:300px;overflow:auto}
      .menu.open{display:block}
      .group{font:600 11px system-ui,sans-serif;color:#777;padding:6px 8px 2px;text-transform:uppercase;letter-spacing:.03em}
      .item{display:block;width:100%;text-align:left;background:none;border:0;border-radius:6px;padding:6px 8px;color:#222}
      .item:hover{background:#f6eef0}
      .note{font:11px system-ui,sans-serif;color:#777;padding:6px 8px}
    </style>
    <button class="chip" type="button">SellSync templates</button>
    <div class="menu" role="menu"></div>`;
  const chip = root.querySelector(".chip") as HTMLButtonElement;
  const menu = root.querySelector(".menu") as HTMLDivElement;
  document.documentElement.appendChild(host);

  // Clicking the button mustn't take focus away from the comment box.
  root.addEventListener("mousedown", (e) => e.preventDefault());

  const place = () => {
    if (!current) return;
    const r = current.getBoundingClientRect();
    host.style.top = `${Math.max(4, r.top - 30)}px`;
    host.style.left = `${Math.max(4, Math.min(window.innerWidth - 270, r.right - 150))}px`;
  };

  const render = () => {
    const contexts = contextsFor(platform, location.pathname);
    const list = (templates ?? []).filter((t) => contexts.includes(t.context));
    menu.innerHTML = "";
    if (!templates) menu.innerHTML = `<div class="note">Loading templates…</div>`;
    else if (!list.length) menu.innerHTML = `<div class="note">No templates for this page. Add them in SellSync under Automations, Comments and messages.</div>`;
    for (const c of contexts) {
      const group = list.filter((t) => t.context === c);
      if (!group.length) continue;
      if (contexts.length > 1) menu.insertAdjacentHTML("beforeend", `<div class="group">${CONTEXT_LABEL[c]}</div>`);
      for (const t of group) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "item";
        b.textContent = t.name;
        b.title = t.text;
        b.addEventListener("click", () => {
          if (current) insertInto(current, fillTemplate(t.text, { seller }));
          menu.classList.remove("open");
        });
        menu.appendChild(b);
      }
    }
    menu.insertAdjacentHTML("beforeend", `<div class="note">Fill in the name and item, then press Post yourself.</div>`);
  };

  chip.addEventListener("click", async () => {
    menu.classList.toggle("open");
    render();
    if (!templates) {
      const res = (await chrome.runtime.sendMessage({ type: "message-templates", platform }).catch(() => null)) as { templates: MessageTemplate[]; seller: string } | null;
      templates = res?.templates ?? [];
      seller = res?.seller ?? "";
      render();
    }
  });

  document.addEventListener("focusin", (e) => {
    if (!isBox(e.target)) return;
    current = e.target;
    host.style.display = "block";
    place();
  });
  document.addEventListener("focusout", (e) => {
    if (e.target !== current) return;
    setTimeout(() => {
      if (document.activeElement === current) return;
      host.style.display = "none";
      menu.classList.remove("open");
    }, 150);
  });
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
}

const platform = typeof location !== "undefined" ? platformFor(location.hostname) : null;
if (platform && typeof chrome !== "undefined" && chrome.runtime?.id) start(platform);
