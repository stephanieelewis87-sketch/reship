import type { Condition, Expense, InventoryItem, Listing, Order, Platform } from "./types";
import { addDays, daysBetween, estimateFees, isoDay } from "./analytics";

// A made-up year of sourcing, listing and selling for the demo, so the analytics pages have
// something real-looking to show. It's the same every time for the same day.

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHOTO = (id: string) => `https://images.unsplash.com/${id}?w=400&h=400&fit=crop&auto=format`;
const PHOTOS: Record<string, string> = {
  Bottoms: PHOTO("photo-1694725369452-6cfadad90af3"),
  Shoes: PHOTO("photo-1570051779696-244e9f680cf7"),
  Tops: PHOTO("photo-1598032895397-b9472444bf93"),
  Outerwear: PHOTO("photo-1592327877233-90b9bfd92e48"),
  Bags: PHOTO("photo-1712253600732-baa27bf3c012"),
  Dresses: PHOTO("photo-1581437152838-b666e2bb6c73"),
  Collectibles: PHOTO("photo-1611931960487-4932667079f1"),
  Accessories: PHOTO("photo-1623832101940-647285e32a58"),
};

interface Line {
  brand: string;
  category: string;
  names: string[];
  cost: [number, number];
  price: [number, number];
  sellRate: number; // share that sells within a year
  days: number; // average days to sell
  weight: number; // how often it's sourced
  where: Platform[];
}

const CATALOG: Line[] = [
  { brand: "Lululemon", category: "Bottoms", names: ["Align Leggings", "Wunder Under Leggings", "Dance Studio Joggers"], cost: [4, 9], price: [38, 62], sellRate: 0.92, days: 11, weight: 9, where: ["Poshmark", "Mercari", "Depop"] },
  { brand: "Lululemon", category: "Tops", names: ["Define Jacket", "Swiftly Tech Tee", "Scuba Hoodie"], cost: [5, 12], price: [42, 78], sellRate: 0.9, days: 14, weight: 7, where: ["Poshmark", "Mercari", "eBay"] },
  { brand: "Free People", category: "Dresses", names: ["Flowy Midi Dress", "Smocked Maxi Dress", "Slip Dress"], cost: [5, 10], price: [32, 58], sellRate: 0.8, days: 24, weight: 7, where: ["Poshmark", "Depop", "Mercari"] },
  { brand: "Levi's", category: "Bottoms", names: ["501 Jeans", "505 Jeans", "Ribcage Jeans", "Wedgie Jeans"], cost: [3, 8], price: [26, 48], sellRate: 0.84, days: 19, weight: 9, where: ["eBay", "Poshmark", "Depop"] },
  { brand: "Levi's", category: "Outerwear", names: ["Denim Trucker Jacket", "Sherpa Trucker Jacket"], cost: [6, 12], price: [38, 65], sellRate: 0.82, days: 22, weight: 4, where: ["eBay", "Poshmark"] },
  { brand: "Nike", category: "Shoes", names: ["Air Max 90", "Air Force 1", "Dunk Low", "Pegasus 39"], cost: [10, 22], price: [48, 95], sellRate: 0.86, days: 12, weight: 6, where: ["eBay", "Mercari", "Poshmark"] },
  { brand: "Coach", category: "Bags", names: ["Leather Crossbody Bag", "Signature Tote", "Willow Shoulder Bag"], cost: [8, 20], price: [55, 120], sellRate: 0.78, days: 26, weight: 5, where: ["Poshmark", "eBay", "Mercari"] },
  { brand: "Patagonia", category: "Outerwear", names: ["Better Sweater Fleece", "Synchilla Snap-T", "Nano Puff Jacket"], cost: [8, 16], price: [48, 98], sellRate: 0.88, days: 13, weight: 4, where: ["eBay", "Poshmark", "Mercari"] },
  { brand: "Madewell", category: "Bottoms", names: ["Perfect Vintage Jeans", "Curvy Skinny Jeans"], cost: [4, 8], price: [24, 42], sellRate: 0.7, days: 34, weight: 5, where: ["Poshmark", "Mercari"] },
  { brand: "Zara", category: "Outerwear", names: ["Belted Trench Coat", "Faux Leather Jacket", "Wool Blend Coat"], cost: [5, 10], price: [24, 45], sellRate: 0.62, days: 41, weight: 5, where: ["Poshmark", "Vinted", "Depop"] },
  { brand: "Anthropologie", category: "Bottoms", names: ["Linen Wide Leg Pants", "Colette Trousers"], cost: [5, 10], price: [28, 52], sellRate: 0.72, days: 30, weight: 4, where: ["Poshmark", "Mercari"] },
  { brand: "Ralph Lauren", category: "Tops", names: ["Oxford Shirt", "Cable Knit Sweater", "Polo Shirt"], cost: [3, 7], price: [18, 38], sellRate: 0.66, days: 44, weight: 6, where: ["eBay", "Poshmark", "Etsy"] },
  { brand: "Tommy Hilfiger", category: "Outerwear", names: ["Windbreaker", "Colorblock Jacket"], cost: [4, 9], price: [22, 46], sellRate: 0.68, days: 36, weight: 3, where: ["eBay", "Depop", "Vinted"] },
  { brand: "Juicy Couture", category: "Tops", names: ["Velour Hoodie", "Tracksuit Top"], cost: [4, 8], price: [26, 48], sellRate: 0.74, days: 21, weight: 3, where: ["Depop", "Poshmark", "Mercari"] },
  { brand: "J.Crew", category: "Tops", names: ["Cashmere Sweater", "Perfect Tee", "Silk Blouse"], cost: [3, 7], price: [14, 30], sellRate: 0.5, days: 62, weight: 6, where: ["Poshmark", "Mercari"] },
  { brand: "Old Navy", category: "Tops", names: ["Graphic Tee", "Cozy Cardigan"], cost: [1, 4], price: [8, 16], sellRate: 0.38, days: 78, weight: 5, where: ["Poshmark", "Mercari"] },
  { brand: "Pokémon", category: "Collectibles", names: ["Base Set Holo", "Jungle Holo Lot", "Vintage Booster Pack"], cost: [6, 30], price: [35, 140], sellRate: 0.8, days: 9, weight: 3, where: ["WhatNot", "eBay"] },
  { brand: "Unbranded", category: "Accessories", names: ["Vintage Silk Scarf", "Leather Belt", "Beaded Necklace"], cost: [1, 4], price: [10, 24], sellRate: 0.46, days: 70, weight: 5, where: ["Etsy", "Poshmark", "Depop"] },
  { brand: "Unbranded", category: "Tops", names: ["Hand-knit Cardigan", "Vintage Floral Blouse", "90s Band Tee"], cost: [2, 6], price: [18, 44], sellRate: 0.6, days: 38, weight: 4, where: ["Etsy", "Depop", "eBay"] },
];

