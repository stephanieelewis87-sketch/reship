import type { Platform } from "../../src/lib/types";
import { CONNECTORS } from "./connectors";
import { reship } from "./reship";
import type { SyncState } from "./background";
import type { PlatformResult } from "./sync";
import { capturePage } from "./capture";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_TEXT: Record<PlatformResult["status"], [string, string]> = {
  ok: ["Synced", "ok"],
  "logged-out": ["Log in to this site in this browser (see Setup checklist)", "warn"],
  "not-ready": ["Coming soon", ""],
  error: ["Couldn't sync. See Setup checklist", "err"],
};

async function render() {
  const { data } = await reship.auth.getSession();
  const user = data.session?.user;
  $("signin").hidden = !!user;
  $("connected").hidden = !user;
  if (!user) return;

  $("who").textContent = `Signed in as ${user.email}`;
  const { enabled = [], consented = false, syncState } = (await chrome.storage.local.get(["enabled", "consented", "syncState"])) as {
    enabled?: Platform[];
    consented?: boolean;
    syncState?: SyncState;
  };
  $("consent").hidden = consented;

  const list = $("platforms");
  list.replaceChildren(
    ...CONNECTORS.map((c) => {
      const row = document.createElement("div");
      row.className = "row";
      const result = syncState?.results.find((r) => r.platform === c.platform);
      const [text, tone] = result ? STATUS_TEXT[result.status] : ["Not synced yet", ""];
      const detail = result?.status === "ok" ? ` · ${result.imported} new, ${result.labels} labels` : "";
      row.innerHTML = `<div><div></div><div class="status ${tone}"></div></div>`;
      (row.firstElementChild!.firstElementChild as HTMLElement).textContent = c.platform === "WhatNot" ? "Whatnot" : c.platform;
      (row.firstElementChild!.lastElementChild as HTMLElement).textContent = text + detail;
      if (result?.status === "logged-out") {
        const a = document.createElement("a");
        a.href = c.loginUrl;
        a.target = "_blank";
        a.textContent = " Log in";
        row.firstElementChild!.lastElementChild!.append(a);
      }
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = enabled.includes(c.platform);
      toggle.disabled = !consented;
      toggle.setAttribute("aria-label", `Sync ${c.platform}`);
      toggle.addEventListener("change", async () => {
        const next = new Set(enabled);
        if (toggle.checked) next.add(c.platform);
        else next.delete(c.platform);
        await chrome.storage.local.set({ enabled: [...next] });
        render();
      });
      row.append(toggle);
      return row;
    }),
  );
  $("last-run").textContent = syncState?.lastRun ? `Last sync ${new Date(syncState.lastRun).toLocaleString()}` : "";
}

$("signin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("signin-error").textContent = "";
  const { error } = await reship.auth.signInWithPassword({
    email: $<HTMLInputElement>("email").value,
    password: $<HTMLInputElement>("password").value,
  });
  if (error) $("signin-error").textContent = error.message;
  render();
});

$("accept").addEventListener("click", async () => {
  await chrome.storage.local.set({ consented: true });
  render();
});

$("sync").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("sync");
  button.disabled = true;
  button.textContent = "Syncing…";
  await chrome.runtime.sendMessage({ type: "sync-now" });
  button.disabled = false;
  button.textContent = "Sync now";
  render();
});

$("signout").addEventListener("click", async () => {
  await reship.auth.signOut();
  render();
});

$("capture").addEventListener("click", async () => {
  const status = $("capture-status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage });
    const { labelDownloads = [] } = await chrome.storage.local.get("labelDownloads");
    Object.assign(result as object, { labelDownloads });
    const host = new URL(tab.url ?? "https://page").hostname.replace(/^www\./, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: "application/json" }));
    a.download = `reship-capture-${host}-${Date.now()}.json`;
    a.click();
    status.textContent = "Saved to your Downloads folder. Send that file to Claude.";
  } catch (e) {
    status.textContent = `Couldn't capture this page: ${e instanceof Error ? e.message : e}`;
  }
});

$("check-poshmark").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("check-poshmark");
  button.disabled = true;
  $("check-status").textContent = "Checking Poshmark…";
  $("check-status").textContent = await chrome.runtime.sendMessage({ type: "check-platform", platform: "Poshmark" });
  button.disabled = false;
});

render();
