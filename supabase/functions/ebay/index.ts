// eBay connection: the seller signs in on eBay's own page and approves Hubby (OAuth). Hubby then
// reads their eBay orders and active listings with eBay's official APIs. No password is ever seen.
//
// This one file is the whole function, so it can be pasted into Supabase's dashboard editor.
// Turn OFF "Enforce JWT verification" for it (eBay calls it directly), or deploy with
//   supabase functions deploy ebay --no-verify-jwt
// Signed-in actions still check the seller's Hubby sign-in below.
//
// Calls:
//   POST {action: "connect", returnUrl} → {url} of eBay's sign-in page
//   POST {action: "status"}             → {connected, username, connectedAt, lastImportAt}
//   POST {action: "import", days}       → {orders, listings, username} (eBay's data, lightly trimmed)
//   POST {action: "disconnect"}         → {ok}
//   GET  ?code=…&state=…                → eBay sends the seller back here after they approve
//   GET  ?challenge_code=…              → eBay checks the account deletion endpoint
//   POST {metadata: {topic: "MARKETPLACE_ACCOUNT_DELETION"}, …} → eBay says a user deleted their account
//
// Secrets (Edge Functions > Secrets):
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET  the production App ID and Cert ID (the same keys Research uses)
//   EBAY_RUNAME                         the "RuName" eBay shows for your redirect URL
//   EBAY_VERIFICATION_TOKEN             any 32 to 80 letters, digits, _ or -, also typed into eBay's
//                                       account deletion settings
//   APP_URL                             where Hubby runs, used when a return address is missing
//   EBAY_ENV=sandbox                    optional, to try eBay's test site instead of the real one
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SANDBOX = Deno.env.get("EBAY_ENV") === "sandbox";
const AUTH_HOST = SANDBOX ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com";
const API_HOST = SANDBOX ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
const APIZ_HOST = SANDBOX ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com";
// Read-only: orders, the seller's username, and the basic scope the Trading API (listings) accepts.
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
].join(" ");
const PLATFORM = "eBay";

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`The ${k} secret isn't set yet.`);
  return v;
};
const db = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
// The exact address eBay was given for this function; it's part of the deletion check's hash.
const endpointUrl = () => `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/ebay`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const challenge = url.searchParams.get("challenge_code");
      if (challenge) return challengeResponse(challenge);
      return await oauthCallback(url);
    }
    const body = await req.json().catch(() => ({}));
    if (body?.metadata?.topic === "MARKETPLACE_ACCOUNT_DELETION") return await accountDeleted(body);

    const client = db();
    const { data: auth } = await client.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    if (!auth.user) return json({ error: "Sign in to Hubby first." }, 401);
    const userId = auth.user.id;

    switch (body.action) {
      case "connect":
        return json({ url: await startConnect(client, userId, body.returnUrl) });
      case "status": {
        const { data } = await client.from("marketplace_connections").select("external_user, connected_at, last_import_at").eq("user_id", userId).eq("platform", PLATFORM).maybeSingle();
        return json({ connected: !!data, username: data?.external_user ?? null, connectedAt: data?.connected_at ?? null, lastImportAt: data?.last_import_at ?? null, sandbox: SANDBOX });
      }
      case "import": {
        const token = await userToken(client, userId);
        const days = Math.min(Math.max(Number(body.days) || 90, 1), 730);
        const [orders, listings] = await Promise.all([fetchOrders(token, days), fetchActiveListings(token)]);
        await client.from("marketplace_connections").update({ last_import_at: new Date().toISOString() }).eq("user_id", userId).eq("platform", PLATFORM);
        const { data } = await client.from("marketplace_connections").select("external_user").eq("user_id", userId).eq("platform", PLATFORM).maybeSingle();
        return json({ orders, listings, username: data?.external_user ?? null });
      }
      case "disconnect":
        await client.from("marketplace_connections").delete().eq("user_id", userId).eq("platform", PLATFORM);
        return json({ ok: true });
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    const message = (e as Error).message;
    return json({ error: message }, message.includes("Connect eBay again") ? 409 : 502);
  }
});

// ---- Sign-in (OAuth authorization code grant) ----

