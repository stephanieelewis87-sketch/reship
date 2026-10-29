import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Order, Platform } from "../../src/lib/types";
import type { ImportedOrder } from "./connectors/types";
import type { OrderSink } from "./sync";
import type { JobStore } from "./jobs";
import { jobFromRow, type ListingJobRow } from "../../src/lib/crosslist";

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
    recordSale,

    async knownOrders(platform: Platform) {
      const { data, error } = await reship.from("orders").select("*").eq("platform", platform);
      if (error) throw error;
      return new Map(
        (data ?? []).map((r: { order_number: string; label: Order["label"] | null; items: Order["items"] | null; shipment?: Order["shipment"] | null }) => [
          r.order_number,
          { hasLabel: !!r.label, missingSku: !(r.items ?? []).some((i) => i.sku), shipment: r.shipment?.status },
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

    async updateShipment(platform, orderNumber, status) {
      const patch: Record<string, unknown> = { shipment: { status, updatedAt: new Date().toISOString() } };
      if (status === "in_transit" || status === "delivered") patch.status = "shipped";
      const { error } = await reship.from("orders").update(patch).eq("platform", platform).eq("order_number", orderNumber);
      if (error) throw error;
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

// --- Crosslisting ---------------------------------------------------------------------------

export function supabaseJobStore(): JobStore {
  return {
    async queuedJobs() {
      const { data, error } = await reship.from("listing_jobs").select("*").eq("status", "queued").order("created_at").limit(5);
      if (error) throw error;
      return (data as ListingJobRow[]).map(jobFromRow);
    },

    async updateJob(id, patch) {
      const { error } = await reship.from("listing_jobs").update({ status: patch.status, message: patch.message ?? null }).eq("id", id);
      if (error) throw error;
    },

    async saveListing(l) {
      const { error } = await reship.from("marketplace_listings").upsert(
        {
          platform: l.platform,
          listing_id: l.listingId,
          url: l.url ?? null,
          sku: l.sku ?? null,
          inventory_item_id: l.inventoryItemId ?? null,
          title: l.title ?? null,
          price: l.price ?? null,
          status: l.status,
        },
        { onConflict: "user_id,platform,listing_id" },
      );
      if (error) throw error;
    },

    async setListingStatus(platform, listingId, status) {
      const { error } = await reship.from("marketplace_listings").update({ status }).eq("platform", platform).eq("listing_id", listingId);
      if (error) throw error;
    },
  };
}

interface ListingRow {
  platform: Platform;
  listing_id: string;
  sku: string | null;
  inventory_item_id: string | null;
  status: string;
}

// When an item sells, its listing is marked sold and the same item's listings on other
// marketplaces are queued to come down, for each marketplace the seller turned auto-delist on for.
export async function recordSale(order: ImportedOrder): Promise<void> {
  const listingIds = order.listingIds ?? [];
  const skus = order.items.map((i) => i.sku).filter((s): s is string => !!s);
  const sold: ListingRow[] = [];
  if (listingIds.length) {
    const { data, error } = await reship
      .from("marketplace_listings")
      .update({ status: "sold" })
      .eq("platform", order.platform)
      .in("listing_id", listingIds)
      .select("platform, listing_id, sku, inventory_item_id, status");
    if (error) throw error;
    sold.push(...((data ?? []) as ListingRow[]));
  }
  const itemIds = [...new Set(sold.map((l) => l.inventory_item_id).filter((id): id is string => !!id))];
  const allSkus = [...new Set([...skus, ...sold.map((l) => l.sku).filter((s): s is string => !!s)])];
  if (!itemIds.length && !allSkus.length) return;

  const filters = [
    itemIds.length ? `inventory_item_id.in.(${itemIds.map(quote).join(",")})` : "",
    allSkus.length ? `sku.in.(${allSkus.map(quote).join(",")})` : "",
  ].filter(Boolean);
  const { data: others, error } = await reship
    .from("marketplace_listings")
    .select("platform, listing_id, sku, inventory_item_id, status")
    .eq("status", "active")
    .neq("platform", order.platform)
    .or(filters.join(","));
  if (error) throw error;

  const autoDelist = await autoDelistSettings();
  const targets = ((others ?? []) as ListingRow[]).filter((l) => autoDelist[l.platform]);
  if (!targets.length) return;

  const { data: pending } = await reship
    .from("listing_jobs")
    .select("platform, listing_id")
    .eq("action", "delist")
    .in("status", ["queued", "running", "needs_you"]);
  const already = new Set((pending ?? []).map((j: { platform: string; listing_id: string }) => `${j.platform}:${j.listing_id}`));
  const jobs = targets
    .filter((l) => !already.has(`${l.platform}:${l.listing_id}`))
    .map((l) => ({
      platform: l.platform,
      action: "delist",
      listing_id: l.listing_id,
      sku: l.sku,
      inventory_item_id: l.inventory_item_id,
      reason: `Sold on ${order.platform === "WhatNot" ? "Whatnot" : order.platform}`,
    }));
  if (!jobs.length) return;
  const { error: insertError } = await reship.from("listing_jobs").insert(jobs);
  if (insertError) throw insertError;
}

// PostgREST filter values with commas or brackets need quoting.
const quote = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

// The seller's auto-delist choice per marketplace, from their Reship settings (off unless turned on).
async function autoDelistSettings(): Promise<Partial<Record<Platform, boolean>>> {
  const { data } = await reship.from("settings").select("data").maybeSingle();
  return ((data?.data as { autoDelist?: Partial<Record<Platform, boolean>> } | undefined)?.autoDelist) ?? {};
}
