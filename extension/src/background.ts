import type { Platform } from "../../src/lib/types";
import { CONNECTORS } from "./connectors";
import { describeLabelResponse } from "./connectors/poshmark";
import { lastRead as mercariRead } from "./connectors/mercari";
import { lastRead as vintedRead } from "./connectors/vinted";
import { onTabRemoved, onTabUpdated, runJobs } from "./jobs";
import { reship, supabaseJobStore, supabaseSink } from "./reship";
import { syncAll, type PlatformResult } from "./sync";

const SYNC_ALARM = "reship-sync";
const SYNC_MINUTES = 15;
// Crosslist and delist jobs are checked often, since the seller is usually waiting on them.
const JOBS_ALARM = "reship-jobs";
const JOBS_MINUTES = 0.5;

export interface SyncState {
  lastRun?: string;
  results: PlatformResult[];
}

async function enabledPlatforms(): Promise<Set<Platform>> {
  const { enabled } = await chrome.storage.local.get("enabled");
  return new Set((enabled as Platform[] | undefined) ?? []);
}

async function runSync(): Promise<SyncState> {
  const { data } = await reship.auth.getSession();
  const user = data.session?.user;
  if (!user) return { results: [] };
  const results = await syncAll(CONNECTORS, await enabledPlatforms(), supabaseSink(user.id));
  const state: SyncState = { lastRun: new Date().toISOString(), results };
  await chrome.storage.local.set({ syncState: state });
  return state;
}

async function runListingJobs(): Promise<number> {
  const { data } = await reship.auth.getSession();
  if (!data.session?.user) return 0;
  const { consented = false } = (await chrome.storage.local.get("consented")) as { consented?: boolean };
  if (!consented) return 0;
  return runJobs(supabaseJobStore());
}

// Setup check that saves nothing: finds the orders a connector would import and tries each label.
async function checkPlatform(platform: Platform): Promise<string> {
  const connector = CONNECTORS.find((c) => c.platform === platform);
  if (!connector) return `${platform} isn't supported.`;
  try {
    if (!(await connector.isLoggedIn())) return `Log in to ${platform} in this browser first.`;
    const orders = await connector.listOrdersToShip();
    let labels = 0;
    for (const order of orders) if (await connector.downloadLabel(order).catch(() => null)) labels++;
    const withSku = orders.filter((o) => o.items.some((i) => i.sku)).length;
    const summary = `Found ${orders.length} order${orders.length === 1 ? "" : "s"} to ship on ${platform}, with ${labels} label${labels === 1 ? "" : "s"} ready and ${withSku} SKU${withSku === 1 ? "" : "s"}.`;
    if (platform === "Vinted")
      return `${summary}\nDetails for Claude: in progress=${vintedRead.listed} read=${vintedRead.read} statuses=${vintedRead.statuses.join("|")} fields=${vintedRead.keys.join(",")}`;
    if (platform === "Mercari") return `${summary}\nDetails for Claude: in progress=${mercariRead.listed} read=${mercariRead.read} steps=${mercariRead.steps.join("|")}`;
    if (platform !== "Poshmark" || labels === orders.length || !orders[0].labelUrl) return summary;
    return `${summary}\nDetails for Claude: ${await describeLabelResponse(orders[0].labelUrl)}`;
  } catch (e) {
    return `Couldn't read ${platform}: ${e instanceof Error ? e.message : e}`;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
  chrome.alarms.create(JOBS_ALARM, { periodInMinutes: JOBS_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) runSync().then(runListingJobs);
  if (alarm.name === JOBS_ALARM) runListingJobs();
});

// A sell tab Reship filled in: notice when the seller has listed the item, or closed the tab.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === "complete") onTabUpdated(tabId, change.url ?? tab.url, supabaseJobStore()).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId, supabaseJobStore()).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "check-platform") {
    checkPlatform(msg.platform).then(reply);
    return true;
  }
  if (msg?.type === "run-jobs") {
    runListingJobs().then(reply);
    return true;
  }
  if (msg?.type === "sync-now") {
    runSync().then(reply);
    return true; // keeps the channel open for the async reply
  }
  return false;
});

// Setup helper: when the seller clicks a marketplace's own label Download button, note where the
// file came from (address pattern only: long ids and query values are blanked) so the connector
// can fetch labels the same way. Downloads from other sites are ignored.
const MARKETPLACE_HOSTS = /(^|\.)(poshmark\.com|mercari\.com|mercdn\.net|vinted\.com)$/;
chrome.downloads.onCreated.addListener(async (item) => {
  const urls = [item.url, item.finalUrl, item.referrer].filter(Boolean).map((u) => new URL(u));
  if (!urls.some((u) => MARKETPLACE_HOSTS.test(u.hostname))) return;
  const pattern = (u: URL) =>
    `${u.protocol}//${u.hostname}${u.pathname.replace(/[0-9a-f]{16,}/gi, ":id")}${[...u.searchParams.keys()].map((k, i) => `${i ? "&" : "?"}${k}=…`).join("")}`;
  const entry = {
    at: new Date().toISOString(),
    url: item.url.startsWith("blob:") || item.url.startsWith("data:") ? item.url.slice(0, 5) : pattern(new URL(item.url)),
    finalUrl: item.finalUrl && !item.finalUrl.startsWith("blob:") ? pattern(new URL(item.finalUrl)) : item.finalUrl?.slice(0, 5),
    referrer: item.referrer ? pattern(new URL(item.referrer)) : "",
    mime: item.mime,
  };
  const { labelDownloads = [] } = (await chrome.storage.local.get("labelDownloads")) as { labelDownloads?: unknown[] };
  await chrome.storage.local.set({ labelDownloads: [entry, ...labelDownloads].slice(0, 10) });
});