const SOURCES: [string, number, number][] = [
  // name, how often, cost multiplier
  ["Goodwill", 30, 1],
  ["Goodwill Outlet (bins)", 18, 0.45],
  ["Estate sale", 10, 0.8],
  ["Facebook Marketplace", 10, 1.3],
  ["Garage sale", 12, 0.6],
  ["Retail clearance", 8, 2.1],
  ["Savers", 12, 1.05],
];

const SIZES: Record<string, string[]> = {
  Bottoms: ["XS", "S", "M", "L", "26", "28", "30"],
  Tops: ["XS", "S", "M", "L", "XL"],
  Dresses: ["XS", "S", "M", "L"],
  Outerwear: ["S", "M", "L", "XL"],
  Shoes: ["7", "8", "9", "10", "11"],
};

const BUYERS = ["jessica_m", "thrift_hunter_99", "cottagecore_kate", "y2k_archive", "deals_always", "secondhandrose", "luxe_finds_la", "resale_queen_ny", "vintage_vault_uk", "capsule_closet", "grunge_garden", "stylestack_sam", "wardrobe_clear", "boho_dreams_shop", "slab_hunter", "denim_dreamer", "athleisure_amy", "preloved_paige", "sneakerhead_sid", "closet_curator"];
const PREFIX: Record<Platform, string> = { Poshmark: "PM", Mercari: "MC", eBay: "EB", Depop: "DP", Etsy: "ET", WhatNot: "WN", Vinted: "VT", Other: "OT" };

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, [lo, hi]: [number, number]) => lo + r() * (hi - lo);
const weighted = <T,>(r: () => number, xs: T[], w: (x: T) => number) => {
  let n = r() * xs.reduce((a, x) => a + w(x), 0);
  for (const x of xs) if ((n -= w(x)) <= 0) return x;
  return xs[xs.length - 1];
};
const cents = (n: number) => Math.round(n * 100) / 100;

