import type { Condition, InventoryItem } from "./types";

// SellSource: SellSync's own marketplace, where buyers buy straight from SellSync sellers, from a
// storefront or during a live show.
//
// Money moves through Stripe Connect. The buyer pays on Stripe's checkout page, Stripe sends the
// seller's share to the seller's own Stripe account, and SellSource keeps its fee. SellSync never
// sees a card number.

// SellSource's seller fee, a percent of the item price (not shipping).
export const SELLSOURCE_FEE_PCT = 3;
// Card processing, which Stripe charges on everything the buyer pays (item plus shipping).
export const PROCESSING_PCT = 2.9;
export const PROCESSING_FLAT = 0.3;

const cents = (n: number) => Math.round(n * 100) / 100;

export interface SellSourceFees {
  sellsource: number;
  processing: number;
  total: number;
  payout: number; // what reaches the seller: item price + shipping - fees
}

export function sellSourceFees(price: number, shipping = 0): SellSourceFees {
  if (price <= 0) return { sellsource: 0, processing: 0, total: 0, payout: 0 };
  const sellsource = cents((price * SELLSOURCE_FEE_PCT) / 100);
  const processing = cents(((price + shipping) * PROCESSING_PCT) / 100 + PROCESSING_FLAT);
  const total = cents(sellsource + processing);
  return { sellsource, processing, total, payout: cents(price + shipping - total) };
}

// Payouts: "none" until the seller starts Stripe's sign-up, "pending" while Stripe checks their
// details, and "ready" once Stripe says they can be paid. Only ready sellers can take a payment.
export type PayoutState = "none" | "pending" | "ready";

export interface SellerProfile {
  userId: string;
  handle: string; // the storefront address: sellsync…/?shop=handle
  shopName: string;
  bio?: string;
  shippingPrice: number; // shipping the buyer pays for the first item in a package
  // Each extra item in the same package (a cart, or more wins in the same live show). Usually 0:
  // one more shirt in the mailer costs the seller next to nothing.
  extraItemShipping: number;
  payouts: PayoutState;
}

// Combined shipping: one package, one label. The first item pays the seller's shipping price and
// every other item in the package pays the extra-item price.
export function packageShipping(seller: Pick<SellerProfile, "shippingPrice" | "extraItemShipping">, items: number, alreadyPaidFirst = false): number {
  if (items <= 0) return 0;
  const extras = alreadyPaidFirst ? items : items - 1;
  return cents((alreadyPaidFirst ? 0 : seller.shippingPrice) + extras * seller.extraItemShipping);
}

export type MarketStatus = "active" | "reserved" | "sold" | "removed";

// One item for sale on SellSource. A copy of the seller's inventory item, made when they turn
// SellSource on for it, so buyers never read the seller's private inventory (cost, notes, bin).
export interface MarketListing {
  id: string;
  sellerId: string;
  handle: string;
  shopName: string;
  inventoryId: string;
  sku: string;
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
  condition?: Condition;
  price: number;
  shippingPrice: number;
  photos: string[];
  status: MarketStatus;
  createdAt: string;
}

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

// Storefront addresses: lower case letters, numbers and dashes.
export const cleanHandle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, HANDLE_MAX);

export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `Use at least ${HANDLE_MIN} letters or numbers.`;
  if (handle !== cleanHandle(handle)) return "Use only lower case letters, numbers and dashes.";
  return null;
}

export const storefrontUrl = (handle: string, origin = window.location.origin) => `${origin}/?shop=${encodeURIComponent(handle)}`;
export const listingUrl = (id: string, origin = window.location.origin) => `${origin}/?market&item=${encodeURIComponent(id)}`;
export const showUrl = (id: string, origin = window.location.origin) => `${origin}/?live=${encodeURIComponent(id)}`;

// Why an item can't go on SellSource yet, or null when it can.
export function publishProblem(item: InventoryItem): string | null {
  if (item.status === "sold") return "Already sold.";
  if (!(item.listPrice && item.listPrice > 0)) return "Needs a price.";
  if (!(item.photo || item.photos?.length)) return "Needs a photo.";
  return null;
}

