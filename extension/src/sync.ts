import type { Platform } from "../../src/lib/types";
import { NotReadyError, type Connector, type ImportedOrder } from "./connectors/types";

export type SyncStatus = "ok" | "logged-out" | "not-ready" | "error";

export interface PlatformResult {
  platform: Platform;
  status: SyncStatus;
  imported: number;
  labels: number;
  message?: string;
}

// Where synced orders go: the seller's Reship account.
export interface OrderSink {
  // Order numbers already in Reship for this marketplace, mapped to whether each has its label.
  knownOrders(platform: Platform): Promise<Map<string, boolean>>;
  saveOrder(order: ImportedOrder, label: Blob | null): Promise<void>;
  attachLabel(order: ImportedOrder, label: Blob): Promise<void>;
}

// Pulls new orders (and their labels) from every enabled marketplace. One marketplace failing
// never stops the others; each reports its own status for the popup.
export async function syncAll(connectors: Connector[], enabled: Set<Platform>, sink: OrderSink): Promise<PlatformResult[]> {
  const results: PlatformResult[] = [];
  for (const c of connectors) {
    if (!enabled.has(c.platform)) continue;
    const result: PlatformResult = { platform: c.platform, status: "ok", imported: 0, labels: 0 };
    try {
      if (!(await c.isLoggedIn())) {
        result.status = "logged-out";
        results.push(result);
        continue;
      }
      const known = await sink.knownOrders(c.platform);
      for (const order of await c.listOrdersToShip()) {
        const hasLabel = known.get(order.orderNumber);
        if (hasLabel) continue;
        // A label can be missing because the marketplace hadn't made it yet; later syncs retry.
        const label = await c.downloadLabel(order).catch(() => null);
        if (hasLabel === undefined) {
          await sink.saveOrder(order, label);
          result.imported++;
          if (label) result.labels++;
        } else if (label) {
          await sink.attachLabel(order, label);
          result.labels++;
        }
      }
    } catch (e) {
      result.status = e instanceof NotReadyError ? "not-ready" : "error";
      result.message = e instanceof Error ? e.message : String(e);
    }
    results.push(result);
  }
  return results;
}