async function startConnect(client: ReturnType<typeof db>, userId: string, returnUrl: unknown) {
  const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const back = typeof returnUrl === "string" && /^https?:\/\//i.test(returnUrl) ? returnUrl.slice(0, 500) : null;
  // Clear this seller's old, unused codes so the table stays small.
  await client.from("oauth_states").delete().eq("user_id", userId).eq("platform", PLATFORM);
  const { error } = await client.from("oauth_states").insert({ state, user_id: userId, platform: PLATFORM, return_url: back });
  if (error) throw new Error(`Couldn't start the eBay sign-in (${error.message}). Has migration 0017 been run?`);
  const q = new URLSearchParams({ client_id: env("EBAY_CLIENT_ID"), redirect_uri: env("EBAY_RUNAME"), response_type: "code", scope: SCOPES, state, prompt: "login" });
  return `${AUTH_HOST}/oauth2/authorize?${q}`;
}

async function oauthCallback(url: URL) {
  const state = url.searchParams.get("state") ?? "";
  const client = db();
  const { data: pending } = state ? await client.from("oauth_states").select("*").eq("state", state).maybeSingle() : { data: null };
  if (pending) await client.from("oauth_states").delete().eq("state", state);
  const back = (result: string) => {
    const base = pending?.return_url || Deno.env.get("APP_URL");
    if (!base) return new Response(result === "connected" ? "eBay is connected. You can close this tab and go back to Hubby." : `eBay sign-in didn't finish (${result}).`, { headers: cors });
    const to = new URL(base);
    // Hubby keeps its page in the address after #, so the result goes there too.
    const [path, query] = (to.hash.replace(/^#/, "") || "/settings").split("?");
    const params = new URLSearchParams(query ?? "");
    params.set("tab", "connections");
    params.set("ebay", result);
    to.hash = `${path}?${params}`;
    return Response.redirect(to.href, 302);
  };

  if (!pending || Date.now() - new Date(pending.created_at).getTime() > 15 * 60_000) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("declined"); // the seller pressed "No thanks" on eBay

  const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env("EBAY_RUNAME") });
  const username = await fetchUsername(token.access_token).catch(() => null);
  const now = Date.now();
  const { error } = await client.from("marketplace_connections").upsert({
    user_id: pending.user_id,
    platform: PLATFORM,
    external_user: username,
    access_token: token.access_token,
    access_expires_at: new Date(now + (token.expires_in - 120) * 1000).toISOString(),
    refresh_token: token.refresh_token,
    refresh_expires_at: token.refresh_token_expires_in ? new Date(now + token.refresh_token_expires_in * 1000).toISOString() : null,
    scopes: SCOPES,
    connected_at: new Date(now).toISOString(),
  });
  if (error) return back("error");
  return back("connected");
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API_HOST}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${env("EBAY_CLIENT_ID")}:${env("EBAY_CLIENT_SECRET")}`)}` },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new Error("eBay ended this connection. Connect eBay again in Settings.");
    throw new Error(`eBay sign-in failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data;
}

// A working access token for this seller, refreshed when the two-hour one has run out.
async function userToken(client: ReturnType<typeof db>, userId: string): Promise<string> {
  const { data: c } = await client.from("marketplace_connections").select("*").eq("user_id", userId).eq("platform", PLATFORM).maybeSingle();
  if (!c) throw new Error("eBay isn't connected. Connect eBay again in Settings.");
  if (c.access_token && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now()) return c.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token, scope: c.scopes || SCOPES });
  await client
    .from("marketplace_connections")
    .update({ access_token: t.access_token, access_expires_at: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString() })
    .eq("user_id", userId)
    .eq("platform", PLATFORM);
  return t.access_token;
}

async function fetchUsername(token: string): Promise<string | null> {
  const res = await fetch(`${APIZ_HOST}/commerce/identity/v1/user/`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  return u.username ?? null;
}

// ---- Orders (Sell Fulfillment API) ----

async function fetchOrders(token: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const orders: unknown[] = [];
  let next: string | null = `${API_HOST}/sell/fulfillment/v1/order?${new URLSearchParams({ filter: `creationdate:[${since}..]`, limit: "200" })}`;
  // eBay allows up to 1,000 orders per request window; 10 pages covers a busy seller's 90 days.
  for (let page = 0; next && page < 10; page++) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    if (res.status === 401) throw new Error("eBay ended this connection. Connect eBay again in Settings.");
    if (!res.ok) throw new Error(`eBay orders failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json();
    for (const o of data.orders ?? []) orders.push(trimOrder(o));
    next = data.next ?? null;
  }
  return orders;
}

