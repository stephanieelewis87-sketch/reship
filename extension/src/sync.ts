import type { Platform, ShipmentStatus } from "../../src/lib/types";
import { NotReadyError, type Connector, type ImportedOrder } from "./connectors/types";

export type SyncStatus = "ok" | "logged-out" | "not-ready" | "error";

export interface PlatformResult {
  platform: Platform;
  status: SyncStatus;
  imported: number;
  labels: number;
  message?: string;
}

export interface KnownOrder {
  hasLabel: boolean;
  // No item in Reship has a SKU yet, so one found on the marketplace can be filled in.
  missingSku: boolean;
  shipment?: ShipmentStatus;
}

// Where synced orders go: the seller's Reship account.
export interface OrderSink {
  // Orders already in Reship for this marketplace, by order number.
  knownOrders(platform: Platform): Promise<Map<string, KnownOrder>>;
  saveOrder(order: ImportedOrder, label: Blob | null): Promise<void>;
  attachLabel(order: ImportedOrder, label: Blob): Promise<void>;
  // Copies the marketplace's SKUs onto an order already in Reship.
  fillSkus(order: ImportedOrder): Promise<void>;
  // Records where a shipped order is now (in transit, delivered and so on).
  updateShipment(platform: Platform, orderNumber: string, status: ShipmentStatus): Promise<void>;
  // A new sale came in: mark its listing sold and take the same item down on other marketplaces.
  recordSale?(order: ImportedOrder): Promise<void>;
}

const hasSku = (order: ImportedOrder) => order.items.some((i) => i.sku);

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
        const existing = known.get(order.orderNumber);
        if (existing?.missingSku && hasSku(order)) await sink.fillSkus(order);
        if (existing?.hasLabel) continue;
        // A label can be missing because the marketplace hadn't made it yet; later syncs retry.
        const label = await c.downloadLabel(order).catch(() => null);
        if (!existing) {
          await sink.saveOrder(order, label);
          // Delisting elsewhere is extra; a failure here never fails the import.
          await sink.recordSale?.(order).catch(() => {});
          result.imported++;
          if (label) result.labels++;
        } else if (label) {
          await sink.attachLabel(order, label);
          result.labels++;
        }
      }
      await syncShipments(c, known, sink);
    } catch (e) {
      result.status = e instanceof NotReadyError ? "not-ready" : "error";
      result.message = e instanceof Error ? e.message : String(e);
    }
    results.push(result);
  }
  return results;
}

// Tracking is extra: a failure here (for example before the shipment column exists) never
// fails the label sync.
async function syncShipments(c: Connector, known: Map<string, KnownOrder>, sink: OrderSink) {
  if (!c.listShipmentUpdates) return;
  try {
    for (const update of await c.listShipmentUpdates()) {
      const existing = known.get(update.orderNumber);
      if (!existing || existing.shipment === update.status) continue;
      await sink.updateShipment(c.platform, update.orderNumber, update.status);
    }
  } catch {
    // Retried on the next sync.
  }
}
