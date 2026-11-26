// SellSource checkout: holds the items for the buyer, then sends them to Stripe Checkout.
// The buyer pays on Stripe's page; Stripe sends the seller's share straight to the seller's
// Stripe account and SellSource keeps its fee (3% of the items, plus card processing).
//   POST {listingIds, showId?, buyerToken, buyerName?, returnUrl} → {url}
// No account needed to buy. Prices always come from the database (or the winning bid), never
// from the browser.
// Secrets: STRIPE_SECRET_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, stripe, toCents } from "../_shared/stripe.ts";
import { packageShipping, sellSourceFees } from "../_shared/fees.ts";

const HOLD_MINUTES = 30; // Stripe's shortest checkout lifetime

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.listingIds) ? body.listingIds.filter((x: unknown) => typeof x === "string").slice(0, 20) : [];
  const token = typeof body?.buyerToken === "string" ? body.buyerToken : "";
  const showId = typeof body?.showId === "string" ? body.showId : null;
  if (!ids.length || token.length < 16) return json({ error: "Nothing to check out." }, 400);

  const { data: listings } = await db.from("sellsource_listings").select("*").in("id", ids);
  if (!listings || listings.length !== ids.length) return json({ error: "Someone else just bought this." }, 409);
  const now = Date.now();
  const free = (l: Record<string, any>) => l.status === "active" || (l.status === "reserved" && l.reserved_until && new Date(l.reserved_until).getTime() < now);
  if (!listings.every(free)) return json({ error: "Someone else just bought this, or is checking out with it right now." }, 409);
  const sellerId = listings[0].seller_id;
  if (listings.some((l) => l.seller_id !== sellerId)) return json({ error: "Check out one shop at a time." }, 400);

  const { data: seller } = await db.from("sellsource_sellers").select("*").eq("user_id", sellerId).single();
  if (!seller?.stripe_account_id || seller.payouts !== "ready") return json({ error: "This shop can't take payments yet." }, 409);

  // Live show prices: an auctioned item sells for the winning bid, and only to the winner.
  const prices = new Map<string, number>(listings.map((l) => [l.id, Number(l.price)]));
  let show: Record<string, any> | null = null;
  if (showId) {
    const { data } = await db.from("live_shows").select("*").eq("id", showId).single();
    show = data;
    if (!show || show.seller_id !== sellerId) return json({ error: "That show isn't running." }, 400);
    const a = show.auction;
    if (a && ids.includes(a.listingId)) {
      if (new Date(a.endsAt).getTime() > now) return json({ error: "The auction is still running." }, 409);
      const { data: top } = await db.from("live_bids").select("id, amount").eq("show_id", showId).eq("listing_id", a.listingId).order("amount", { ascending: false }).limit(1).maybeSingle();
      const { data: owner } = top ? await db.from("live_bid_tokens").select("token").eq("bid_id", top.id).single() : { data: null };
      if (!top || owner?.token !== token) return json({ error: "Only the winning bidder can buy this item." }, 403);
      prices.set(a.listingId, Number(top.amount));
    }
  }

  // Combined shipping: wins later in the same show join the buyer's first package.
  let paidBefore = false;
  if (showId) {
    const { count } = await db.from("sellsource_sales").select("id", { count: "exact", head: true }).eq("show_id", showId).eq("buyer_token", token).eq("status", "paid");
    paidBefore = (count ?? 0) > 0;
  }
  const shipping = packageShipping(Number(seller.shipping_price), Number(seller.extra_item_shipping), listings.length, paidBefore);
  const itemsTotal = [...prices.values()].reduce((a, b) => a + b, 0);
  const fees = sellSourceFees(itemsTotal, shipping);

  // Hold the items. The update only touches rows that are still free, so two buyers can't both win.
  const until = new Date(now + HOLD_MINUTES * 60000).toISOString();
  const { data: held } = await db
    .from("sellsource_listings")
    .update({ status: "reserved", reserved_until: until })
    .in("id", ids)
    .or(`status.eq.active,and(status.eq.reserved,reserved_until.lt.${new Date(now).toISOString()})`)
    .select("id");
  if ((held ?? []).length !== ids.length) {
    if (held?.length) await db.from("sellsource_listings").update({ status: "active", reserved_until: null }).in("id", held.map((h) => h.id));
    return json({ error: "Someone else just bought this." }, 409);
  }

  const { data: sale, error: saleErr } = await db
    .from("sellsource_sales")
    .insert({ seller_id: sellerId, listing_ids: ids, show_id: showId, buyer_token: token, items_total: itemsTotal, shipping, fees: fees.total })
    .select("id")
    .single();
  if (saleErr) return json({ error: saleErr.message }, 500);

  const back = typeof body.returnUrl === "string" && /^https?:\/\//.test(body.returnUrl) ? body.returnUrl : Deno.env.get("APP_URL") ?? "";
  const join = back.includes("?") ? "&" : "?";
  try {
    const session = await stripe("checkout/sessions", {
      mode: "payment",
      expires_at: Math.floor((now + HOLD_MINUTES * 60000) / 1000) + 30,
      success_url: `${back}${join}paid=1`,
      cancel_url: back,
      line_items: listings.map((l) => ({
        quantity: 1,
        price_data: { currency: "usd", unit_amount: toCents(prices.get(l.id)!), product_data: { name: String(l.title).slice(0, 120), images: (l.photos ?? []).filter((p: string) => /^https:/.test(p)).slice(0, 1) } },
      })),
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [{ shipping_rate_data: { type: "fixed_amount", display_name: listings.length > 1 || paidBefore ? "Combined shipping, one package" : "Shipping", fixed_amount: { amount: toCents(shipping), currency: "usd" } } }],
      payment_intent_data: {
        application_fee_amount: toCents(fees.total),
        transfer_data: { destination: seller.stripe_account_id },
        description: `SellSource order from ${seller.shop_name}`,
      },
      metadata: { sale_id: sale.id, buyer_name: String(body.buyerName ?? "").slice(0, 30) },
    });
    await db.from("sellsource_sales").update({ checkout_session: session.id }).eq("id", sale.id);
    return json({ url: session.url });
  } catch (e) {
    await db.from("sellsource_listings").update({ status: "active", reserved_until: null }).in("id", ids);
    await db.from("sellsource_sales").update({ status: "expired" }).eq("id", sale.id);
    return json({ error: (e as Error).message }, 502);
  }
});