// Keep only what Hubby uses, so the response stays small.
// deno-lint-ignore no-explicit-any
function trimOrder(o: any) {
  const step = o.fulfillmentStartInstructions?.[0]?.shippingStep;
  return {
    orderId: o.orderId,
    creationDate: o.creationDate,
    orderFulfillmentStatus: o.orderFulfillmentStatus,
    orderPaymentStatus: o.orderPaymentStatus,
    cancelState: o.cancelStatus?.cancelState,
    buyer: o.buyer?.username,
    total: o.pricingSummary?.total?.value,
    deliveryCost: o.pricingSummary?.deliveryCost?.value,
    marketplaceFee: o.totalMarketplaceFee?.value,
    shippingCarrier: step?.shippingCarrierCode,
    shipTo: step?.shipTo
      ? {
          fullName: step.shipTo.fullName,
          phone: step.shipTo.primaryPhone?.phoneNumber,
          addressLine1: step.shipTo.contactAddress?.addressLine1,
          addressLine2: step.shipTo.contactAddress?.addressLine2,
          city: step.shipTo.contactAddress?.city,
          stateOrProvince: step.shipTo.contactAddress?.stateOrProvince,
          postalCode: step.shipTo.contactAddress?.postalCode,
          countryCode: step.shipTo.contactAddress?.countryCode,
        }
      : null,
    // deno-lint-ignore no-explicit-any
    lineItems: (o.lineItems ?? []).map((li: any) => ({
      title: li.title,
      sku: li.sku,
      legacyItemId: li.legacyItemId,
      quantity: li.quantity,
      price: li.lineItemCost?.value,
    })),
  };
}

// ---- Active listings (Trading API GetMyeBaySelling) ----
// The newer Inventory API only sees listings made through it, so listings made on ebay.com
// (nearly all of a reseller's) come from the Trading API, which accepts the same sign-in token.

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (name) => name === "Item" || name === "PictureURL" || name === "Errors" });

async function fetchActiveListings(token: string) {
  const listings: unknown[] = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 25; page++) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include><IncludeWatchCount>true</IncludeWatchCount><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`;
    const res = await fetch(`${API_HOST}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
        "X-EBAY-API-IAF-TOKEN": token,
      },
      body,
    });
    const parsed = xml.parse(await res.text());
    const r = parsed.GetMyeBaySellingResponse;
    if (!r) throw new Error(`eBay listings failed (${res.status}).`);
    if (r.Ack === "Failure") {
      const err = r.Errors?.[0];
      if (String(err?.ErrorCode) === "21917053" || /token/i.test(err?.LongMessage ?? "")) throw new Error("eBay ended this connection. Connect eBay again in Settings.");
      throw new Error(`eBay listings failed: ${err?.LongMessage ?? "unknown error"}`);
    }
    pages = Number(r.ActiveList?.PaginationResult?.TotalNumberOfPages ?? 1);
    for (const it of r.ActiveList?.ItemArray?.Item ?? []) {
      listings.push({
        itemId: String(it.ItemID),
        title: it.Title,
        sku: it.SKU ? String(it.SKU) : undefined,
        price: num(it.SellingStatus?.CurrentPrice) ?? num(it.BuyItNowPrice) ?? num(it.StartPrice),
        quantity: num(it.QuantityAvailable) ?? num(it.Quantity),
        watchers: num(it.WatchCount),
        startTime: it.ListingDetails?.StartTime,
        url: it.ListingDetails?.ViewItemURL,
        photos: (it.PictureDetails?.PictureURL ?? []).map(String),
        gallery: it.PictureDetails?.GalleryURL,
        condition: it.ConditionDisplayName,
      });
    }
  }
  return listings;
}

// deno-lint-ignore no-explicit-any
const num = (v: any): number | undefined => {
  const n = typeof v === "object" && v !== null ? Number(v["#text"] ?? NaN) : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// ---- eBay marketplace account deletion (required for production keys) ----

async function challengeResponse(challengeCode: string) {
  const data = new TextEncoder().encode(challengeCode + env("EBAY_VERIFICATION_TOKEN") + endpointUrl());
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return json({ challengeResponse: hex });
}

// deno-lint-ignore no-explicit-any
async function accountDeleted(body: any) {
  const username = body?.notification?.data?.username;
  if (username) await db().from("marketplace_connections").delete().eq("platform", PLATFORM).eq("external_user", username);
  return new Response(null, { status: 204, headers: cors });
}
