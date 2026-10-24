export type Platform = "Poshmark" | "Vinted" | "Depop" | "Mercari" | "WhatNot" | "Etsy" | "eBay" | "Other";
export type LabelStatus = "pending" | "printed" | "shipped";
export type OrderSource = "manual" | "csv" | "sample";
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
  source: OrderSource;
}

export interface Settings {
  syncInterval: string;
  labelFormat: LabelFormat;
  defaultCarrier: string;
  autoPrint: boolean;
  notifications: boolean;
  shipFrom: Address | null;
  displayName: string;
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
};

export const emptyAddress = (): Address => ({ name: "", street1: "", street2: "", city: "", state: "", zip: "", country: "US", phone: "" });

export const isAddressComplete = (a?: Address | null): a is Address =>
  !!a && !!a.name.trim() && !!a.street1.trim() && !!a.city.trim() && !!a.state.trim() && !!a.zip.trim() && !!a.country.trim();
