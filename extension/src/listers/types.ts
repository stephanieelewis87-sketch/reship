import type { Platform } from "../../../src/lib/types";
import type { DelistSpec, FieldSpec } from "./page";

// How Reship lists and delists on one marketplace, through the seller's own logged-in browser.
export interface Lister {
  platform: Platform;
  sellUrl: string;
  listingUrl(listingId: string): string;
  // The marketplace's id for a listing, from the address of its page. Null for any other page.
  listingIdFromUrl(url: string): string | null;
  // The page the marketplace sends a logged-out seller to.
  isLoginPage(url: string): boolean;
  fields: Omit<FieldSpec, "value">[];
  photoSelectors: string[];
  // Delisting hides the listing (reversible) rather than deleting it.
  delist: DelistSpec;
}
