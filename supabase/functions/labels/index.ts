// Reship's own shipping labels, bought from EasyPost at its discounted carrier rates.
// Deploy with `supabase functions deploy labels` and set the key with
// `supabase secrets set EASYPOST_API_KEY=...`. Without the key the app shows estimates only.
//
//   { action: "rates", to, from, parcel: { weightLbs, packageType } } → { shipmentId, rates }
//   { action: "buy", shipmentId, rateId } → { tracking, carrier, service, price, labelPdfBase64 }
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const EASYPOST = "https://api.easypost.com/v2";
const CARRIERS = new Set(["USPS", "UPS", "UPSDAP", "FedEx", "FedExDefault"]);

// Rough outside sizes in inches, so carriers rate the parcel like the package the seller picked.
const PACKAGE_SIZE: Record<string, [number, number, number]> = {
  Envelope: [12, 9, 0.5],
  "Soft Pack": [14, 10, 2],
  "Small Box": [9, 6, 4],
  "Medium Box": [12, 10, 6],
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Address {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

const complete = (a?: Address | null): a is Address =>
  !!a && [a.name, a.street1, a.city, a.state, a.zip, a.country].every((v) => typeof v === "string" && v.trim());

async function easypost(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("EASYPOST_API_KEY")!;
  const res = await fetch(`${EASYPOST}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${btoa(`${key}:`)}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `EasyPost answered ${res.status}`);
  return body;
}

const prettyCarrier = (c: string) => (c.startsWith("UPS") ? "UPS" : c.startsWith("FedEx") ? "FedEx" : c);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!Deno.env.get("EASYPOST_API_KEY")) return reply({ error: "label buying isn't set up on this Reship server" }, 503);

  // Only signed-in Reship users can quote or buy, and only shipments they started.
  const auth = req.headers.get("Authorization") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await db.auth.getUser();
  const userId = who?.user?.id;
  if (!userId) return reply({ error: "sign in to buy labels" }, 401);

  try {
    const body = await req.json();

    if (body.action === "rates") {
      const { to, from, parcel } = body as { to?: Address; from?: Address; parcel?: { weightLbs?: number; packageType?: string } };
      if (!complete(to)) return reply({ error: "the buyer's address is incomplete" }, 400);
      if (!complete(from)) return reply({ error: "add your ship-from address in Settings" }, 400);
      const weightLbs = Number(parcel?.weightLbs);
      if (!(weightLbs > 0 && weightLbs <= 150)) return reply({ error: "enter the package weight" }, 400);
      const [length, width, height] = PACKAGE_SIZE[parcel?.packageType ?? ""] ?? PACKAGE_SIZE["Soft Pack"];

      const shipment = await easypost("/shipments", {
        method: "POST",
        body: JSON.stringify({
          shipment: {
            reference: userId,
            to_address: to,
            from_address: from,
            parcel: { weight: Math.ceil(weightLbs * 16 * 10) / 10, length, width, height },
            options: { label_format: "PDF", label_size: "4x6" },
          },
        }),
      });
      const rates = (shipment.rates ?? [])
        .filter((r: { carrier: string }) => CARRIERS.has(r.carrier))
        .map((r: { id: string; carrier: string; service: string; rate: string; delivery_days?: number | null }) => ({
          id: r.id,
          carrier: prettyCarrier(r.carrier),
          service: r.service.replace(/([a-z])([A-Z])/g, "$1 $2"),
          price: Number(r.rate),
          days: r.delivery_days ? `${r.delivery_days} day${r.delivery_days === 1 ? "" : "s"}` : "",
        }))
        .sort((a: { price: number }, b: { price: number }) => a.price - b.price);
      return reply({ shipmentId: shipment.id, rates });
    }

    if (body.action === "buy") {
      const { shipmentId, rateId } = body as { shipmentId?: string; rateId?: string };
      if (!shipmentId || !rateId) return reply({ error: "pick a rate first" }, 400);
      const shipment = await easypost(`/shipments/${encodeURIComponent(shipmentId)}`);
      if (shipment.reference !== userId) return reply({ error: "that shipment isn't yours" }, 403);

      const bought = shipment.postage_label
        ? shipment
        : await easypost(`/shipments/${encodeURIComponent(shipmentId)}/buy`, { method: "POST", body: JSON.stringify({ rate: { id: rateId } }) });
      const pdfUrl = bought.postage_label?.label_pdf_url ?? bought.postage_label?.label_url;
      const pdf = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer());
      let binary = "";
      for (let i = 0; i < pdf.length; i += 0x8000) binary += String.fromCharCode(...pdf.subarray(i, i + 0x8000));
      return reply({
        tracking: bought.tracking_code,
        carrier: prettyCarrier(bought.selected_rate.carrier),
        service: bought.selected_rate.service.replace(/([a-z])([A-Z])/g, "$1 $2"),
        price: Number(bought.selected_rate.rate),
        labelPdfBase64: btoa(binary),
      });
    }

    return reply({ error: "unknown action" }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
