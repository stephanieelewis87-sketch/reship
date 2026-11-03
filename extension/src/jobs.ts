import { conditionLabel, CROSSLIST_RULES, type ListingJob, type MarketplaceListing } from "../../src/lib/crosslist";
import type { Platform } from "../../src/lib/types";
import { LISTERS } from "./listers";
import { delistStep, fillSellForm, type FillPayload, type FillResult } from "./listers/page";
import type { Lister } from "./listers/types";

// Works through the crosslist and delist jobs the Reship app queued, in the seller's browser.
// Listing opens the marketplace's sell form in a background tab with everything filled in; the
// seller picks what only the marketplace's own lists offer (category, brand) and presses List,
// and Reship records the new listing when the tab lands on it.

export interface JobStore {
  queuedJobs(): Promise<ListingJob[]>;
  updateJob(id: string, patch: { status: ListingJob["status"]; message?: string }): Promise<void>;
  saveListing(listing: MarketplaceListing & { title?: string; price?: number }): Promise<void>;
  setListingStatus(platform: Platform, listingId: string, status: MarketplaceListing["status"]): Promise<void>;
}

// A sell tab waiting for the seller to finish, kept in session storage so it survives the
// background worker restarting.
interface OpenSellTab {
  jobId: string;
  platform: Platform;
  sku?: string;
  inventoryItemId?: string;
  title: string;
  price: number;
}

const FORM_WAIT_MS = 30_000;
const DELIST_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// What to tell the seller once the form is filled.
export function fillMessage(platform: Platform, result: FillResult): string {
  const left = [...result.missing, ...(CROSSLIST_RULES[platform]?.sellerPicks ?? [])];
  const filled = result.filled.length ? `Filled in ${listWords(result.filled)}. ` : "";
  return `${filled}Open the ${platform} tab, add ${listWords(left)}, then press List.`;
}

function listWords(words: string[]): string {
  const unique = [...new Set(words)];
  return unique.length < 2 ? (unique[0] ?? "") : `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

let running = false;

export async function runJobs(store: JobStore): Promise<number> {
  if (running) return 0;
  running = true;
  let handled = 0;
  try {
    for (const job of await store.queuedJobs()) {
      const lister = LISTERS[job.platform];
      if (!lister) {
        await store.updateJob(job.id, { status: "failed", message: `Reship can't ${job.action} on ${job.platform} yet.` });
        continue;
      }
      await store.updateJob(job.id, { status: "running" });
      try {
        if (job.action === "list") await openSellForm(job, lister, store);
        else await delist(job, lister, store);
      } catch (e) {
        await store.updateJob(job.id, { status: "failed", message: e instanceof Error ? e.message : String(e) });
      }
      handled++;
    }
  } finally {
    running = false;
    await updateBadge();
  }
  return handled;
}

async function openSellForm(job: ListingJob, lister: Lister, store: JobStore) {
  const draft = job.draft;
  if (!draft) throw new Error("This listing job has no item details.");
  const payload: FillPayload = {
    fields: lister.fields.map((f) => ({
      ...f,
      value: f.key === "title" ? draft.title : f.key === "description" ? draft.description : f.key === "price" ? String(draft.price) : "",
    })),
    photos: await Promise.all(draft.photos.map(async (url, i) => ({ name: `photo-${i + 1}.jpg`, dataUrl: await toDataUrl(url) }))),
    photoSelectors: lister.photoSelectors,
    condition: conditionLabel(job.platform, draft.condition),
    waitFor: "title",
  };
  const tab = await chrome.tabs.create({ url: lister.sellUrl, active: false });
  const tabId = tab.id!;
  const deadline = Date.now() + FORM_WAIT_MS;
  let result: FillResult | null = null;
  while (!result && Date.now() < deadline) {
    await sleep(1000);
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (!current) throw new Error(`The ${job.platform} tab was closed before Reship could fill it in.`);
    if (current.url && lister.isLoginPage(current.url)) {
      await chrome.tabs.remove(tabId).catch(() => {});
      throw new Error(`Log in to ${job.platform} in this browser, then try again.`);
    }
    const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: fillSellForm, args: [payload] }).catch(() => []);
    result = (injected?.result as FillResult | null | undefined) ?? null;
  }
  if (!result) {
    await store.updateJob(job.id, { status: "needs_you", message: `Reship couldn't find ${job.platform}'s sell form, so it left the tab open for you to fill in.` });
  } else {
    await store.updateJob(job.id, { status: "needs_you", message: fillMessage(job.platform, result) });
  }
  await trackSellTab(tabId, { jobId: job.id, platform: job.platform, sku: draft.sku, inventoryItemId: job.inventoryItemId, title: draft.title, price: draft.price });
}