export function sampleHistory(today = isoDay(new Date())): { inventory: InventoryItem[]; orders: Order[]; expenses: Expense[] } {
  const r = rng(20261028);
  const inventory: InventoryItem[] = [];
  const orders: Order[] = [];
  const COUNT = 720;
  for (let n = 0; n < COUNT; n++) {
    const line = weighted(r, CATALOG, (l) => l.weight);
    const [source, , mult] = weighted(r, SOURCES, (s) => s[1]);
    // More sourcing lately, as the shop grows.
    const listedAt = addDays(today, -Math.floor(365 * Math.pow(r(), 1.25)));
    const name = pick(r, line.names);
    const size = SIZES[line.category] ? pick(r, SIZES[line.category]) : undefined;
    const title = `${line.brand === "Unbranded" ? "" : `${line.brand} `}${name}${size ? ` ${size}` : ""}`;
    const sku = `${line.brand.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-${String(1000 + n)}`;
    const cost = cents(between(r, line.cost) * mult);
    const listPrice = Math.round(between(r, line.price));
    const item: InventoryItem = {
      id: `sample-inv-${n}`,
      sku,
      title,
      brand: line.brand,
      category: line.category,
      size,
      cost,
      listPrice,
      source,
      purchasedAt: addDays(listedAt, -Math.floor(r() * 9)),
      listedAt,
      status: "listed",
      listings: line.where.slice(0, 1 + Math.floor(r() * line.where.length)).map(
        (platform): Listing => ({ platform, status: "active", listedAt, price: listPrice }),
      ),
      condition: pick(r, CONDITION_MIX),
      quantity: 1,
      labels: r() < 0.25 ? [pick(r, ["lbl-bin-a", "lbl-bin-a", "lbl-photos"])] : [],
      photo: PHOTOS[line.category],
      createdAt: `${listedAt}T12:00:00.000Z`,
    };
    // Days until it sells, spread around the line's average; some never do.
    const days = Math.round(-Math.log(1 - r() * 0.98) * line.days);
    const soldAt = addDays(listedAt, days);
    if (r() < line.sellRate && soldAt <= today) {
      const platform = weighted(r, line.where, (_p) => 1) as Platform;
      const price = Math.round(listPrice * (0.72 + r() * 0.28));
      const sellerShips = (platform === "eBay" || platform === "Etsy") && r() < 0.6;
      const age = daysBetween(soldAt, today);
      item.status = "sold";
      item.soldAt = soldAt;
      // Sold where it sold; taken down everywhere else, except a few recent ones the auto-delist missed.
      const missed = age < 3 && r() < 0.3;
      item.listings = item.listings.map((l) => (l.platform === platform ? { ...l, status: "sold" } : { ...l, status: missed ? "active" : "delisted" }));
      if (!item.listings.some((l) => l.platform === platform)) item.listings.push({ platform, status: "sold", listedAt, price: listPrice });
      orders.push({
        id: `sample-h${n}`,
        platform,
        orderId: `${PREFIX[platform]}-${String(600000 + n * 37).slice(-6)}`,
        buyer: pick(r, BUYERS),
        items: [{ name: title, sku, price, photo: item.photo, cost, brand: line.brand, category: line.category }],
        date: soldAt,
        status: age < 1 ? "printed" : "shipped",
        carrier: platform === "eBay" ? "USPS Ground Advantage" : "USPS Priority",
        source: "sample",
        fees: cents(estimateFees(platform, price)),
        shippingCost: sellerShips ? cents(4.5 + r() * 5) : 0,
        printedAt: `${soldAt}T18:00:00.000Z`,
        shipment: { status: age > 4 ? "delivered" : age < 1 ? "label_created" : "in_transit", updatedAt: `${soldAt}T18:00:00.000Z` },
      });
    }
    // Active listings get relisted now and then.
    if (item.status === "listed") {
      item.listings = item.listings.map((l) => {
        const since = daysBetween(listedAt, today);
        return since > 14 && r() < 0.6 ? { ...l, relistedAt: addDays(today, -Math.floor(r() * Math.min(since, 90))) } : l;
      });
    }
    // Sellers clear out about half of what hasn't sold in six months (donated or sold in a lot).
    if (item.status === "listed" && daysBetween(listedAt, today) > 180 && r() < 0.5) continue;
    inventory.push(item);
  }
  // A few drafts waiting to be listed, as Listy makes them.
  for (let n = 0; n < 14; n++) {
    const line = weighted(r, CATALOG, (l) => l.weight);
    inventory.push({
      id: `sample-draft-${n}`,
      sku: `DRF-${100 + n}`,
      title: `${line.brand === "Unbranded" ? "" : `${line.brand} `}${pick(r, line.names)}`,
      brand: line.brand,
      category: line.category,
      cost: cents(between(r, line.cost)),
      listPrice: Math.round(between(r, line.price)),
      source: weighted(r, SOURCES, (s) => s[1])[0],
      purchasedAt: addDays(today, -Math.floor(r() * 10)),
      status: "draft",
      listings: [],
      condition: pick(r, CONDITION_MIX),
      quantity: 1,
      labels: ["lbl-photos"],
      readyToList: n < 4,
      photo: PHOTOS[line.category],
      createdAt: `${addDays(today, -Math.floor(r() * 5))}T12:00:00.000Z`,
    });
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));
  return { inventory, orders, expenses: sampleExpenses(today, r) };
}

const CONDITION_MIX: Condition[] = ["New with tags", "Like new", "Good", "Good", "Good", "Fair"];

// A year of everyday reseller expenses: supplies, sourcing mileage and a couple of subscriptions.
function sampleExpenses(today: string, r: () => number): Expense[] {
  const out: Expense[] = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = addDays(today, -30 * m - 29);
    out.push({ id: `sample-exp-sub-${m}`, date: monthStart, category: "Software and subscriptions", amount: 16.99, note: "Reship" });
    out.push({ id: `sample-exp-sup-${m}`, date: addDays(monthStart, 6), category: "Shipping supplies", amount: cents(18 + r() * 30), note: "Poly mailers and tape" });
    for (let t = 0; t < 3; t++) {
      const miles = Math.round(12 + r() * 30);
      out.push({ id: `sample-exp-mi-${m}-${t}`, date: addDays(monthStart, 3 + t * 9), category: "Mileage", amount: cents(miles * 0.7), miles, note: "Thrift run" });
    }
  }
  return out.filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date));
}
