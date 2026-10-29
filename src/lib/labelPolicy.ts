import type { Order, Platform } from "./types";

// Which label an order ships on, by marketplace:
// - "reship": Reship buys the label (eBay, Etsy and direct sales have no label of their own to use).
// - "compare": the marketplace lets the seller ship on their own (Mercari, Depop US), so Reship
//   compares the marketplace's label price with its own and suggests the cheaper one.
// - "marketplace": the marketplace's prepaid label is the one to use (Poshmark, Whatnot, Vinted);
//   Reship only shows and prints it, and never buys a second one.
export type LabelPolicy = "reship" | "compare" | "marketplace";

export const LABEL_POLICY: Record<Platform, LabelPolicy> = {
  eBay: "reship",
  Etsy: "reship",
  Other: "reship",
  Mercari: "compare",
  Depop: "compare",
  Poshmark: "marketplace",
  WhatNot: "marketplace",
  Vinted: "marketplace",
};

export const labelPolicy = (o: Pick<Order, "platform">): LabelPolicy => LABEL_POLICY[o.platform];

export const canBuyReshipLabel = (o: Pick<Order, "platform">) => labelPolicy(o) !== "marketplace";

export interface LabelComparison {
  pick: "reship" | "marketplace" | "unknown";
  reshipPrice: number | null;
  marketplacePrice: number | null;
  savings: number; // how much the picked label saves over the other, 0 when unknown
}

// Reship's label is only suggested when it actually costs less; a tie keeps the marketplace's,
// since that one needs no tracking number to be copied over.
export function compareLabels(marketplacePrice: number | null, reshipPrice: number | null): LabelComparison {
  const m = marketplacePrice != null && marketplacePrice > 0 ? marketplacePrice : null;
  const r = reshipPrice != null && reshipPrice > 0 ? reshipPrice : null;
  if (m == null || r == null) return { pick: "unknown", reshipPrice: r, marketplacePrice: m, savings: 0 };
  const diff = Math.round((m - r) * 100) / 100;
  return diff > 0
    ? { pick: "reship", reshipPrice: r, marketplacePrice: m, savings: diff }
    : { pick: "marketplace", reshipPrice: r, marketplacePrice: m, savings: Math.abs(diff) };
}

// "$7.49", "7.49", " 7 " → 7.49 / 7; anything else → null.
export function parsePrice(text: string): number | null {
  const n = Number.parseFloat(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Where the seller handles this order on the marketplace, when Reship knows the page.
export function marketplaceOrderUrl(o: Pick<Order, "platform" | "orderId">): string | undefined {
  const id = encodeURIComponent(o.orderId);
  switch (o.platform) {
    case "Mercari":
      return /^m\d+$/.test(o.orderId) ? `https://www.mercari.com/transaction/order_status/${id}/` : "https://www.mercari.com/mypage/listings/in_progress/";
    case "Depop":
      return "https://www.depop.com/sellinghub/sold-items/";
    case "Poshmark":
      return "https://poshmark.com/order/sales";
    case "Vinted":
      return "https://www.vinted.com/my_orders/sold";
    case "WhatNot":
      return "https://www.whatnot.com/dashboard/orders";
    default:
      return undefined;
  }
}

// What to do on the marketplace once a Reship label is bought, so the sale shows as shipped there.
export const PASTE_TRACKING_STEPS: Partial<Record<Platform, string[]>> = {
  Mercari: [
    "Open the order on Mercari.",
    "Choose Ship on your own (if it isn't already) and then Add tracking.",
    "Paste the tracking number, pick the carrier and confirm.",
  ],
  Depop: [
    "Open the sale in Depop's Sold items.",
    "Choose Mark as shipped and select that you're shipping it yourself.",
    "Paste the tracking number, pick the carrier and confirm.",
  ],
};

// Shown for marketplaces whose prepaid label must be used.
export const PREPAID_LABEL_NOTE: Partial<Record<Platform, string>> = {
  Poshmark: "Poshmark sends a prepaid label with every sale. Ship on that label so the sale is covered and tracked by Poshmark.",
  WhatNot: "Whatnot makes the prepaid label for each sale. Ship on that label so tracking and payout stay with Whatnot.",
  Vinted: "Vinted makes the prepaid label (or drop-off code) for each sale. Ship on that so buyer protection and payout stay with Vinted.",
};
