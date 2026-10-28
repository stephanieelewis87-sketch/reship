import type { InventoryItem, Order, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { SAMPLE_HISTORY_ORDERS, SAMPLE_INVENTORY, SAMPLE_ORDERS, sampleLabelPdf } from "./sampleData";
import { supabase } from "./supabase";

// One interface, two backends: Supabase when it's configured, otherwise this browser's storage (demo mode).
export interface Store {
  listOrders(): Promise<Order[]>;
  saveOrders(orders: Order[]): Promise<void>;
  deleteOrders(ids: string[]): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  // Label PDFs are kept apart from order rows because they're large.
  saveLabelPdf(orderId: string, pdf: Blob): Promise<void>;
  getLabelPdf(orderId: string): Promise<Blob | null>;
  deleteLabelPdf(orderId: string): Promise<void>;
  listInventory(): Promise<InventoryItem[]>;
  saveInventory(items: InventoryItem[]): Promise<void>;
  deleteInventory(ids: string[]): Promise<void>;
}

// Small IndexedDB wrapper for label PDFs in demo mode; localStorage is too small for files.
function labelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("reship-labels", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("labels");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function labelTx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await labelDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction("labels", mode).objectStore("labels"));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// v3 added a year of sold orders behind the samples, for analytics.
const ORDERS_KEY = "reship.orders.v3";
const INVENTORY_KEY = "reship.inventory.v1";
const SETTINGS_KEY = "reship.settings.v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private windows); the app keeps working in memory.
  }
}

export class LocalStore implements Store {
  private memOrders: Order[] | null = null;
  private memSettings: Settings | null = null;
  private memInventory: InventoryItem[] | null = null;

  async listOrders() {
    if (!this.memOrders) this.memOrders = readJson<Order[]>(ORDERS_KEY) ?? [...SAMPLE_ORDERS, ...SAMPLE_HISTORY_ORDERS];
    return this.memOrders;
  }

  async listInventory() {
    if (!this.memInventory) this.memInventory = readJson<InventoryItem[]>(INVENTORY_KEY) ?? SAMPLE_INVENTORY;
    return this.memInventory;
  }

  async saveInventory(items: InventoryItem[]) {
    const current = await this.listInventory();
    const byId = new Map(items.map((i) => [i.id, i]));
    const fresh = items.filter((i) => !current.some((c) => c.id === i.id));
    this.memInventory = [...fresh, ...current.map((c) => byId.get(c.id) ?? c)];
    writeJson(INVENTORY_KEY, this.memInventory);
  }

  async deleteInventory(ids: string[]) {
    this.memInventory = (await this.listInventory()).filter((i) => !ids.includes(i.id));
    writeJson(INVENTORY_KEY, this.memInventory);
  }

  // Puts the demo back to its sample orders, all of them as they started.
  reset() {
    this.memOrders = null;
    this.memInventory = null;
    try {
      localStorage.removeItem(ORDERS_KEY);
      localStorage.removeItem(INVENTORY_KEY);
    } catch {
      // Storage unavailable; the in-memory copy is already cleared.
    }
  }

  async saveOrders(orders: Order[]) {
    const current = await this.listOrders();
    const byId = new Map(current.map((o) => [o.id, o]));
    orders.forEach((o) => byId.set(o.id, o));
    // New orders first, matching the newest-first sort the dashboard uses.
    const fresh = orders.filter((o) => !current.some((c) => c.id === o.id));
    this.memOrders = [...fresh, ...current.map((o) => byId.get(o.id)!)];
    writeJson(ORDERS_KEY, this.memOrders);
  }

  async deleteOrders(ids: string[]) {
    const current = await this.listOrders();
    this.memOrders = current.filter((o) => !ids.includes(o.id));
    writeJson(ORDERS_KEY, this.memOrders);
  }

  async getSettings() {
    if (!this.memSettings) this.memSettings = { ...DEFAULT_SETTINGS, ...readJson<Settings>(SETTINGS_KEY) };
    return this.memSettings;
  }

  async saveSettings(settings: Settings) {
    this.memSettings = settings;
    writeJson(SETTINGS_KEY, settings);
  }

  async saveLabelPdf(orderId: string, pdf: Blob) {
    await labelTx("readwrite", (s) => s.put(pdf, orderId));
  }

  async getLabelPdf(orderId: string) {
    const stored = await labelTx<Blob | undefined>("readonly", (s) => s.get(orderId));
    if (stored) return stored;
    const sample = (await this.listOrders()).find((o) => o.id === orderId && o.source === "sample");
    return sample?.label ? sampleLabelPdf(sample) : null;
  }

  async deleteLabelPdf(orderId: string) {
    await labelTx("readwrite", (s) => s.delete(orderId));
  }
}

interface OrderRow {
  id: string;
  platform: Order["platform"];
  order_number: string;
  buyer: string;
  items: Order["items"];
  order_date: string;
  status: Order["status"];
  carrier: string;
  tracking: string | null;
  ship_to: Order["shipTo"] | null;
  parcel: Order["parcel"] | null;
  label: Order["label"] | null;
  source: Order["source"];
  printed_at?: string | null;
  shipment?: Order["shipment"] | null;
  fees?: number | null;
  shipping_cost?: number | null;
}

