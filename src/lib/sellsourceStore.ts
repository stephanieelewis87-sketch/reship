import { newId } from "./ids";
import { supabase } from "./supabase";
import { isoDay } from "./analytics";
import {
  type Bid,
  type ChatLine,
  CHAT_MAX,
  type LiveEvent,
  type MarketListing,
  type SellerProfile,
  type Show,
  highBid,
  listingFromItem,
  matchesQuery,
  minNextBid,
  packageShipping,
  placeBid,
  sellSourceFees,
} from "./sellsource";
import type { InventoryItem, Order } from "./types";

// SellSource and live shows, behind the same two backends as the rest of the app: Supabase for
// real accounts, this browser's storage in demo mode.

export interface CheckoutRequest {
  listingIds: string[]; // one seller's items, bought as one package
  showId?: string;
  buyerName?: string;
  // Demo mode only: the host records a practice sale for a pretend winner.
  practice?: boolean;
}

// Real accounts get Stripe's checkout page to go to. Demo mode records the sale on the spot.
export type CheckoutResult = { url: string } | { demoOrderId: string };

export interface VideoAccess {
  url: string; // the LiveKit server
  token: string;
}

export interface SellSourceApi {
  // Seller side (signed in).
  me(): Promise<SellerProfile | null>;
  saveProfile(p: Omit<SellerProfile, "userId" | "payouts">): Promise<SellerProfile>;
  // Starts or continues Stripe's payout sign-up and returns the page to send the seller to.
  // Demo mode has no Stripe, so it just marks payouts ready.
  startPayouts(): Promise<string | null>;
  refreshPayouts(): Promise<SellerProfile | null>;
  myListings(): Promise<MarketListing[]>;
  publish(items: InventoryItem[]): Promise<MarketListing[]>;
  unpublish(inventoryIds: string[]): Promise<void>;
  myShows(): Promise<Show[]>;
  saveShow(show: Show): Promise<void>;
  deleteShow(id: string): Promise<void>;
  // Host controls during a show: going live, pinning an item, starting an auction, ending.
  updateShow(show: Show): Promise<void>;

  // Buyer side (anyone, no account needed).
  browse(opts: { q?: string; handle?: string }): Promise<MarketListing[]>;
  getListings(ids: string[]): Promise<MarketListing[]>;
  seller(handle: string): Promise<SellerProfile | null>;
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
  getShow(id: string): Promise<Show | null>;
  upcomingShows(): Promise<Show[]>;
  bids(showId: string): Promise<Bid[]>;
  chatLines(showId: string): Promise<ChatLine[]>;
  bid(showId: string, listingId: string, name: string, amount: number): Promise<Bid>;
  chat(showId: string, name: string, text: string): Promise<void>;
  subscribe(showId: string, on: (e: LiveEvent) => void): () => void;
  // Null when no video service is set up (demo mode): the host still sees their own camera.
  video(showId: string, role: "host" | "viewer", name: string): Promise<VideoAccess | null>;
}

