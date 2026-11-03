import { CODE_PATTERN, DEFAULT_PROGRAM } from "./affiliates";

// Remembers the referral code from a link like reship.app/?ref=jane, so it can be credited when the
// visitor signs up, even if they sign up days later. The latest link someone used wins.
const KEY = "reship.referral.v1";

interface Saved {
  code: string;
  at: number;
}

export function captureReferral(search = window.location.search, now = Date.now()): string | null {
  const raw = new URLSearchParams(search).get("ref");
  const code = raw?.trim().toLowerCase();
  if (!code || !CODE_PATTERN.test(code)) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now } satisfies Saved));
  } catch {
    // Storage blocked: the referral is lost, but the visit still counts.
  }
  return code;
}

export function pendingReferral(now = Date.now(), maxDays = DEFAULT_PROGRAM.cookieDays): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (!saved?.code) return null;
    if (now - saved.at > maxDays * 86400000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return saved.code;
  } catch {
    return null;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
