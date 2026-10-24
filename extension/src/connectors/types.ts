import type { Address, OrderItem, Platform } from "../../../src/lib/types";

// What a connector reads from a marketplace for one sold order.
export interface ImportedOrder {
  platform: Platform;
  orderNumber: string;
  buyer: string;
  date: string; // YYYY-MM-DD
  items: OrderItem[];
  carrier: string;
  tracking?: string;
  shipTo?: Address;
  // Where the marketplace serves this order's label; fetched with the seller's own session.
  labelUrl?: string;
}

// One per marketplace. Each runs inside the seller's browser and uses the session they are
// already logged in with, so Reship never sees or stores marketplace passwords.
export interface Connector {
  platform: Platform;
  // Site the seller must be logged in to; shown in the popup as a link.
  loginUrl: string;
  isLoggedIn(): Promise<boolean>;
  // Sold orders that still need to ship, newest first.
  listOrdersToShip(): Promise<ImportedOrder[]>;
  downloadLabel(order: ImportedOrder): Promise<Blob | null>;
}

export class NotReadyError extends Error {
  constructor(platform: Platform) {
    super(`${platform} import isn't built yet`);
  }
}
