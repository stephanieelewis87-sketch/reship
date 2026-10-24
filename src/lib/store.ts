import type { Order, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { SAMPLE_ORDERS } from "./sampleData";
import { supabase } from "./supabase";

// One interface, two backends: Supabase when it's configured, otherwise this browser's storage (demo mode).
export interface Store {
  listOrders(): Promise<Order[]>;
  saveOrders(orders: Order[]): Promise<void>;
  deleteOrders(ids: string[]): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}

const ORDERS_KEY = "reship.orders.v1";
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

  async listOrders() {
    if (!this.memOrders) this.memOrders = readJson<Order[]>(ORDERS_KEY) ?? SAMPLE_ORDERS;
    return this.memOrders;
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
  source: Order["source"];
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
  source: o.source,
});

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
  source: r.source,
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
    const { error } = await this.db.from("orders").upsert(orders.map((o) => toRow(o, this.userId)));
    if (error) throw error;
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
}
