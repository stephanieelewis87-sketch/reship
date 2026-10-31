export type Platform = "Poshmark" | "Vinted" | "Depop" | "Mercari" | "WhatNot" | "Etsy" | "eBay" | "Other";
export type LabelStatus = "pending" | "printed" | "shipped";
export type OrderSource = "manual" | "csv" | "sample" | "sync";
export type PackageType = "Envelope" | "Soft Pack" | "Small Box" | "Medium Box";
export type LabelFormat = "4x6" | "letter" | "a4";

export interface Address {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

export interface Parcel {
  weightLbs: number | null;
  packageType: PackageType;
}

export interface OrderItem {
  name: string;
  sku?: string;
  photo?: string;
  price?: number;
  // What the seller paid for the item. Filled from the inventory item with the same SKU when missing.
  cost?: number;
  brand?: string;
  category?: string;
}

// Where a shipped package is, as reported by the marketplace the order came from.
export type ShipmentStatus = "label_created" | "in_transit" | "delivered" | "cancelled";

export interface Shipment {
  status: ShipmentStatus;
  updatedAt: string; // ISO time Reship last saw this status
}

export interface Order {
  id: string;
  platform: Platform;
  orderId: string;
  buyer: string;
  items: OrderItem[];
  date: string; // YYYY-MM-DD
  status: LabelStatus;
  carrier: string;
  tracking?: string;
  shipTo?: Address;
  parcel?: Parcel;
  // The shipping label the marketplace generated, uploaded as a PDF.
  label?: LabelFile;
  source: OrderSource;
  printedAt?: string; // ISO time the label was last printed
  shipment?: Shipment;
  // Marketplace fees for the whole order. When missing, analytics estimates them from the marketplace's fee schedule.
  fees?: number;
  // What the seller paid for shipping (0 when the buyer paid for a prepaid label).
  shippingCost?: number;
}

export type InventoryStatus = "draft" | "listed" | "sold";

// Where one inventory item is listed. "sold" is the marketplace it sold on.
export type ListingStatus = "active" | "delisted" | "sold";
export interface Listing {
  platform: Platform;
  status: ListingStatus;
  listedAt?: string; // YYYY-MM-DD
  relistedAt?: string; // YYYY-MM-DD, last time it was relisted
  price?: number;
  url?: string;
}

export type Condition = "New with tags" | "New without tags" | "Like new" | "Good" | "Fair";
export const CONDITIONS: Condition[] = ["New with tags", "New without tags", "Like new", "Good", "Fair"];

// One thing the seller owns: from sourcing it, through listing, to the sale.
export interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  description?: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
  condition?: Condition;
  quantity?: number;
  cost?: number;
  listPrice?: number;
  source?: string; // where it was bought, e.g. "Goodwill"
  purchasedAt?: string; // YYYY-MM-DD
  listedAt?: string; // YYYY-MM-DD, first listed anywhere
  soldAt?: string; // YYYY-MM-DD
  status: InventoryStatus;
  listings: Listing[];
  labels?: string[]; // label ids from settings
  notes?: string; // private, never posted
  photo?: string;
  photos?: string[];
  readyToList?: boolean;
  soldOrders?: string[]; // orders already counted against this item
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  note?: string;
  miles?: number;
}

export const EXPENSE_CATEGORIES = ["Inventory sourcing", "Shipping supplies", "Mileage", "Software and subscriptions", "Marketplace fees (other)", "Equipment", "Other"];

export type GoalMetric = "profit" | "sales" | "listings" | "sellThrough";
export type GoalPeriod = "week" | "month" | "quarter" | "year";
export interface Goal {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
}

