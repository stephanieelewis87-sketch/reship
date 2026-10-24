import type { Order } from "./types";

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
export const SAMPLE_ORDERS: Order[] = RAW.map((o) => ({
  ...o,
  id: `sample-${o.id}`,
  source: "sample",
  label: { fileName: `sample-label-${o.orderId}.pdf`, uploadedAt: "2026-07-20T00:00:00.000Z" },
}));

export async function sampleLabelPdf(order: Order): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 10, y: 10, width: 268, height: 412, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  page.drawText("SAMPLE LABEL", { x: 24, y: 392, size: 18, font: bold });
  page.drawText("Not valid for shipping", { x: 24, y: 374, size: 10, font });
  page.drawText(order.carrier, { x: 24, y: 330, size: 14, font: bold });
  page.drawText(`${order.platform} order ${order.orderId}`, { x: 24, y: 300, size: 11, font });
  page.drawText(`Ship to: @${order.buyer}`, { x: 24, y: 282, size: 11, font });
  for (let i = 0; i < 38; i++) page.drawRectangle({ x: 24 + i * 6.4, y: 140, width: i % 3 ? 2 : 4, height: 90, color: rgb(0, 0, 0) });
  page.drawText(order.tracking ?? "9400 0000 0000 0000 0000 00", { x: 40, y: 120, size: 11, font });
  return new Blob([await doc.save()], { type: "application/pdf" });
}
