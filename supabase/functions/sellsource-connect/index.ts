// SellSource payouts: signs a seller up for a Stripe Express account (Stripe collects their ID and
// bank details; Hubby never sees them), and reads back whether Stripe says they can be paid.
//   POST {action: "start", returnUrl} → {url} of Stripe's sign-up page
//   POST {action: "refresh"}          → {payouts}
// Secrets: STRIPE_SECRET_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, stripe } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth } = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!auth.user) return json({ error: "Sign in first." }, 401);
  const body = await req.json().catch(() => ({}));

  const { data: seller } = await db.from("sellsource_sellers").select("user_id, stripe_account_id, payouts").eq("user_id", auth.user.id).maybeSingle();
  if (!seller) return json({ error: "Open your storefront first." }, 400);

  try {
    let account = seller.stripe_account_id as string | null;
    if (body.action === "refresh") {
      if (!account) return json({ payouts: "none" });
      const a = await stripe(`accounts/${account}`);
      const payouts = a.charges_enabled && a.payouts_enabled ? "ready" : "pending";
      await db.from("sellsource_sellers").update({ payouts }).eq("user_id", auth.user.id);
      return json({ payouts });
    }
    if (!account) {
      const a = await stripe("accounts", {
        type: "express",
        country: "US",
        email: auth.user.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: "individual",
        business_profile: { product_description: "Secondhand items sold on SellSource" },
        metadata: { sellsync_user: auth.user.id },
      });
      account = a.id as string;
      await db.from("sellsource_sellers").update({ stripe_account_id: account, payouts: "pending" }).eq("user_id", auth.user.id);
    }
    const back = typeof body.returnUrl === "string" ? body.returnUrl : Deno.env.get("APP_URL") ?? "";
    const link = await stripe("account_links", { account, refresh_url: back, return_url: back, type: "account_onboarding" });
    return json({ url: link.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
