import { canCrosslist, checkDraft, fitDraft, jobFromRow, type ListingDraft, type ListingJob, type ListingJobRow } from "./crosslist";
import { supabase } from "./supabase";
import type { Platform } from "./types";

// The app's side of crosslisting: it queues jobs, and the Reship browser extension (signed in
// to the same account) opens each marketplace's sell form with the draft filled in, or delists.

export class CrosslistError extends Error {}

function db() {
  if (!supabase) throw new CrosslistError("Crosslisting needs a Reship account and the Reship browser extension.");
  return supabase;
}

// Queues one listing per marketplace. Throws with every problem when the draft can't list on one.
export async function queueCrosslist(
  draft: ListingDraft,
  platforms: Platform[],
  opts: { inventoryItemId?: string } = {},
): Promise<ListingJob[]> {
  const problems = platforms.flatMap((p) => checkDraft(p, draft).map((msg) => (canCrosslist(p) ? `${p}: ${msg}` : msg)));
  if (problems.length) throw new CrosslistError(problems.join("\n"));
  const rows = platforms.map((platform) => ({
    platform,
    action: "list" as const,
    draft: fitDraft(platform, draft),
    sku: draft.sku ?? null,
    inventory_item_id: opts.inventoryItemId ?? null,
  }));
  const { data, error } = await db().from("listing_jobs").insert(rows).select("*");
  if (error) throw error;
  return (data as ListingJobRow[]).map(jobFromRow);
}

// Queues taking a listing down. listingId is the marketplace's own id (for example m12345678901 on Mercari).
export async function queueDelist(
  platform: Platform,
  listingId: string,
  opts: { inventoryItemId?: string; sku?: string; reason?: string } = {},
): Promise<ListingJob> {
  const { data, error } = await db()
    .from("listing_jobs")
    .insert({
      platform,
      action: "delist",
      listing_id: listingId,
      inventory_item_id: opts.inventoryItemId ?? null,
      sku: opts.sku ?? null,
      reason: opts.reason ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return jobFromRow(data as ListingJobRow);
}

// Recent jobs, newest first, for showing progress next to an item.
export async function listJobs(filter: { inventoryItemId?: string; limit?: number } = {}): Promise<ListingJob[]> {
  let query = db().from("listing_jobs").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 50);
  if (filter.inventoryItemId) query = query.eq("inventory_item_id", filter.inventoryItemId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ListingJobRow[]).map(jobFromRow);
}

// Stops a job the extension hasn't started yet.
export async function cancelJob(id: string): Promise<void> {
  const { error } = await db().from("listing_jobs").update({ status: "cancelled" }).eq("id", id).eq("status", "queued");
  if (error) throw error;
}
