import type { Expense, InventoryItem, Order } from "./types";
import { sampleHistory } from "./sampleHistory";

// Sample orders from the Reship design, loaded on first run in demo mode so the app isn't empty.
const RAW: Omit<Order, "source">[] = [
  {
    id: "1", platform: "Poshmark", orderId: "PM-44821", buyer: "jessica_m", date: "2026-07-20", status: "pending", carrier: "USPS Priority",
    items: [
      { name: "Levi's 501 Jeans W28 L30", sku: "LV-JEAN-28", photo: "https://images.unsplash.com/photo-1694725369452-6cfadad90af3?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "2", platform: "eBay", orderId: "EB-990234", buyer: "thrift_hunter_99", date: "2026-07-20", status: "pending", carrier: "UPS Ground",
    items: [
      { name: "Nike Air Max 90 Sz 10", photo: "https://images.unsplash.com/photo-1570051779696-244e9f680cf7?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "3", platform: "Etsy", orderId: "ET-112830", buyer: "cottagecore_kate", date: "2026-07-20", status: "pending", carrier: "USPS First Class",
    items: [
      { name: "Vintage Floral Blouse S", sku: "VIN-BLS-S", photo: "https://images.unsplash.com/photo-1761884108847-f9b11d26221a?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "4", platform: "Depop", orderId: "DP-55102", buyer: "y2k_archive", date: "2026-07-19", status: "printed", carrier: "USPS Priority", tracking: "9400111899560233748296",
    items: [
      { name: "Juicy Couture Tracksuit Top", sku: "JC-TRACK-M", photo: "https://images.unsplash.com/photo-1776409683606-d7ce632d96a5?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "5", platform: "Mercari", orderId: "MC-773419", buyer: "deals_always", date: "2026-07-19", status: "printed", carrier: "USPS Priority", tracking: "9400111899560233748310",
    items: [
      { name: "Coach Leather Crossbody Bag", photo: "https://images.unsplash.com/photo-1712253600732-baa27bf3c012?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "6", platform: "Vinted", orderId: "VT-88203", buyer: "secondhandrose", date: "2026-07-19", status: "shipped", carrier: "Evri", tracking: "H1A283847291",
    items: [
      { name: "Zara Trench Coat M", sku: "ZR-TRENCH-M", photo: "https://images.unsplash.com/photo-1592327877233-90b9bfd92e48?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "7", platform: "WhatNot", orderId: "WN-30192", buyer: "card_collector_dan", date: "2026-07-18", status: "shipped", carrier: "USPS First Class", tracking: "9400111899560233748401",
    items: [
      { name: "Pokémon Base Set Charizard", photo: "https://images.unsplash.com/photo-1611931960487-4932667079f1?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "8", platform: "Poshmark", orderId: "PM-44756", buyer: "luxe_finds_la", date: "2026-07-18", status: "shipped", carrier: "USPS Priority", tracking: "9400111899560233748345",
    items: [
      { name: "Free People Flowy Midi Dress", sku: "FP-MIDI-XS", photo: "https://images.unsplash.com/photo-1581437152838-b666e2bb6c73?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "9", platform: "eBay", orderId: "EB-989001", buyer: "vintage_vault_uk", date: "2026-07-20", status: "pending", carrier: "USPS First Class",
    items: [
      { name: "Ralph Lauren Oxford Shirt L", photo: "https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "10", platform: "Mercari", orderId: "MC-773880", buyer: "resale_queen_ny", date: "2026-07-20", status: "pending", carrier: "USPS First Class",
    items: [
      { name: "Anthropologie Linen Pants S", sku: "ANTH-PNT-S", photo: "https://images.unsplash.com/photo-1578500467296-441a11d5d55a?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "11", platform: "Etsy", orderId: "ET-113044", buyer: "boho_dreams_shop", date: "2026-07-19", status: "printed", carrier: "USPS Priority", tracking: "9400111899560233748502",
    items: [
      { name: "Hand-knit Cardigan M/L", photo: "https://images.unsplash.com/photo-1581497396202-5645e76a3a8e?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "12", platform: "Depop", orderId: "DP-55340", buyer: "90s_forever_uk", date: "2026-07-18", status: "shipped", carrier: "Royal Mail", tracking: "MB234567891GB",
    items: [
      { name: "Tommy Hilfiger Windbreaker", sku: "TH-WIND-L", photo: "https://images.unsplash.com/photo-1611308725032-74f0a551d018?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "16", platform: "Depop", orderId: "DP-55871", buyer: "grunge_garden", date: "2026-07-20", status: "pending", carrier: "USPS Ground Advantage",
    items: [
      { name: "Juicy Couture Velour Hoodie S", sku: "JC-HOOD-S", photo: "https://images.unsplash.com/photo-1776409683606-d7ce632d96a5?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "17", platform: "Vinted", orderId: "VT-88912", buyer: "capsule_closet", date: "2026-07-20", status: "pending", carrier: "USPS Ground Advantage",
    items: [
      { name: "Zara Belted Trench Coat S", sku: "ZR-TRENCH-S", photo: "https://images.unsplash.com/photo-1592327877233-90b9bfd92e48?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "18", platform: "WhatNot", orderId: "WN-30877", buyer: "slab_hunter", date: "2026-07-20", status: "pending", carrier: "USPS Ground Advantage",
    items: [
      { name: "Pokémon Jungle Holo Lot (12 cards)", sku: "PKM-JNG-12", photo: "https://images.unsplash.com/photo-1611931960487-4932667079f1?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  // --- Bundle orders ---
  {
    id: "13", platform: "Poshmark", orderId: "PM-45100", buyer: "stylestack_sam", date: "2026-07-20", status: "pending", carrier: "USPS Priority",
    items: [
      { name: "Levi's Denim Jacket M", sku: "LV-DJK-M",  photo: "https://images.unsplash.com/photo-1555583743-991174c11425?w=400&h=400&fit=crop&auto=format" },
      { name: "Silk Floral Scarf",    sku: "SCF-SLK-01", photo: "https://images.unsplash.com/photo-1623832101940-647285e32a58?w=400&h=400&fit=crop&auto=format" },
      { name: "Leather Belt Brown",                       photo: "https://images.unsplash.com/photo-1664286074176-5206ee5dc878?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "14", platform: "Mercari", orderId: "MC-774201", buyer: "thrift_trio", date: "2026-07-20", status: "pending", carrier: "USPS Priority",
    items: [
      { name: "Coach Leather Crossbody Bag", sku: "CCH-XB-TN", photo: "https://images.unsplash.com/photo-1712253600732-baa27bf3c012?w=400&h=400&fit=crop&auto=format" },
      { name: "Anthropologie Linen Pants S", sku: "ANTH-PNT-S", photo: "https://images.unsplash.com/photo-1578500467296-441a11d5d55a?w=400&h=400&fit=crop&auto=format" },
    ],
  },
  {
    id: "15", platform: "eBay", orderId: "EB-991100", buyer: "wardrobe_clear", date: "2026-07-19", status: "printed", carrier: "UPS Ground", tracking: "1Z999AA10123456784",
    items: [
      { name: "Ralph Lauren Oxford Shirt L",  photo: "https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=400&h=400&fit=crop&auto=format" },
      { name: "Tommy Hilfiger Windbreaker",   sku: "TH-WIND-L", photo: "https://images.unsplash.com/photo-1611308725032-74f0a551d018?w=400&h=400&fit=crop&auto=format" },
      { name: "Vintage Floral Blouse S",      sku: "VIN-BLS-S", photo: "https://images.unsplash.com/photo-1761884108847-f9b11d26221a?w=400&h=400&fit=crop&auto=format" },
    ],
  },
];

// Sample orders come with a stand-in label so printing can be tried before uploading real ones.
// Their dates are moved so the newest falls on today, so the demo never looks late to ship.
const SAMPLE_NEWEST = Date.parse("2026-07-20");
const shiftDate = (date: string) => {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(today - (SAMPLE_NEWEST - Date.parse(date))).toISOString().slice(0, 10);
};
const DELIVERED_SAMPLES = new Set(["7", "12"]);

// What each sample item sold for and what it cost, for the analytics pages.
const SAMPLE_MONEY: Record<string, [number, number]> = {
  "Levi's 501 Jeans W28 L30": [42, 6], "Nike Air Max 90 Sz 10": [78, 14], "Vintage Floral Blouse S": [28, 3],
  "Juicy Couture Tracksuit Top": [36, 5], "Coach Leather Crossbody Bag": [85, 12], "Zara Trench Coat M": [38, 7],
  "Pokémon Base Set Charizard": [160, 40], "Free People Flowy Midi Dress": [48, 7], "Ralph Lauren Oxford Shirt L": [24, 4],
  "Anthropologie Linen Pants S": [40, 6], "Hand-knit Cardigan M/L": [45, 5], "Tommy Hilfiger Windbreaker": [34, 6],
  "Juicy Couture Velour Hoodie S": [32, 5], "Zara Belted Trench Coat S": [36, 7], "Pokémon Jungle Holo Lot (12 cards)": [55, 12],
  "Levi's Denim Jacket M": [44, 8], "Silk Floral Scarf": [16, 2], "Leather Belt Brown": [14, 2],
};

export const SAMPLE_ORDERS: Order[] = RAW.map((o) => {
  const date = shiftDate(o.date);
  return {
    ...o,
    items: o.items.map((i) => (SAMPLE_MONEY[i.name] ? { ...i, price: SAMPLE_MONEY[i.name][0], cost: SAMPLE_MONEY[i.name][1] } : i)),
    id: `sample-${o.id}`,
    date,
    source: "sample",
    label: { fileName: `sample-label-${o.orderId}.pdf`, uploadedAt: `${date}T00:00:00.000Z` },
    printedAt: o.status === "pending" ? undefined : `${date}T18:00:00.000Z`,
    shipment:
      o.status === "shipped"
        ? { status: DELIVERED_SAMPLES.has(o.id) ? "delivered" : "in_transit", updatedAt: `${date}T18:00:00.000Z` }
        : o.status === "printed"
          ? { status: "label_created", updatedAt: `${date}T18:00:00.000Z` }
          : undefined,
  };
});

// A year of sold orders and inventory behind the sample orders, for the analytics pages.
const HISTORY = sampleHistory();
export const SAMPLE_HISTORY_ORDERS: Order[] = HISTORY.orders;
export const SAMPLE_INVENTORY: InventoryItem[] = HISTORY.inventory;
export const SAMPLE_EXPENSES: Expense[] = HISTORY.expenses;

// Made-up ship-to addresses for the sample labels.
const SAMPLE_ADDRESSES = [
  ["Jessica Morales", "1842 Willow Creek Dr", "Austin TX 78704"],
  ["Daniel Okafor", "77 Harbor View Ln Apt 3B", "Portland ME 04101"],
  ["Kate Lindqvist", "209 Maple Ave", "Asheville NC 28801"],
  ["Priya Raman", "5120 Sunset Blvd", "Los Angeles CA 90027"],
  ["Marcus Bell", "16 Orchard St", "Brooklyn NY 11211"],
  ["Hannah Cho", "930 Pine St Unit 12", "Seattle WA 98101"],
  ["Luis Alvarez", "4401 Mesa Verde Rd", "Albuquerque NM 87110"],
  ["Emma Novak", "58 Lakeshore Dr", "Madison WI 53703"],
  ["Tyler Brooks", "3307 Peachtree Rd NE", "Atlanta GA 30326"],
  ["Sofia Rossi", "12 Beacon St Apt 4", "Boston MA 02108"],
  ["Jordan Reyes", "781 Elm Ridge Ct", "Denver CO 80205"],
  ["Grace Kim", "455 Lantern Way", "San Diego CA 92101"],
  ["Noah Patel", "2290 Riverbend Pkwy", "Columbus OH 43215"],
  ["Ava Thompson", "64 Magnolia St", "Savannah GA 31401"],
  ["Ethan Walsh", "1015 Cedar Hollow Rd", "Nashville TN 37203"],
  ["Mia Fischer", "300 Prairie Ln", "Omaha NE 68102"],
  ["Leo Santos", "88 Ocean Pkwy Apt 7C", "Miami FL 33139"],
  ["Chloe Martin", "5 Aspen Grove", "Boise ID 83702"],
];

const SAMPLE_SERVICE: Record<string, [string, string]> = {
  "USPS Priority": ["P", "USPS PRIORITY MAIL"],
  "USPS First Class": ["F", "USPS FIRST-CLASS MAIL"],
  "USPS Ground Advantage": ["G", "USPS GROUND ADVANTAGE"],
  "UPS Ground": ["G", "UPS GROUND"],
};

// A stand-in label laid out like a real 4x6 prepaid label, with made-up addresses and a
// "sample" note, so the print flow can be shown without real orders.
export async function sampleLabelPdf(order: Order): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const n = Number(order.id.replace(/\D/g, "")) || 1;
  const [name, street, city] = SAMPLE_ADDRESSES[(n - 1) % SAMPLE_ADDRESSES.length];
  const [letter, service] = SAMPLE_SERVICE[order.carrier] ?? ["P", order.carrier.toUpperCase()];
  const tracking = order.tracking ?? `9400 1118 9956 ${String(1000 + n * 37).slice(-4)} ${String(4821 + n * 113).slice(-4)} ${String(10 + n).slice(-2)}`;

  page.drawRectangle({ x: 6, y: 6, width: 276, height: 420, borderColor: black, borderWidth: 1.5 });
  // Service letter box and postage block
  page.drawRectangle({ x: 14, y: 346, width: 72, height: 72, borderColor: black, borderWidth: 2 });
  page.drawText(letter, { x: letter === "F" ? 35 : 30, y: 360, size: 54, font: bold });
  page.drawRectangle({ x: 168, y: 362, width: 106, height: 56, borderColor: black, borderWidth: 1 });
  ["POSTAGE PAID", order.platform.toUpperCase(), "COMMERCIAL"].forEach((t, i) =>
    page.drawText(t, { x: 176, y: 404 - i * 13, size: 8, font: i === 1 ? bold : font }),
  );
  // Service banner
  page.drawRectangle({ x: 6, y: 316, width: 276, height: 24, color: black });
  page.drawText(service, { x: 14, y: 323, size: 13, font: bold, color: rgb(1, 1, 1) });
  // From
  ["YOUR SHOP", "123 MAIN ST", "NEW ORLEANS LA 70122"].forEach((t, i) => page.drawText(t, { x: 14, y: 300 - i * 10, size: 8, font }));
  page.drawText(`Ship Date: ${order.date}`, { x: 186, y: 300, size: 7, font });
  page.drawText("Weight: 1 lb", { x: 186, y: 290, size: 7, font });
  // To
  page.drawText("SHIP TO:", { x: 14, y: 250, size: 8, font: bold });
  [name.toUpperCase(), street.toUpperCase(), city.toUpperCase()].forEach((t, i) => page.drawText(t, { x: 60, y: 236 - i * 15, size: 12, font: i === 0 ? bold : font }));
  // Tracking barcode
  page.drawRectangle({ x: 6, y: 176, width: 276, height: 1.5, color: black });
  const carrierName = order.carrier.startsWith("UPS") ? "UPS" : "USPS";
  page.drawText(`${carrierName} TRACKING #`, { x: carrierName === "UPS" ? 104 : 100, y: 164, size: 9, font: bold });
  let x = 26;
  for (let i = 0; x < 262; i++) {
    const w = [1, 2, 1, 3, 1, 2][(i * 7 + n) % 6];
    page.drawRectangle({ x, y: 84, width: w, height: 70, color: black });
    x += w + [1, 2, 3][(i + n) % 3];
  }
  page.drawText(tracking, { x: 64, y: 70, size: 10, font: bold });
  page.drawRectangle({ x: 6, y: 58, width: 276, height: 1.5, color: black });
  page.drawText(`${order.platform} order ${order.orderId}`, { x: 14, y: 40, size: 8, font });
  page.drawText("SAMPLE LABEL - NOT VALID FOR POSTAGE", { x: 14, y: 24, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
  return new Blob([await doc.save()], { type: "application/pdf" });
}
