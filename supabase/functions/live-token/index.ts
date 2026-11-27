// Live show video: hands out LiveKit access tokens. The host (the show's seller, signed in) may
// publish their camera; everyone else may only watch. Without LiveKit set up it answers {off:true}
// and the app shows item photos instead of video.
//   POST {showId, role: "host" | "viewer", name} → {url, token} or {off: true}
// Secrets: LIVEKIT_URL (wss://…), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.19.1";
import { cors, json } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("LIVEKIT_URL");
  const key = Deno.env.get("LIVEKIT_API_KEY");
  const secret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !key || !secret) return json({ off: true });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const showId = typeof body.showId === "string" ? body.showId : "";
  const { data: show } = await db.from("live_shows").select("id, seller_id, status").eq("id", showId).maybeSingle();
  if (!show) return json({ error: "That show isn't here." }, 404);

  let host = false;
  if (body.role === "host") {
    const { data: auth } = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    if (auth.user?.id !== show.seller_id) return json({ error: "Only the seller can host this show." }, 403);
    host = true;
  } else if (show.status !== "live") {
    return json({ error: "The show isn't live yet." }, 409);
  }

  const name = String(body.name ?? "Guest").slice(0, 30);
  const at = new AccessToken(key, secret, { identity: host ? `host-${show.seller_id}` : `viewer-${crypto.randomUUID()}`, name, ttl: "6h" });
  at.addGrant({ room: `show-${show.id}`, roomJoin: true, canPublish: host, canSubscribe: true, canPublishData: false });
  return json({ url, token: await at.toJwt() });
});