export interface LabelDef {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export type AutomationKind = "shares" | "relists" | "offers" | "follows";
export interface AutomationSetting {
  enabled: boolean;
  perDay: number; // daily cap
  discountPct?: number; // offers
  followUps?: number; // offers: extra offers with deeper discounts
  minAgeDays?: number; // relists: only items listed at least this long
}
export type Automations = Partial<Record<Platform, Partial<Record<AutomationKind, AutomationSetting>>>>;

export interface ShippingPreset {
  id: string;
  name: string;
  packageType: PackageType;
  weightLbs: number;
}

export interface LabelFile {
  fileName: string;
  uploadedAt: string;
}

export interface Settings {
  syncInterval: string;
  labelFormat: LabelFormat;
  defaultCarrier: string;
  autoPrint: boolean;
  notifications: boolean;
  shipFrom: Address | null;
  displayName: string;
  // Defaults for one-click printing.
  printSkuOnLabel: boolean;
  printPackingSlip: boolean;
  // Analytics goal; 0 means no goal. Kept for older saved settings; goals replaces it.
  monthlyProfitGoal: number;
  goals: Goal[];
  labels: LabelDef[];
  automations: Automations;
  autoDelist: Partial<Record<Platform, boolean>>;
  autoAdjustQuantity: boolean;
  primaryMarketplace: Platform;
  pricingRules: Partial<Record<Platform, number>>; // percent added to the base price per marketplace
  shippingPresets: ShippingPreset[];
  aiInstructions: { title: string; description: string; condition: string; sku: string };
  dismissedAttention: string[];
  gettingStartedDone: string[];
}

export interface PrintOptions {
  skuOnLabel: boolean;
  packingSlip: boolean;
}

export const ALL_PLATFORMS: Platform[] = ["Poshmark", "Vinted", "Depop", "Mercari", "WhatNot", "Etsy", "eBay"];
export const PACKAGE_TYPES: PackageType[] = ["Envelope", "Soft Pack", "Small Box", "Medium Box"];
export const CARRIER_SERVICES = ["USPS Ground Advantage", "USPS Priority", "USPS First Class", "UPS Ground", "FedEx Home"];

export const DEFAULT_SETTINGS: Settings = {
  syncInterval: "30",
  labelFormat: "4x6",
  defaultCarrier: "USPS Priority",
  autoPrint: false,
  notifications: true,
  shipFrom: null,
  displayName: "",
  printSkuOnLabel: true,
  printPackingSlip: true,
  monthlyProfitGoal: 0,
  goals: [],
  labels: [
    { id: "lbl-ship-today", name: "Ship today", color: "#d03b3b" },
    { id: "lbl-photos", name: "Needs photos", color: "#eda100" },
    { id: "lbl-bin-a", name: "Bin A", color: "#2a78d6" },
  ],
  automations: {},
  autoDelist: { Poshmark: true, Mercari: true, eBay: true, Depop: true, Etsy: true, WhatNot: true, Vinted: true },
  autoAdjustQuantity: true,
  primaryMarketplace: "Poshmark",
  pricingRules: {},
  shippingPresets: [
    { id: "sp-mailer", name: "Poly mailer, under 1 lb", packageType: "Soft Pack", weightLbs: 0.8 },
    { id: "sp-shoebox", name: "Shoe box", packageType: "Medium Box", weightLbs: 3 },
  ],
  aiInstructions: { title: "", description: "", condition: "", sku: "" },
  dismissedAttention: [],
  gettingStartedDone: [],
};

export const emptyAddress = (): Address => ({ name: "", street1: "", street2: "", city: "", state: "", zip: "", country: "US", phone: "" });

export const isAddressComplete = (a?: Address | null): a is Address =>
  !!a && !!a.name.trim() && !!a.street1.trim() && !!a.city.trim() && !!a.state.trim() && !!a.zip.trim() && !!a.country.trim();

export type FeedbackKind = "bug" | "idea" | "confusing" | "praise";
export type FeedbackStatus = "new" | "planned" | "done" | "declined";
export const FEEDBACK_AREAS = ["Home", "Inventory", "Listing form", "Automations", "Orders and shipping", "Analytics", "Settings", "Browser extension", "Other"];

export interface Feedback {
  id: string;
  kind: FeedbackKind;
  area: string;
  message: string;
  rating?: number; // 1–5
  page?: string;
  status: FeedbackStatus;
  createdAt: string;
  mine?: boolean;
}

// What the feedback-digest function writes after Claude reads a batch of feedback.
export interface FeedbackDigest {
  headline: string;
  sentiment: "positive" | "mixed" | "negative";
  themes: { title: string; summary: string; kind: FeedbackKind; mentions: number; priority: "high" | "medium" | "low"; quotes: string[]; suggestion: string }[];
  bugs: string[];
  quickWins: string[];
  decisions: { question: string; options: string[]; recommendation: string }[];
}

export interface FeedbackSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  count: number;
  summary: FeedbackDigest;
  emailedTo?: string;
  createdAt: string;
  sample?: boolean;
}
