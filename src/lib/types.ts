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
  // A label bought through Reship instead of the marketplace's (see labelPolicy.ts).
  ownLabel?: OwnLabel;
}

export interface OwnLabel {
  carrier: string;
  service: string;
  price: number;
  // What the marketplace's own label would have cost, as the seller entered it.
  marketplacePrice?: number;
  boughtAt: string;
  // Demo mode makes a practice label with a made-up tracking number.
  demo?: boolean;
  // When the seller confirmed the tracking number was pasted into the marketplace.
  trackingPostedAt?: string;
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
};

export const emptyAddress = (): Address => ({ name: "", street1: "", street2: "", city: "", state: "", zip: "", country: "US", phone: "" });

export const isAddressComplete = (a?: Address | null): a is Address =>
  !!a && !!a.name.trim() && !!a.street1.trim() && !!a.city.trim() && !!a.state.trim() && !!a.zip.trim() && !!a.country.trim();
