// Talks to the waitlist functions in supabase/migrations/0016_waitlist.sql over Supabase's REST API.
// Plain fetch on purpose: the coming soon page stays tiny and loads nothing from the app.

export type Stage = "starting" | "under_1_year" | "1_to_3_years" | "3_plus_years";

export interface WaitlistConfig {
  url?: string;
  anonKey?: string;
}

export type JoinResult = { ok: true; demo: boolean } | { ok: false; reason: "invalid_email" | "network" | "server" };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= 254 && EMAIL.test(email);
}

// Where the visitor came from, for example ?ref=tiktok or ?utm_source=instagram.
export function sourceFromUrl(href: string): string | null {
  try {
    const params = new URL(href).searchParams;
    const value = params.get("ref") ?? params.get("utm_source") ?? params.get("source");
    return value ? value.slice(0, 100) : null;
  } catch {
    return null;
  }
}

async function rpc(config: WaitlistConfig, fn: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${config.url!.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey!,
      Authorization: `Bearer ${config.anonKey!}`,
    },
    body: JSON.stringify(body),
  });
}

function configured(config: WaitlistConfig): boolean {
  return Boolean(config.url && config.anonKey);
}

// Without Supabase settings (local preview), signups are kept in this browser so the page still works.
function saveLocally(entry: Record<string, unknown>) {
  try {
    const key = "hubby.waitlist.demo";
    const list = JSON.parse(localStorage.getItem(key) ?? "[]") as Record<string, unknown>[];
    const others = list.filter((e) => e.email !== entry.email);
    const existing = list.find((e) => e.email === entry.email) ?? {};
    localStorage.setItem(key, JSON.stringify([...others, { ...existing, ...entry }]));
  } catch {
    // Storage blocked: nothing to keep.
  }
}

export async function joinWaitlist(
  config: WaitlistConfig,
  rawEmail: string,
  source: string | null,
  referrer: string | null,
): Promise<JoinResult> {
  if (!isValidEmail(rawEmail)) return { ok: false, reason: "invalid_email" };
  const email = normalizeEmail(rawEmail);
  if (!configured(config)) {
    saveLocally({ email, source, referrer, joinedAt: new Date().toISOString() });
    return { ok: true, demo: true };
  }
  try {
    const res = await rpc(config, "join_waitlist", { p_email: email, p_source: source, p_referrer: referrer });
    if (res.ok) return { ok: true, demo: false };
    const text = await res.text().catch(() => "");
    return { ok: false, reason: text.includes("invalid_email") ? "invalid_email" : "server" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function saveAnswers(
  config: WaitlistConfig,
  rawEmail: string,
  marketplaces: string[],
  stage: Stage | null,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!configured(config)) {
    saveLocally({ email, marketplaces, stage });
    return true;
  }
  try {
    const res = await rpc(config, "update_waitlist_answers", { p_email: email, p_marketplaces: marketplaces, p_stage: stage });
    return res.ok;
  } catch {
    return false;
  }
}
