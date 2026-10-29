import type { Platform } from "../../src/lib/types";
import { CONNECTORS } from "./connectors";
import { reship } from "./reship";
import type { SyncState } from "./background";
import type { PlatformResult } from "./sync";
import { capturePage } from "./capture";
import { jobFromRow, type ListingJob, type ListingJobRow } from "../../src/lib/crosslist";

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
  await renderCrosslist();
}

const JOB_TEXT: Record<ListingJob["status"], string> = {
  queued: "Waiting",
  running: "Working on it",
  needs_you: "Needs you",
  done: "Done",
  failed: "Couldn't finish",
  cancelled: "Stopped",
};

// Recent crosslist and delist jobs, and the auto-delist choices saved in the seller's Reship settings.
async function renderCrosslist() {
  const { data: rows } = await reship.from("listing_jobs").select("*").order("created_at", { ascending: false }).limit(5);
  const jobs = ((rows ?? []) as ListingJobRow[]).map(jobFromRow);
  $("jobs").replaceChildren(
    ...jobs.map((job) => {
      const row = document.createElement("div");
      row.className = "row";
      const what = job.action === "list" ? `List "${job.draft?.title ?? "item"}"` : `Take down ${job.listingId}${job.reason ? ` (${job.reason})` : ""}`;
      row.innerHTML = `<div><div></div><div class="status"></div></div>`;
      (row.firstElementChild!.firstElementChild as HTMLElement).textContent = `${job.platform}: ${what}`;
      const status = row.firstElementChild!.lastElementChild as HTMLElement;
      status.textContent = `${JOB_TEXT[job.status]}${job.message ? `. ${job.message}` : ""}`;
      const tone = { done: "ok", needs_you: "warn", failed: "err" }[job.status as string];
      if (tone) status.classList.add(tone);
      return row;
    }),
  );
  if (!jobs.length) $("jobs").textContent = "";

  const { data: settingsRow } = await reship.from("settings").select("data").maybeSingle();
  const settings = (settingsRow?.data ?? {}) as { autoDelist?: Partial<Record<Platform, boolean>> };
  for (const platform of ["Mercari", "Vinted"] as const) {
    const box = $<HTMLInputElement>(`autodelist-${platform}`);
    box.checked = !!settings.autoDelist?.[platform];
    box.onchange = async () => {
      const { data: latest } = await reship.from("settings").select("data").maybeSingle();
      const current = (latest?.data ?? {}) as { autoDelist?: Partial<Record<Platform, boolean>> };
      const { data: auth } = await reship.auth.getSession();
      await reship.from("settings").upsert({
        user_id: auth.session!.user.id,
        data: { ...current, autoDelist: { ...current.autoDelist, [platform]: box.checked } },
      });
    };
  }
}

$("run-jobs").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("run-jobs");
  button.disabled = true;
  $("jobs-status").textContent = "Checking…";
  const handled: number = await chrome.runtime.sendMessage({ type: "run-jobs" });
  $("jobs-status").textContent = handled ? `Started ${handled} task${handled === 1 ? "" : "s"}.` : "Nothing new to do.";
  button.disabled = false;
  render();
});

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

for (const platform of ["Poshmark", "Mercari", "Vinted"] as const) {
  const button = $<HTMLButtonElement>(`check-${platform.toLowerCase()}`);
  button.addEventListener("click", async () => {
    button.disabled = true;
    $("check-status").textContent = `Checking ${platform}…`;
    $("check-status").textContent = await chrome.runtime.sendMessage({ type: "check-platform", platform });
    button.disabled = false;
  });
}

render();