export function listingFromItem(item: InventoryItem, seller: SellerProfile, id: string, now = new Date()): MarketListing {
  const photos = item.photos?.length ? item.photos : item.photo ? [item.photo] : [];
  return {
    id,
    sellerId: seller.userId,
    handle: seller.handle,
    shopName: seller.shopName,
    inventoryId: item.id,
    sku: item.sku,
    title: item.title,
    description: item.description,
    brand: item.brand,
    category: item.category,
    size: item.size,
    color: item.color,
    condition: item.condition,
    price: item.listPrice ?? 0,
    shippingPrice: seller.shippingPrice,
    photos,
    status: "active",
    createdAt: now.toISOString(),
  };
}

// Simple search for the storefront and the Shop tab: every word has to appear somewhere.
export function matchesQuery(l: MarketListing, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [l.title, l.brand, l.category, l.size, l.color, l.description, l.shopName].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

// ---------- Live shows ----------

export type ShowStatus = "scheduled" | "live" | "ended";

export interface Auction {
  listingId: string;
  startingBid: number;
  endsAt: string; // ISO
}

export interface Show {
  id: string;
  sellerId: string;
  handle: string;
  shopName: string;
  title: string;
  startsAt: string; // ISO
  status: ShowStatus;
  listingIds: string[]; // the SellSource listings in this show, in running order
  pinnedId?: string; // the item on screen now
  auction?: Auction; // the running or last auction
}

export interface Bid {
  id: string;
  showId: string;
  listingId: string;
  name: string;
  amount: number;
  at: string; // ISO
  mine?: boolean; // placed from this browser
}

export interface ChatLine {
  id: string;
  showId: string;
  name: string;
  text: string;
  at: string;
  host?: boolean;
}

// What changes during a live show, sent to everyone watching.
export type LiveEvent =
  | { kind: "show"; show: Show }
  | { kind: "bid"; bid: Bid }
  | { kind: "chat"; line: ChatLine }
  | { kind: "sold"; listingId: string; name: string; price: number };

export const AUCTION_SECONDS = [15, 30, 60];
// A bid in the last few seconds puts the clock back to this many seconds, so nobody can snipe.
export const SOFT_CLOSE_SECONDS = 10;
export const CHAT_MAX = 200;

// The smallest raise over the high bid, by price.
export function bidIncrement(high: number): number {
  if (high < 25) return 1;
  if (high < 100) return 2;
  if (high < 250) return 5;
  return 10;
}

export function highBid<B extends Bid>(bids: B[], listingId: string): B | undefined {
  return bids.filter((b) => b.listingId === listingId).reduce<B | undefined>((top, b) => (!top || b.amount > top.amount ? b : top), undefined);
}

export function minNextBid(auction: Auction, bids: Bid[]): number {
  const top = highBid(bids, auction.listingId);
  return top ? top.amount + bidIncrement(top.amount) : auction.startingBid;
}

export const auctionOpen = (a: Auction | undefined, now = Date.now()) => !!a && new Date(a.endsAt).getTime() > now;
export const secondsLeft = (a: Auction | undefined, now = Date.now()) => (a ? Math.max(0, Math.ceil((new Date(a.endsAt).getTime() - now) / 1000)) : 0);

// Checks a bid and returns the auction afterwards (with a later end when it came in at the last
// moment), or the reason it's refused. The database runs the same rules for real accounts.
export function placeBid(auction: Auction | undefined, bids: Bid[], amount: number, now = Date.now()): { auction: Auction } | { error: string } {
  if (!auction || !auctionOpen(auction, now)) return { error: "This auction has ended." };
  const min = minNextBid(auction, bids);
  if (!(amount >= min)) return { error: `Bid at least $${min}.` };
  const floor = now + SOFT_CLOSE_SECONDS * 1000;
  const ends = new Date(auction.endsAt).getTime();
  return { auction: ends < floor ? { ...auction, endsAt: new Date(floor).toISOString() } : auction };
}

export const startAuction = (listingId: string, startingBid: number, seconds: number, now = Date.now()): Auction => ({
  listingId,
  startingBid: Math.max(1, Math.round(startingBid)),
  endsAt: new Date(now + seconds * 1000).toISOString(),
});
