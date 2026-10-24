import type { Platform } from "../../src/lib/types";
import { CONNECTORS } from "./connectors";
import { reship, supabaseSink } from "./reship";
import { syncAll, type PlatformResult } from "./sync";

const SYNC_ALARM = "reship-sync";
const SYNC_MINUTES = 15;

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

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) runSync();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "sync-now") {
    runSync().then(reply);
    return true; // keeps the channel open for the async reply
  }
  return false;
});

// Setup helper: when the seller clicks a marketplace's own label Download button, note where the
// file came from (address pattern only: long ids and query values are blanked) so the connector
// can fetch labels the same way. Downloads from other sites are ignored.
const MARKETPLACE_HOSTS = /(^|\.)(poshmark\.com|mercari\.com|mercdn\.net)$/;
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
