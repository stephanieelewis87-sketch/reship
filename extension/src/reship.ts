import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Order, Platform } from "../../src/lib/types";
import type { ImportedOrder } from "./connectors/types";
import type { OrderSink } from "./sync";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

// Keeps the Reship sign-in in extension storage, shared by the popup and the background worker.
const chromeStorage: SupportedStorage = {
  getItem: async (key) => ((await chrome.storage.local.get(key))[key] as string | undefined) ?? null,
  setItem: async (key, value) => chrome.storage.local.set({ [key]: value }),
  removeItem: async (key) => chrome.storage.local.remove(key),
};

export const reship = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: { storage: chromeStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const today = () => new Date().toISOString().slice(0, 10);

export function supabaseSink(userId: string): OrderSink {
  const labelPath = (orderId: string) => `${userId}/${orderId}.pdf`;
  const uploadLabel = async (orderId: string, label: Blob) => {
    const { error } = await reship.storage.from("labels").upload(labelPath(orderId), label, { upsert: true, contentType: "application/pdf" });
    if (error) throw error;
  };
  const labelInfo = (o: ImportedOrder) => ({ fileName: `${o.platform}-${o.orderNumber}.pdf`, uploadedAt: new Date().toISOString() });

  return {
    async knownOrders(platform: Platform) {
      const { data, error } = await reship.from("orders").select("order_number, label, items").eq("platform", platform);
      if (error) throw error;
      return new Map(
        (data ?? []).map((r: { order_number: string; label: Order["label"] | null; items: Order["items"] | null }) => [
          r.order_number,
          { hasLabel: !!r.label, missingSku: !(r.items ?? []).some((i) => i.sku) },
        ]),
      );
    },

    async fillSkus(o) {
      const { data, error } = await reship
        .from("orders")
        .select("id, items")
        .eq("platform", o.platform)
        .eq("order_number", o.orderNumber)
        .single();
      if (error) throw error;
      const items = (data.items as Order["items"]).map((item, i) => ({ ...item, sku: item.sku || o.items[i]?.sku }));
      const { error: updateError } = await reship.from("orders").update({ items }).eq("id", data.id);
      if (updateError) throw updateError;
    },

    async saveOrder(o, label) {
      const id = crypto.randomUUID();
      if (label) await uploadLabel(id, label);
      const { error } = await reship.from("orders").insert({
        id,
        user_id: userId,
        platform: o.platform,
        order_number: o.orderNumber,
        buyer: o.buyer,
        items: o.items,
        order_date: o.date || today(),
        status: "pending",
        carrier: o.carrier,
        tracking: o.tracking ?? null,
        ship_to: o.shipTo ?? null,
        label: label ? labelInfo(o) : null,
        source: "sync",
      });
      if (error) throw error;
    },

    async attachLabel(o, label) {
      const { data, error } = await reship
        .from("orders")
        .select("id")
        .eq("platform", o.platform)
        .eq("order_number", o.orderNumber)
        .single();
      if (error) throw error;
      await uploadLabel(data.id, label);
      const { error: updateError } = await reship.from("orders").update({ label: labelInfo(o) }).eq("id", data.id);
      if (updateError) throw updateError;
    },
  };
}
