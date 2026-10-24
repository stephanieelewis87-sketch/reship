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