// Each browser gets a random buyer token, so it can prove which bids are its own and get combined
// shipping on later wins in the same show. It's not an account and holds nothing personal.
export function buyerToken(): string {
  const KEY = "sellsync.buyer.v1";
  try {
    let t = localStorage.getItem(KEY);
    if (!t) {
      t = `${newId()}${newId()}`;
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    return "no-storage";
  }
}

// ---------- Demo mode ----------

const KEY = "sellsync.sellsource.v1";
const DEMO_SELLER = "demo-me";

interface DemoSale {
  showId?: string;
  token: string;
  orderId: string;
}

interface DemoState {
  profile: SellerProfile | null;
  listings: MarketListing[];
  shows: Show[];
  bids: (Bid & { token: string })[];
  chat: ChatLine[];
  sales: DemoSale[];
}

const U = (id: string) => `https://images.unsplash.com/${id}?w=600&h=600&fit=crop&auto=format`;
// Other shops in the demo marketplace, so it looks like a marketplace and not one closet.
const DEMO_SHOPS: { handle: string; shopName: string; items: [string, string, string, number, string, string][] }[] = [
  {
    handle: "thrift-and-thread",
    shopName: "Thrift & Thread",
    items: [
      ["Vintage Levi's 550 relaxed jeans", "Levi's", "Bottoms", 34, "30", U("photo-1542272604-787c3835535d")],
      ["Wool plaid overshirt", "Pendleton", "Tops", 45, "M", U("photo-1598032895397-b9472444bf93")],
      ["Suede chelsea boots", "Blundstone", "Shoes", 88, "8", U("photo-1638247025967-b4e38f787b76")],
    ],
  },
  {
    handle: "y2k-vault",
    shopName: "Y2K Vault",
    items: [
      ["Baby phat velour zip hoodie", "Baby Phat", "Tops", 42, "S", U("photo-1556821840-3a63f95609a7")],
      ["Mini shoulder bag, silver", "Unbranded", "Bags", 26, "One size", U("photo-1584917865442-de89df76afd3")],
      ["Low rise flare jeans", "Miss Sixty", "Bottoms", 38, "27", U("photo-1541099649105-f69ad21f3246")],
    ],
  },
  {
    handle: "sneaker-shelf",
    shopName: "Sneaker Shelf",
    items: [
      ["Nike Dunk Low Panda, worn twice", "Nike", "Shoes", 92, "9.5", U("photo-1600185365926-3a2ce3cdb9eb")],
      ["New Balance 550 white green", "New Balance", "Shoes", 78, "10", U("photo-1539185441755-769473a23570")],
    ],
  },
];

function demoListings(now: number): MarketListing[] {
  return DEMO_SHOPS.flatMap((shop, s) =>
    shop.items.map(([title, brand, category, price, size, photo], i) => ({
      id: `demo-${shop.handle}-${i}`,
      sellerId: `demo-${shop.handle}`,
      handle: shop.handle,
      shopName: shop.shopName,
      inventoryId: `demo-${shop.handle}-${i}`,
      sku: `${shop.handle.slice(0, 2).toUpperCase()}-${100 + i}`,
      title,
      brand,
      category,
      size,
      condition: i % 2 ? "Like new" : "Good",
      price,
      shippingPrice: 6.99,
      photos: [photo],
      status: "active",
      createdAt: new Date(now - (s * 3 + i + 1) * 3600000).toISOString(),
    })),
  );
}

// The demo's orders live in the main demo store, which hands them over through these.
type DemoHooks = {
  orders: () => Promise<Order[]>;
  addOrder: (o: Order) => Promise<void>;
};

export class LocalSellSource implements SellSourceApi {
  private channel: BroadcastChannel | null = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("sellsync-live");
  private listeners = new Set<(e: LiveEvent) => void>();

  constructor(private hooks: DemoHooks) {
    this.channel?.addEventListener("message", (m) => this.listeners.forEach((l) => l(m.data as LiveEvent)));
  }

  private read(): DemoState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as DemoState;
    } catch {
      // fall through to a fresh demo
    }
    return { profile: null, listings: demoListings(Date.now()), shows: [], bids: [], chat: [], sales: [] };
  }

  private write(s: DemoState) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage full or blocked: the demo keeps working in memory for this page
    }
  }

  private emit(e: LiveEvent) {
    this.listeners.forEach((l) => l(e));
    this.channel?.postMessage(e);
  }

  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }

  async me() {
    return this.read().profile;
  }

  async saveProfile(p: Omit<SellerProfile, "userId" | "payouts">) {
    const s = this.read();
    if (s.listings.some((l) => l.handle === p.handle && l.sellerId !== DEMO_SELLER)) throw new Error("That address is taken. Try another.");
    const profile: SellerProfile = { ...p, userId: DEMO_SELLER, payouts: s.profile?.payouts ?? "none" };
    s.profile = profile;
    s.listings = s.listings.map((l) => (l.sellerId === DEMO_SELLER ? { ...l, handle: p.handle, shopName: p.shopName, shippingPrice: p.shippingPrice } : l));
    this.write(s);
    return profile;
  }

  async startPayouts() {
    const s = this.read();
    if (s.profile) s.profile.payouts = "ready";
    this.write(s);
    return null;
  }

  async refreshPayouts() {
    return this.read().profile;
  }

  async myListings() {
    return this.read().listings.filter((l) => l.sellerId === DEMO_SELLER);
  }

  async publish(items: InventoryItem[]) {
    const s = this.read();
    if (!s.profile) throw new Error("Set up your storefront first.");
    const made: MarketListing[] = [];
    for (const item of items) {
      const old = s.listings.find((l) => l.sellerId === DEMO_SELLER && l.inventoryId === item.id);
      const next = listingFromItem(item, s.profile, old?.id ?? newId());
      if (old) Object.assign(old, { ...next, createdAt: old.createdAt, status: old.status === "sold" ? "sold" : "active" });
      else s.listings.unshift(next);
      made.push(old ?? next);
    }
    this.write(s);
    return made;
  }

  async unpublish(inventoryIds: string[]) {
    const s = this.read();
    s.listings = s.listings.map((l) => (l.sellerId === DEMO_SELLER && inventoryIds.includes(l.inventoryId) && l.status !== "sold" ? { ...l, status: "removed" } : l));
    this.write(s);
  }

  async myShows() {
    return this.read().shows.filter((x) => x.sellerId === DEMO_SELLER);
  }

  async saveShow(show: Show) {
    const s = this.read();
    s.shows = [show, ...s.shows.filter((x) => x.id !== show.id)];
    this.write(s);
  }

  async deleteShow(id: string) {
    const s = this.read();
    s.shows = s.shows.filter((x) => x.id !== id);
    this.write(s);
  }

  async updateShow(show: Show) {
    await this.saveShow(show);
    this.emit({ kind: "show", show });
  }

  async browse({ q, handle }: { q?: string; handle?: string }) {
    return this.read()
      .listings.filter((l) => l.status === "active" && (!handle || l.handle === handle) && matchesQuery(l, q ?? ""))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getListings(ids: string[]) {
    const all = this.read().listings;
    return ids.flatMap((id) => all.filter((l) => l.id === id));
  }

  async seller(handle: string) {
    const s = this.read();
    if (s.profile?.handle === handle) return s.profile;
    const shop = DEMO_SHOPS.find((d) => d.handle === handle);
    return shop ? { userId: `demo-${shop.handle}`, handle, shopName: shop.shopName, shippingPrice: 6.99, extraItemShipping: 0, payouts: "ready" as const } : null;
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const s = this.read();
    const token = buyerToken();
    const items = s.listings.filter((l) => req.listingIds.includes(l.id));
    if (!items.length || items.some((l) => l.status !== "active")) throw new Error("Someone else just bought this.");
    if (new Set(items.map((l) => l.sellerId)).size > 1) throw new Error("Check out one shop at a time.");
    const show = req.showId ? s.shows.find((x) => x.id === req.showId) : undefined;
    // An auction item sells for the winning bid, and only to the winner.
    const prices = items.map((l) => {
      if (show?.auction?.listingId !== l.id) return l.price;
      const top = highBid(s.bids, l.id);
      if (!top || (top.token !== token && !req.practice)) throw new Error("Only the winning bidder can buy this item.");
      if (req.practice) req.buyerName = top.name;
      return top.amount;
    });
    const seller = items[0].sellerId === DEMO_SELLER ? s.profile : await this.seller(items[0].handle);
    const earlier = req.showId ? s.sales.find((x) => x.showId === req.showId && x.token === token) : undefined;
    const shipping = packageShipping(seller ?? { shippingPrice: items[0].shippingPrice, extraItemShipping: 0 }, items.length, !!earlier);
    const subtotal = prices.reduce((a, b) => a + b, 0);
    for (const l of items) l.status = "sold";

    let orderId = earlier?.orderId ?? newId();
    if (items[0].sellerId === DEMO_SELLER) {
      const lines = items.map((l, i) => ({ name: l.title, sku: l.sku, photo: l.photos[0], price: prices[i], brand: l.brand, category: l.category }));
      const order: Order = {
        id: orderId,
        platform: "SellSource",
        orderId: `SS-${orderId.slice(0, 6).toUpperCase()}`,
        buyer: req.buyerName?.trim() || "Demo buyer",
        items: lines,
        date: isoDay(new Date()),
        status: "pending",
        carrier: "",
        source: "sync",
        fees: sellSourceFees(subtotal, shipping).total,
        shipTo: { name: req.buyerName?.trim() || "Demo buyer", street1: "100 Sample St", city: "Austin", state: "TX", zip: "78701", country: "US" },
      };
      if (earlier) {
        // Combined shipping: a later win in the same show joins the first package.
        const prev = (await this.hooks.orders()).find((o) => o.id === earlier.orderId);
        if (prev) {
          order.items = [...prev.items, ...lines];
          order.fees = (prev.fees ?? 0) + sellSourceFees(subtotal, shipping).total;
          order.orderId = prev.orderId;
          order.buyer = prev.buyer;
          order.shipTo = prev.shipTo;
        } else orderId = order.id;
      }
      await this.hooks.addOrder(order);
    }
    if (!earlier) s.sales.push({ showId: req.showId, token, orderId });
    this.write(s);
    for (const l of items) this.emit({ kind: "sold", listingId: l.id, name: req.buyerName?.trim() || "A buyer", price: prices[items.indexOf(l)] });
    return { demoOrderId: orderId };
  }

  async getShow(id: string) {
    return this.read().shows.find((x) => x.id === id) ?? null;
  }

  async upcomingShows() {
    return this.read()
      .shows.filter((x) => x.status !== "ended")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async bids(showId: string) {
    const token = buyerToken();
    return this.read()
      .bids.filter((b) => b.showId === showId)
      .map(({ token: t, ...b }) => ({ ...b, mine: t === token }));
  }

  async chatLines(showId: string) {
    return this.read().chat.filter((c) => c.showId === showId);
  }

  async bid(showId: string, listingId: string, name: string, amount: number) {
    const s = this.read();
    const show = s.shows.find((x) => x.id === showId);
    if (!show || show.status !== "live" || show.auction?.listingId !== listingId) throw new Error("This auction has ended.");
    const result = placeBid(show.auction, s.bids, amount);
    if ("error" in result) throw new Error(result.error);
    const bid = { id: newId(), showId, listingId, name: name.trim().slice(0, 30) || "Guest", amount, at: new Date().toISOString(), token: buyerToken() };
    s.bids.push(bid);
    show.auction = result.auction;
    this.write(s);
    const { token: _t, ...pub } = bid;
    this.emit({ kind: "bid", bid: pub });
    this.emit({ kind: "show", show });
    return { ...pub, mine: true };
  }

  async chat(showId: string, name: string, text: string) {
    const s = this.read();
    const show = s.shows.find((x) => x.id === showId);
    const line: ChatLine = {
      id: newId(),
      showId,
      name: name.trim().slice(0, 30) || "Guest",
      text: text.trim().slice(0, CHAT_MAX),
      at: new Date().toISOString(),
      host: show?.sellerId === DEMO_SELLER && name === show.shopName,
    };
    if (!line.text) return;
    s.chat = [...s.chat.filter((c) => c.showId !== showId || s.chat.indexOf(c) > s.chat.length - 300), line];
    this.write(s);
    this.emit({ kind: "chat", line });
  }

  // Practice viewers for the demo, so a host can try a show alone. Their bids and chat are marked
  // as coming from other people, never from this browser.
  async practiceBid(showId: string, name: string) {
    const s = this.read();
    const show = s.shows.find((x) => x.id === showId);
    if (!show?.auction || show.status !== "live") return;
    const amount = minNextBid(show.auction, s.bids);
    const result = placeBid(show.auction, s.bids, amount);
    if ("error" in result) return;
    const bid = { id: newId(), showId, listingId: show.auction.listingId, name, amount, at: new Date().toISOString(), token: `practice-${name}` };
    s.bids.push(bid);
    show.auction = result.auction;
    this.write(s);
    const { token: _t, ...pub } = bid;
    this.emit({ kind: "bid", bid: pub });
    this.emit({ kind: "show", show });
  }

  async practiceChat(showId: string, name: string, text: string) {
    const s = this.read();
    const line: ChatLine = { id: newId(), showId, name, text, at: new Date().toISOString() };
    s.chat.push(line);
    this.write(s);
    this.emit({ kind: "chat", line });
  }

  subscribe(showId: string, on: (e: LiveEvent) => void) {
    const l = (e: LiveEvent) => {
      const id = e.kind === "show" ? e.show.id : e.kind === "bid" ? e.bid.showId : e.kind === "chat" ? e.line.showId : showId;
      if (id === showId) on(e);
    };
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }

  async video() {
    return null;
  }
}

// ---------- Real accounts: Supabase, Stripe and LiveKit ----------

interface ListingRow {
  id: string;
  seller_id: string;
  handle: string;
  shop_name: string;
  inventory_id: string;
  sku: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  condition: MarketListing["condition"] | null;
  price: number;
  shipping_price: number;
  photos: string[];
  status: MarketListing["status"];
  created_at: string;
}

const toListing = (r: ListingRow): MarketListing => ({
  id: r.id,
  sellerId: r.seller_id,
  handle: r.handle,
  shopName: r.shop_name,
  inventoryId: r.inventory_id,
  sku: r.sku,
  title: r.title,
  description: r.description ?? undefined,
  brand: r.brand ?? undefined,
  category: r.category ?? undefined,
  size: r.size ?? undefined,
  color: r.color ?? undefined,
  condition: r.condition ?? undefined,
  price: Number(r.price),
  shippingPrice: Number(r.shipping_price),
  photos: r.photos ?? [],
  status: r.status,
  createdAt: r.created_at,
});

const fromListing = (l: MarketListing) => ({
  id: l.id,
  seller_id: l.sellerId,
  handle: l.handle,
  shop_name: l.shopName,
  inventory_id: l.inventoryId,
  sku: l.sku,
  title: l.title,
  description: l.description ?? null,
  brand: l.brand ?? null,
  category: l.category ?? null,
  size: l.size ?? null,
  color: l.color ?? null,
  condition: l.condition ?? null,
  price: l.price,
  shipping_price: l.shippingPrice,
  photos: l.photos,
  status: l.status,
});

interface SellerRow {
  user_id: string;
  handle: string;
  shop_name: string;
  bio: string | null;
  shipping_price: number;
  extra_item_shipping: number;
  payouts: SellerProfile["payouts"];
}

const toSeller = (r: SellerRow): SellerProfile => ({
  userId: r.user_id,
  handle: r.handle,
  shopName: r.shop_name,
  bio: r.bio ?? undefined,
  shippingPrice: Number(r.shipping_price),
  extraItemShipping: Number(r.extra_item_shipping),
  payouts: r.payouts,
});

interface ShowRow {
  id: string;
  seller_id: string;
  handle: string;
  shop_name: string;
  title: string;
  starts_at: string;
  status: Show["status"];
  listing_ids: string[];
  pinned_id: string | null;
  auction: Show["auction"] | null;
}

const toShow = (r: ShowRow): Show => ({
  id: r.id,
  sellerId: r.seller_id,
  handle: r.handle,
  shopName: r.shop_name,
  title: r.title,
  startsAt: r.starts_at,
  status: r.status,
  listingIds: r.listing_ids ?? [],
  pinnedId: r.pinned_id ?? undefined,
  auction: r.auction ?? undefined,
});

interface BidRow {
  id: string;
  show_id: string;
  listing_id: string;
  name: string;
  amount: number;
  created_at: string;
}
const toBid = (r: BidRow, mine: Set<string>): Bid => ({ id: r.id, showId: r.show_id, listingId: r.listing_id, name: r.name, amount: Number(r.amount), at: r.created_at, mine: mine.has(r.id) });

interface ChatRow {
  id: string;
  show_id: string;
  name: string;
  body: string;
  host: boolean;
  created_at: string;
}
const toChat = (r: ChatRow): ChatLine => ({ id: r.id, showId: r.show_id, name: r.name, text: r.body, host: r.host, at: r.created_at });

// Bids this browser placed, so the page can say "You're winning" without the server telling
// anyone else whose bid is whose.
const MY_BIDS = "sellsync.mybids.v1";
const myBids = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(MY_BIDS) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};
const rememberBid = (id: string) => {
  try {
    localStorage.setItem(MY_BIDS, JSON.stringify([...myBids(), id].slice(-500)));
  } catch {
    // not remembered: the bid still counts
  }
};

