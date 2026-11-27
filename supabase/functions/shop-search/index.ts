// Shop tab: things to buy on marketplaces that offer an official search API.
//   eBay – Browse API (item_summary/search). With EBAY_CAMPAIGN_ID (an eBay Partner Network campaign)
//          each link carries Hubby's affiliate ID, so Hubby earns a small commission from eBay
//          at no cost to the buyer. Buying itself happens on eBay: its Order API is limited to
//          partners eBay picks.
//   Etsy – Open API v3 (listings/active). Buying happens on Etsy.
// Other marketplaces have no API for this; the app opens their own search instead.
// Only signed-in users can call it, with a daily cap per user. Results aren't stored.
// Secrets: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_CAMPAIGN_ID (optional), ETSY_API_KEY,
// ETSY_SHARED_SECRET, SHOP_DAILY_SEARCHES (optional, default 300).
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json } from "../_shared/stripe.ts";

type Platform = "eBay" | "Etsy";
interface Result {
  id: string;
  platform: Platform;
  title: string;
  price: number;
  shipping?: number;
  url: string;
  image?: string;
  condition?: string;
  seller?: string;
  source: "api";
}
interface Filters {
  maxPrice?: number;
  condition?: "new" | "used";
}

const DAILY = Number(Deno.env.get("SHOP_DAILY_SEARCHES") ?? 300);
const LIMIT = 30;
const num = (v: unknown) => (typeof v === "string" || typeof v === "number" ? Number(v) : NaN);

let ebay: { token: string; until: number } | null = null;
async function ebayToken(): Promise<string> {
  if (ebay && ebay.until > Date.now()) return ebay.token;
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${Deno.env.get("EBAY_CLIENT_ID")}:${Deno.env.get("EBAY_CLIENT_SECRET")}`)}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  if (!res.ok) throw new Error(`eBay sign-in failed (${res.status}).`);
  const data = await res.json();
  ebay = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
  return ebay.token;
}

async function searchEbay(q: string, f: Filters): Promise<Result[]> {
  const filter = ["buyingOptions:{FIXED_PRICE}", "priceCurrency:USD"];
  if (f.maxPrice) filter.push(`price:[..${f.maxPrice}]`);
  if (f.condition) filter.push(`conditions:{${f.condition === "new" ? "NEW" : "USED"}}`);
  const headers: Record<string, string> = { Authorization: `Bearer ${await ebayToken()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" };
  const campaign = Deno.env.get("EBAY_CAMPAIGN_ID");
  if (campaign) headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${campaign}`;
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${new URLSearchParams({ q, limit: String(LIMIT), filter: filter.join(",") })}`, { headers });
  if (!res.ok) throw new Error(`eBay search failed (${res.status}).`);
  const data = await res.json();
  return (data.itemSummaries ?? [])
    .map((it: Record<string, any>): Result => {
      const ship = it.shippingOptions?.[0]?.shippingCost?.value;
      return {
        id: `ebay-${it.itemId}`,
        platform: "eBay",
        title: String(it.title ?? ""),
        price: num(it.price?.value),
        shipping: ship === undefined ? undefined : num(ship),
        url: it.itemAffiliateWebUrl ?? it.itemWebUrl,
        image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl,
        condition: it.condition,
        seller: it.seller?.username,
        source: "api",
      };
    })
    .filter((r: Result) => r.price > 0 && r.url);
}

async function searchEtsy(q: string, f: Filters): Promise<Result[]> {
  if (f.condition === "new") return []; // Etsy listings don't say new or used
  const key = Deno.env.get("ETSY_API_KEY")!;
  const secret = Deno.env.get("ETSY_SHARED_SECRET");
  const params = new URLSearchParams({ keywords: q, limit: String(LIMIT), sort_on: "score" });
  if (f.maxPrice) params.set("max_price", String(f.maxPrice));
  const res = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${params}`, { headers: { "x-api-key": secret ? `${key}:${secret}` : key } });
  if (!res.ok) throw new Error(`Etsy search failed (${res.status}).`);
  const data = await res.json();
  return (data.results ?? [])
    .filter((it: Record<string, any>) => it.price?.currency_code === "USD")
    .map((it: Record<string, any>): Result => ({
      id: `etsy-${it.listing_id}`,
      platform: "Etsy",
      title: String(it.title ?? ""),
      price: num(it.price?.amount) / (num(it.price?.divisor) || 100),
      url: it.url,
      condition: it.when_made && /before|19|20[01]/.test(String(it.when_made)) ? "Vintage" : undefined,
      source: "api",
    }))
    .filter((r: Result) => r.price > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth } = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!auth.user) return json({ error: "Sign in first." }, 401);

  const body = await req.json().catch(() => null);
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 120) : "";
  if (!q) return json({ error: "Type what to search for." }, 400);
  const f: Filters = {
    maxPrice: Number(body.maxPrice) > 0 ? Number(body.maxPrice) : undefined,
    condition: body.condition === "new" || body.condition === "used" ? body.condition : undefined,
  };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("kind", "shop").gte("created_at", since);
  if ((count ?? 0) >= DAILY) return json({ error: "You've reached today's search limit. It resets within 24 hours." }, 429);

  const jobs: { platform: Platform; on: boolean; run: () => Promise<Result[]> }[] = [
    { platform: "eBay", on: !!Deno.env.get("EBAY_CLIENT_ID") && !!Deno.env.get("EBAY_CLIENT_SECRET"), run: () => searchEbay(q, f) },
    { platform: "Etsy", on: !!Deno.env.get("ETSY_API_KEY"), run: () => searchEtsy(q, f) },
  ];
  const results: Result[] = [];
  const sources: { platform: Platform; status: "ok" | "off" | "error"; message?: string }[] = [];
  await Promise.all(
    jobs.map(async (j) => {
      if (!j.on) return void sources.push({ platform: j.platform, status: "off", message: `${j.platform} isn't set up yet. Add its app key to turn it on.` });
      try {
        results.push(...(await j.run()));
        sources.push({ platform: j.platform, status: "ok" });
      } catch (e) {
        sources.push({ platform: j.platform, status: "error", message: (e as Error).message });
      }
    }),
  );
  // Mix the two marketplaces instead of listing all of one first.
  const ebayR = results.filter((r) => r.platform === "eBay");
  const etsyR = results.filter((r) => r.platform === "Etsy");
  const mixed: Result[] = [];
  for (let i = 0; i < Math.max(ebayR.length, etsyR.length); i++) {
    if (ebayR[i]) mixed.push(ebayR[i]);
    if (etsyR[i]) mixed.push(etsyR[i]);
  }
  await db.from("ai_usage").insert({ user_id: auth.user.id, kind: "shop" });
  return json({ results: mixed, sources });
});
