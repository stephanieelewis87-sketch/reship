// Research tab: live price comps from marketplaces that offer an official API for it.
//   eBay active – Browse API (item_summary/search), with an app key from developer.ebay.com
//   eBay sold   – Marketplace Insights API (item_sales/search). eBay only grants it to approved
//                 apps, so it stays off until EBAY_SOLD_COMPS=on.
//   Etsy active – Open API v3 (listings/active), with an app key from etsy.com/developers
// Other marketplaces have no API for this; the app opens their own search pages instead.
// Results aren't stored. Only signed-in users can call it, with a daily cap per user.
// Secrets: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_SOLD_COMPS (optional), ETSY_API_KEY,
// ETSY_SHARED_SECRET, COMPS_DAILY_SEARCHES (optional, default 200).
import { createClient } from "npm:@supabase/supabase-js@2";

type Platform = "eBay" | "Etsy";
type State = "sold" | "active";
interface Comp {
  id: string;
  platform: Platform;
  title: string;
  price: number;
  state: State;
  date?: string;
  url?: string;
  image?: string;
  condition?: string;
  source: "api";
}
interface SourceStatus {
  platform: Platform;
  state: State;
  status: "ok" | "off" | "error";
  message?: string;
}

const DAILY = Number(Deno.env.get("COMPS_DAILY_SEARCHES") ?? 200);
const LIMIT = 25;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// eBay app tokens last two hours; keep one per scope while this function instance is warm.
const tokens = new Map<string, { token: string; until: number }>();
async function ebayToken(scope: string): Promise<string> {
  const hit = tokens.get(scope);
  if (hit && hit.until > Date.now()) return hit.token;
  const id = Deno.env.get("EBAY_CLIENT_ID")!;
  const secret = Deno.env.get("EBAY_CLIENT_SECRET")!;
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  if (!res.ok) throw new Error(`eBay sign-in failed (${res.status}).`);
  const data = await res.json();
  tokens.set(scope, { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 });
  return data.access_token;
}

const num = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN);

async function ebayActive(q: string): Promise<Comp[]> {
  const token = await ebayToken("https://api.ebay.com/oauth/api_scope");
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${new URLSearchParams({ q, limit: String(LIMIT), filter: "buyingOptions:{FIXED_PRICE},priceCurrency:USD" })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
  if (!res.ok) throw new Error(`eBay search failed (${res.status}).`);
  const data = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: Record<string, any>): Comp => ({
      id: `ebay-${it.itemId}`,
      platform: "eBay",
      title: String(it.title ?? ""),
      price: num(it.price?.value),
      state: "active",
      date: typeof it.itemCreationDate === "string" ? it.itemCreationDate.slice(0, 10) : undefined,
      url: it.itemWebUrl,
      image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl,
      condition: it.condition,
      source: "api",
    }))
    .filter((c: Comp) => c.price > 0);
}

async function ebaySold(q: string): Promise<Comp[]> {
  const token = await ebayToken("https://api.ebay.com/oauth/api_scope/buy.marketplace.insights");
  const url = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?${new URLSearchParams({ q, limit: String(LIMIT) })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
  if (!res.ok) throw new Error(`eBay sold search failed (${res.status}).`);
  const data = await res.json();
  return (data.itemSales ?? [])
    .map((it: Record<string, any>): Comp => ({
      id: `ebay-sold-${it.itemId}`,
      platform: "eBay",
      title: String(it.title ?? ""),
      price: num(it.lastSoldPrice?.value),
      state: "sold",
      date: typeof it.lastSoldDate === "string" ? it.lastSoldDate.slice(0, 10) : undefined,
      url: it.itemWebUrl,
      image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl,
      condition: it.condition,
      source: "api",
    }))
    .filter((c: Comp) => c.price > 0);
}

async function etsyActive(q: string): Promise<Comp[]> {
  const key = Deno.env.get("ETSY_API_KEY")!;
  const secret = Deno.env.get("ETSY_SHARED_SECRET");
  const url = `https://openapi.etsy.com/v3/application/listings/active?${new URLSearchParams({ keywords: q, limit: String(LIMIT), sort_on: "score" })}`;
  const res = await fetch(url, { headers: { "x-api-key": secret ? `${key}:${secret}` : key } });
  if (!res.ok) throw new Error(`Etsy search failed (${res.status}).`);
  const data = await res.json();
  return (data.results ?? [])
    .filter((it: Record<string, any>) => it.price?.currency_code === "USD")
    .map((it: Record<string, any>): Comp => ({
      id: `etsy-${it.listing_id}`,
      platform: "Etsy",
      title: String(it.title ?? ""),
      price: num(it.price?.amount) / (num(it.price?.divisor) || 100),
      state: "active",
      date: typeof it.original_creation_timestamp === "number" ? new Date(it.original_creation_timestamp * 1000).toISOString().slice(0, 10) : undefined,
      url: it.url,
      source: "api",
    }))
    .filter((c: Comp) => c.price > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth.user) return json({ error: "Sign in first." }, 401);

  const body = await req.json().catch(() => null);
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 120) : "";
  if (!q) return json({ error: "Type what to search for." }, 400);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("kind", "comps").gte("created_at", since);
  if ((count ?? 0) >= DAILY) return json({ error: "You've reached today's limit for live comps. It resets within 24 hours." }, 429);

  const ebayOn = !!Deno.env.get("EBAY_CLIENT_ID") && !!Deno.env.get("EBAY_CLIENT_SECRET");
  const soldOn = ebayOn && Deno.env.get("EBAY_SOLD_COMPS") === "on";
  const etsyOn = !!Deno.env.get("ETSY_API_KEY");

  const jobs: { platform: Platform; state: State; on: boolean; off: string; run: () => Promise<Comp[]> }[] = [
    { platform: "eBay", state: "active", on: ebayOn, off: "not set up yet. Add an eBay app key to turn it on.", run: () => ebayActive(q) },
    { platform: "eBay", state: "sold", on: soldOn, off: "needs eBay's approval for its Marketplace Insights API. Use the Sold button for eBay below.", run: () => ebaySold(q) },
    { platform: "Etsy", state: "active", on: etsyOn, off: "not set up yet. Add an Etsy app key to turn it on.", run: () => etsyActive(q) },
  ];

  const comps: Comp[] = [];
  const sources: SourceStatus[] = [];
  await Promise.all(
    jobs.map(async (j) => {
      if (!j.on) return void sources.push({ platform: j.platform, state: j.state, status: "off", message: j.off });
      try {
        comps.push(...(await j.run()));
        sources.push({ platform: j.platform, state: j.state, status: "ok" });
      } catch (e) {
        sources.push({ platform: j.platform, state: j.state, status: "error", message: (e as Error).message });
      }
    }),
  );

  await db.from("ai_usage").insert({ user_id: auth.user.id, kind: "comps" });
  return json({ comps, sources });
});
