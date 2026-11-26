// Stripe tells SellSource what happened:
//   checkout.session.completed → the items are sold and the order lands in the seller's Orders
//                                (a later win in the same live show joins the first package)
//   checkout.session.expired   → the held items go back on sale
//   account.updated            → a seller's payouts became ready (or stopped)
// Register this function's URL in Stripe (Developers > Webhooks) for those events, including
// "Events on Connected accounts" for account.updated. Verify-JWT must be off for this function
// (supabase functions deploy sellsource-webhook --no-verify-jwt); Stripe's signature is checked instead.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET (optional).
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, verifyStripe } from "../_shared/stripe.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function completed(session: Record<string, any>) {
  const saleId = session.metadata?.sale_id;
  if (!saleId || session.payment_status !== "paid") return;
  const { data: sale } = await db.from("sellsource_sales").select("*").eq("id", saleId).single();
  if (!sale || sale.status === "paid") return; // Stripe can send an event twice
  const { data: listings } = await db.from("sellsource_listings").select("*").in("id", sale.listing_ids);
  await db.from("sellsource_listings").update({ status: "sold", reserved_until: null }).in("id", sale.listing_ids);

  const ship = session.collected_information?.shipping_details ?? session.shipping_details ?? {};
  const a = ship.address ?? {};
  const name = ship.name ?? session.customer_details?.name ?? session.metadata?.buyer_name ?? "SellSource buyer";
  const shipTo = { name, street1: a.line1 ?? "", street2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "", zip: a.postal_code ?? "", country: a.country ?? "US" };
  const items = (listings ?? []).map((l) => ({ name: l.title, sku: l.sku, photo: l.photos?.[0], price: Number(l.price), brand: l.brand ?? undefined, category: l.category ?? undefined }));
  // A single item may have sold for its winning bid rather than its listed price; carts are
  // always at listed prices.
  if (items.length === 1) items[0].price = Number(sale.items_total);

  // Combined shipping: a later win in the same show goes into the first package's order.
  let orderId: string | null = null;
  if (sale.show_id) {
    const { data: first } = await db
      .from("sellsource_sales")
      .select("order_id")
      .eq("show_id", sale.show_id)
      .eq("buyer_token", sale.buyer_token)
      .eq("status", "paid")
      .not("order_id", "is", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (first?.order_id) {
      const { data: order } = await db.from("orders").select("items, fees, status").eq("id", first.order_id).single();
      if (order && order.status === "pending") {
        await db.from("orders").update({ items: [...order.items, ...items], fees: Number(order.fees ?? 0) + Number(sale.fees) }).eq("id", first.order_id);
        orderId = first.order_id;
      }
    }
  }
  if (!orderId) {
    orderId = crypto.randomUUID();
    await db.from("orders").insert({
      id: orderId,
      user_id: sale.seller_id,
      platform: "SellSource",
      order_number: `SS-${orderId.slice(0, 8).toUpperCase()}`,
      buyer: name,
      items,
      order_date: new Date().toISOString().slice(0, 10),
      status: "pending",
      carrier: "",
      ship_to: shipTo,
      source: "sync",
      fees: sale.fees,
    });
  }
  await db.from("sellsource_sales").update({ status: "paid", order_id: orderId }).eq("id", saleId);
}

async function expired(session: Record<string, any>) {
  const saleId = session.metadata?.sale_id;
  if (!saleId) return;
  const { data: sale } = await db.from("sellsource_sales").select("*").eq("id", saleId).single();
  if (!sale || sale.status !== "pending") return;
  await db.from("sellsource_listings").update({ status: "active", reserved_until: null }).in("id", sale.listing_ids).eq("status", "reserved");
  await db.from("sellsource_sales").update({ status: "expired" }).eq("id", saleId);
}

Deno.serve(async (req) => {
  const raw = await req.text();
  const secrets = [Deno.env.get("STRIPE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")].filter(Boolean) as string[];
  if (!(await verifyStripe(raw, req.headers.get("Stripe-Signature"), secrets))) return json({ error: "Bad signature." }, 400);
  const event = JSON.parse(raw);
  const obj = event.data?.object ?? {};
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await completed(obj);
  if (event.type === "checkout.session.expired") await expired(obj);
  if (event.type === "account.updated") {
    const payouts = obj.charges_enabled && obj.payouts_enabled ? "ready" : "pending";
    await db.from("sellsource_sellers").update({ payouts }).eq("stripe_account_id", obj.id);
  }
  return json({ received: true });
});