const toRow = (o: Order, userId: string) => ({
  id: o.id,
  user_id: userId,
  platform: o.platform,
  order_number: o.orderId,
  buyer: o.buyer,
  items: o.items,
  order_date: o.date,
  status: o.status,
  carrier: o.carrier,
  tracking: o.tracking ?? null,
  ship_to: o.shipTo ?? null,
  parcel: o.parcel ?? null,
  label: o.label ?? null,
  source: o.source,
  printed_at: o.printedAt ?? null,
  shipment: o.shipment ?? null,
  fees: o.fees ?? null,
  shipping_cost: o.shippingCost ?? null,
});

// Columns added by migrations 0003 and 0004; saving still works on a database that doesn't have them yet.
const NEWER_COLUMNS = ["printed_at", "shipment", "fees", "shipping_cost"] as const;

const fromRow = (r: OrderRow): Order => ({
  id: r.id,
  platform: r.platform,
  orderId: r.order_number,
  buyer: r.buyer,
  items: r.items,
  date: r.order_date,
  status: r.status,
  carrier: r.carrier,
  tracking: r.tracking ?? undefined,
  shipTo: r.ship_to ?? undefined,
  parcel: r.parcel ?? undefined,
  label: r.label ?? undefined,
  source: r.source,
  printedAt: r.printed_at ?? undefined,
  shipment: r.shipment ?? undefined,
  fees: r.fees ?? undefined,
  shippingCost: r.shipping_cost ?? undefined,
});

interface InventoryRow {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  cost: number | null;
  list_price: number | null;
  source: string | null;
  purchased_at: string | null;
  listed_at: string | null;
  sold_at: string | null;
  status: InventoryItem["status"];
  platforms: InventoryItem["platforms"] | null;
  photo: string | null;
}

const inventoryToRow = (i: InventoryItem, userId: string) => ({
  id: i.id,
  user_id: userId,
  sku: i.sku,
  title: i.title,
  brand: i.brand ?? null,
  category: i.category ?? null,
  size: i.size ?? null,
  cost: i.cost ?? null,
  list_price: i.listPrice ?? null,
  source: i.source ?? null,
  purchased_at: i.purchasedAt ?? null,
  listed_at: i.listedAt ?? null,
  sold_at: i.soldAt ?? null,
  status: i.status,
  platforms: i.platforms,
  photo: i.photo ?? null,
});

const inventoryFromRow = (r: InventoryRow): InventoryItem => ({
  id: r.id,
  sku: r.sku,
  title: r.title,
  brand: r.brand ?? undefined,
  category: r.category ?? undefined,
  size: r.size ?? undefined,
  cost: r.cost ?? undefined,
  listPrice: r.list_price ?? undefined,
  source: r.source ?? undefined,
  purchasedAt: r.purchased_at ?? undefined,
  listedAt: r.listed_at ?? undefined,
  soldAt: r.sold_at ?? undefined,
  status: r.status,
  platforms: r.platforms ?? [],
  photo: r.photo ?? undefined,
});

export class SupabaseStore implements Store {
  constructor(private userId: string) {}

  private get db() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  async listOrders() {
    const { data, error } = await this.db.from("orders").select("*").order("order_date", { ascending: false });
    if (error) throw error;
    return (data as OrderRow[]).map(fromRow);
  }

  async saveOrders(orders: Order[]) {
    if (!orders.length) return;
    const rows = orders.map((o) => toRow(o, this.userId));
    const { error } = await this.db.from("orders").upsert(rows);
    if (error && NEWER_COLUMNS.some((c) => error.message.includes(c))) {
      const older = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !(NEWER_COLUMNS as readonly string[]).includes(k))));
      const retry = await this.db.from("orders").upsert(older);
      if (retry.error) throw retry.error;
    } else if (error) throw error;
  }

  async deleteOrders(ids: string[]) {
    const { error } = await this.db.from("orders").delete().in("id", ids);
    if (error) throw error;
  }

  async getSettings() {
    const { data, error } = await this.db.from("settings").select("data").eq("user_id", this.userId).maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_SETTINGS, ...(data?.data as Partial<Settings> | undefined) };
  }

  async saveSettings(settings: Settings) {
    const { error } = await this.db.from("settings").upsert({ user_id: this.userId, data: settings });
    if (error) throw error;
  }

  // Files live in the private "labels" bucket under the user's own folder.
  private labelPath(orderId: string) {
    return `${this.userId}/${orderId}.pdf`;
  }

  async saveLabelPdf(orderId: string, pdf: Blob) {
    const { error } = await this.db.storage
      .from("labels")
      .upload(this.labelPath(orderId), pdf, { upsert: true, contentType: "application/pdf" });
    if (error) throw error;
  }

  async getLabelPdf(orderId: string) {
    const { data, error } = await this.db.storage.from("labels").download(this.labelPath(orderId));
    if (error) return null;
    return data;
  }

  async deleteLabelPdf(orderId: string) {
    const { error } = await this.db.storage.from("labels").remove([this.labelPath(orderId)]);
    if (error) throw error;
  }

  // Before migration 0004 there's no inventory table; analytics then works from orders alone.
  async listInventory() {
    const { data, error } = await this.db.from("inventory_items").select("*");
    if (error) return [];
    return (data as InventoryRow[]).map(inventoryFromRow);
  }

  async saveInventory(items: InventoryItem[]) {
    if (!items.length) return;
    const { error } = await this.db.from("inventory_items").upsert(items.map((i) => inventoryToRow(i, this.userId)));
    if (error) throw error;
  }

  async deleteInventory(ids: string[]) {
    const { error } = await this.db.from("inventory_items").delete().in("id", ids);
    if (error) throw error;
  }
}