export class SupabaseSellSource implements SellSourceApi {
  // userId is null for shoppers who aren't signed in.
  constructor(private userId: string | null) {}

  private get db() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  private get uid() {
    if (!this.userId) throw new Error("Sign in first.");
    return this.userId;
  }

  private async fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke(name, { body });
    if (error) {
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    return data as T;
  }

  async me() {
    const { data, error } = await this.db.from("sellsource_sellers").select("user_id, handle, shop_name, bio, shipping_price, extra_item_shipping, payouts").eq("user_id", this.uid).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toSeller(data as SellerRow) : null;
  }

  async saveProfile(p: Omit<SellerProfile, "userId" | "payouts">) {
    const row = { user_id: this.uid, handle: p.handle, shop_name: p.shopName, bio: p.bio ?? null, shipping_price: p.shippingPrice, extra_item_shipping: p.extraItemShipping };
    const { data, error } = await this.db.from("sellsource_sellers").upsert(row).select("user_id, handle, shop_name, bio, shipping_price, extra_item_shipping, payouts").single();
    if (error) throw new Error(error.code === "23505" ? "That address is taken. Try another." : error.message);
    // Listings carry the shop's name and address so storefronts load in one read.
    await this.db.from("sellsource_listings").update({ handle: p.handle, shop_name: p.shopName, shipping_price: p.shippingPrice }).eq("seller_id", this.uid).neq("status", "sold");
    return toSeller(data as SellerRow);
  }