async function delist(job: ListingJob, lister: Lister, store: JobStore) {
  if (!job.listingId) throw new Error("This delist job has no listing id.");
  const tab = await chrome.tabs.create({ url: lister.listingUrl(job.listingId), active: false });
  const tabId = tab.id!;
  const deadline = Date.now() + DELIST_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(1500);
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (!current) throw new Error(`The ${job.platform} tab was closed before the listing came down.`);
    if (current.url && lister.isLoginPage(current.url)) {
      await chrome.tabs.remove(tabId).catch(() => {});
      throw new Error(`Log in to ${job.platform} in this browser, then try again.`);
    }
    const [injected] = await chrome.scripting.executeScript({ target: { tabId }, func: delistStep, args: [lister.delist] }).catch(() => []);
    const step = injected?.result;
    if (step === "done" || step === "gone" || step === "sold") {
      await chrome.tabs.remove(tabId).catch(() => {});
      await store.setListingStatus(job.platform, job.listingId, step === "sold" ? "sold" : "delisted").catch(() => {});
      const message = step === "done" ? "Taken down." : step === "sold" ? "Already sold there." : "Already gone from the marketplace.";
      await store.updateJob(job.id, { status: "done", message });
      return;
    }
  }
  await store.updateJob(job.id, {
    status: "needs_you",
    message: `Reship couldn't finish taking this down, so it left the ${job.platform} tab open. ${job.platform === "Mercari" ? "Deactivate" : "Hide"} the listing there.`,
  });
}

// --- Finishing listings -------------------------------------------------------------------

async function sellTabs(): Promise<Record<string, OpenSellTab>> {
  const { sellTabs = {} } = (await chrome.storage.session.get("sellTabs")) as { sellTabs?: Record<string, OpenSellTab> };
  return sellTabs;
}

async function trackSellTab(tabId: number, info: OpenSellTab) {
  await chrome.storage.session.set({ sellTabs: { ...(await sellTabs()), [tabId]: info } });
}

async function untrack(tabId: number) {
  const tabs = await sellTabs();
  delete tabs[tabId];
  await chrome.storage.session.set({ sellTabs: tabs });
}

// Called for every tab address change: when a sell tab reaches its new listing, record it.
export async function onTabUpdated(tabId: number, url: string | undefined, store: JobStore) {
  if (!url) return;
  const info = (await sellTabs())[tabId];
  if (!info) return;
  const listingId = LISTERS[info.platform]?.listingIdFromUrl(url);
  if (!listingId) return;
  await untrack(tabId);
  await store.saveListing({
    platform: info.platform,
    listingId,
    url,
    sku: info.sku,
    inventoryItemId: info.inventoryItemId,
    status: "active",
    title: info.title,
    price: info.price,
  });
  await store.updateJob(info.jobId, { status: "done", message: `Listed on ${info.platform}.` });
  await updateBadge();
}

export async function onTabRemoved(tabId: number, store: JobStore) {
  const info = (await sellTabs())[tabId];
  if (!info) return;
  await untrack(tabId);
  await store.updateJob(info.jobId, { status: "cancelled", message: `The ${info.platform} tab was closed before the item was listed.` });
  await updateBadge();
}

// The toolbar icon shows how many sell forms are waiting for the seller.
async function updateBadge() {
  const count = Object.keys(await sellTabs()).length;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#B5607A" });
}

// Photos are fetched here (the extension can reach the photo storage) and handed to the page as data.
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load a photo (${res.status}).`);
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}