  async startPayouts() {
    const { url } = await this.fn<{ url: string }>("sellsource-connect", { action: "start", returnUrl: `${window.location.origin}/#/sellsource?payouts=back` });
    return url;
  }

  async refreshPayouts() {
    await this.fn("sellsource-connect", { action: "refresh" });
    return this.me();
  }

  async myListings() {
    const { data, error } = await this.db.from("sellsource_listings").select("*").eq("seller_id", this.uid).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as ListingRow[]).map(toListing);
  }

  async publish(items: InventoryItem[]) {
    const me = await this.me();
    if (!me) throw new Error("Set up your storefront first.");
    const mine = await this.myListings();
    const rows = items.map((item) => {
      const old = mine.find((l) => l.inventoryId === item.id);
      const l = listingFromItem(item, me, old?.id ?? newId());
      return fromListing({ ...l, status: old?.status === "sold" ? "sold" : "active" });
    });
    const { data, error } = await this.db.from("sellsource_listings").upsert(rows).select("*");
    if (error) throw new Error(error.message);
    return (data as ListingRow[]).map(toListing);
  }

  async unpublish(inventoryIds: string[]) {
    const { error } = await this.db.from("sellsource_listings").update({ status: "removed" }).eq("seller_id", this.uid).in("inventory_id", inventoryIds).neq("status", "sold");
    if (error) throw new Error(error.message);
  }

  async myShows() {
    const { data, error } = await this.db.from("live_shows").select("*").eq("seller_id", this.uid).order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as ShowRow[]).map(toShow);
  }

  async saveShow(s: Show) {
    const { error } = await this.db.from("live_shows").upsert({
      id: s.id,
      seller_id: this.uid,
      handle: s.handle,
      shop_name: s.shopName,
      title: s.title,
      starts_at: s.startsAt,
      status: s.status,
      listing_ids: s.listingIds,
      pinned_id: s.pinnedId ?? null,
      auction: s.auction ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async deleteShow(id: string) {
    const { error } = await this.db.from("live_shows").delete().eq("id", id).eq("seller_id", this.uid);
    if (error) throw new Error(error.message);
  }

  async updateShow(s: Show) {
    await this.saveShow(s);
  }

  async browse({ q, handle }: { q?: string; handle?: string }) {
    let query = this.db.from("sellsource_listings").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(200);
    if (handle) query = query.eq("handle", handle);
    const words = (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
    for (const w of words) {
      const like = `%${w.replace(/[%_,()]/g, "")}%`;
      query = query.or(`title.ilike.${like},brand.ilike.${like},category.ilike.${like},size.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as ListingRow[]).map(toListing);
  }

  async getListings(ids: string[]) {
    if (!ids.length) return [];
    const { data, error } = await this.db.from("sellsource_listings").select("*").in("id", ids);
    if (error) throw new Error(error.message);
    const rows = (data as ListingRow[]).map(toListing);
    return ids.flatMap((id) => rows.filter((r) => r.id === id));
  }

  async seller(handle: string) {
    const { data } = await this.db.from("sellsource_sellers").select("user_id, handle, shop_name, bio, shipping_price, extra_item_shipping, payouts").eq("handle", handle).maybeSingle();
    return data ? toSeller(data as SellerRow) : null;
  }

  async checkout(req: CheckoutRequest) {
    const back = window.location.href.split("#")[0];
    return this.fn<{ url: string }>("sellsource-checkout", { ...req, buyerToken: buyerToken(), returnUrl: back });
  }

  async getShow(id: string) {
    const { data } = await this.db.from("live_shows").select("*").eq("id", id).maybeSingle();
    return data ? toShow(data as ShowRow) : null;
  }

  async upcomingShows() {
    const { data, error } = await this.db.from("live_shows").select("*").neq("status", "ended").order("starts_at").limit(50);
    if (error) throw new Error(error.message);
    return (data as ShowRow[]).map(toShow);
  }

  async bids(showId: string) {
    const { data, error } = await this.db.from("live_bids").select("*").eq("show_id", showId).order("created_at");
    if (error) throw new Error(error.message);
    const mine = myBids();
    return (data as BidRow[]).map((r) => toBid(r, mine));
  }

  async chatLines(showId: string) {
    const { data, error } = await this.db.from("live_chat").select("*").eq("show_id", showId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data as ChatRow[]).map(toChat).reverse();
  }

  // The database checks every bid (auction open, high enough) and pushes the clock back on a
  // last-second bid, so two buyers bidding at once can't both win.
  async bid(showId: string, listingId: string, name: string, amount: number) {
    const { data, error } = await this.db.rpc("live_place_bid", { p_show: showId, p_listing: listingId, p_name: name, p_amount: amount, p_token: buyerToken() });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as BidRow;
    rememberBid(row.id);
    return toBid(row, new Set([row.id]));
  }

  async chat(showId: string, name: string, text: string) {
    const { error } = await this.db.rpc("live_post_chat", { p_show: showId, p_name: name, p_text: text });
    if (error) throw new Error(error.message);
  }

  subscribe(showId: string, on: (e: LiveEvent) => void) {
    const channel = this.db
      .channel(`live-${showId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_shows", filter: `id=eq.${showId}` }, (p) => on({ kind: "show", show: toShow(p.new as ShowRow) }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_bids", filter: `show_id=eq.${showId}` }, (p) => on({ kind: "bid", bid: toBid(p.new as BidRow, myBids()) }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat", filter: `show_id=eq.${showId}` }, (p) => on({ kind: "chat", line: toChat(p.new as ChatRow) }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sellsource_listings" }, (p) => {
        const r = p.new as ListingRow;
        if (r.status === "sold") on({ kind: "sold", listingId: r.id, name: "A buyer", price: Number(r.price) });
      })
      .subscribe();
    return () => void this.db.removeChannel(channel);
  }

  async video(showId: string, role: "host" | "viewer", name: string) {
    const res = await this.fn<VideoAccess | { off: true }>("live-token", { showId, role, name });
    return "off" in res ? null : res;
  }
}
