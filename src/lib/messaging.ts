import type { Order, Platform } from "./types";

// Buyer messages: bundle comments on Poshmark, notes to past buyers on their order page, and
// messages to people interested in an item, on the marketplaces whose rules allow it.
//
// Every marketplace here bans bots or unsolicited promotion in some form, so SellSync never sends
// anything by itself. It writes the message, copies it, and opens the right page; the seller reads
// it and presses Send on the marketplace. The extension can also drop a template into a comment
// box on Poshmark or Depop, and still never presses Post.

export type MessageContext = "bundle" | "pastBuyer" | "potentialBuyer";
export const MESSAGE_CONTEXTS: MessageContext[] = ["bundle", "pastBuyer", "potentialBuyer"];

export const CONTEXT_LABEL: Record<MessageContext, string> = {
  bundle: "Bundle comments",
  pastBuyer: "Past buyers",
  potentialBuyer: "Potential buyers",
};

export interface MessageTemplate {
  id: string;
  name: string;
  context: MessageContext;
  // Only for these marketplaces. Empty or missing means any marketplace that allows the context.
  platforms?: Platform[];
  text: string;
  // About new items or a sale rather than the buyer's own order. Marketplaces treat repeated
  // promotion as spam, so SellSync allows one promotional note per buyer every PROMO_GAP_DAYS.
  promo?: boolean;
}

// What SellSync remembers about messaging one buyer on one marketplace.
export interface ContactRecord {
  lastAt: string; // ISO time of the last message SellSync opened for them
  lastPromoAt?: string;
  count: number;
  optOut?: boolean; // the buyer asked not to be contacted, or the seller chose not to
}

export interface MessagingSettings {
  templates: MessageTemplate[];
  contacts: Record<string, ContactRecord>; // keyed by contactKey()
}

export const PROMO_GAP_DAYS = 30;

export type Allowed = "yes" | "limited" | "no";

export interface MessageRule {
  allowed: Allowed;
  text: string; // what the marketplace allows, in plain words
  source?: { label: string; url: string };
}

const POSH_GUIDELINES = { label: "Poshmark Community Guidelines", url: "https://poshmark.com/community_guidelines" };
const POSH_TERMS = { label: "Poshmark Terms of Service", url: "https://poshmark.com/terms" };
const EBAY_SPAM = { label: "eBay spam policy", url: "https://www.ebay.com/help/policies/member-behavior-policies/spam-policy?id=5033" };
const ETSY_RULES = { label: "Etsy House Rules", url: "https://www.etsy.com/help/article/4508" };
const VINTED_OFFERS = { label: "Vinted Help: offers", url: "https://www.vinted.co.uk/help/258" };
const DEPOP_OFFERS = { label: "Depop offers", url: "https://partnerapi.depop.com/api-docs/how-to-guides/managing-offers/" };

const NO_BUNDLES: MessageRule = { allowed: "no", text: "Bundles with comments are a Poshmark feature." };

// What each marketplace allows, checked against its own rules (November 2026).
export const MESSAGE_RULES: Record<Platform, Record<MessageContext, MessageRule>> = {
  Poshmark: {
    bundle: {
      allowed: "yes",
      text: "Comment on a shopper's bundle from My Shoppers, for example to offer a bundle discount or answer a question. Poshmark doesn't allow automation to take part for you, so you post each comment yourself.",
      source: POSH_GUIDELINES,
    },
    pastBuyer: {
      allowed: "limited",
      text: "Leave a comment on the buyer's order page. Poshmark only lets you use a buyer's details for that order, so keep it about the order: thanks, shipping, delivery. A note about new items in their size is fine once in a while, never over and over.",
      source: POSH_TERMS,
    },
    potentialBuyer: {
      allowed: "no",
      text: "Poshmark has no messages to shoppers before they buy. Comment on their bundle, reply on the listing, or send an offer to likers instead.",
      source: POSH_GUIDELINES,
    },
  },
  Depop: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "yes", text: "Message the buyer in your Depop conversation about their order." },
    potentialBuyer: {
      allowed: "yes",
      text: "Message people who liked, saved, bagged or asked about an item, one at a time in Depop's messages. Depop bans bots and mass messages, so you send each one. Depop can also send offers to likers by itself.",
      source: DEPOP_OFFERS,
    },
  },
  Vinted: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "yes", text: "Message the buyer in the order's conversation on Vinted." },
    potentialBuyer: {
      allowed: "limited",
      text: "Reply to members who started a conversation about your item, and make them an offer there (up to 40% off). SellSync doesn't read Vinted, so you paste the message into Vinted yourself.",
      source: VINTED_OFFERS,
    },
  },
  Mercari: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "limited", text: "Use the order's messages on Mercari, about that order only." },
    potentialBuyer: {
      allowed: "no",
      text: "Mercari has no private messages before a sale. Answer questions in the listing's comments, or send an offer to likers.",
    },
  },
  eBay: {
    bundle: NO_BUNDLES,
    pastBuyer: {
      allowed: "limited",
      text: "Message the buyer about their order from Seller Hub. eBay counts unsolicited sales messages as spam, and messages can't include links, emails or phone numbers.",
      source: EBAY_SPAM,
    },
    potentialBuyer: {
      allowed: "no",
      text: "eBay lists unsolicited offers to potential buyers as spam. Use Send offer to watchers instead (Offers in Automations), and answer questions buyers send you.",
      source: EBAY_SPAM,
    },
  },
  Etsy: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "limited", text: "Message the buyer about their order. Etsy bans unsolicited advertising in Messages.", source: ETSY_RULES },
    potentialBuyer: {
      allowed: "no",
      text: "Etsy bans unsolicited advertising in Messages. Use Etsy's own offers to people who favorited an item (Marketing > Sales and discounts), and reply to buyers who write to you.",
      source: ETSY_RULES,
    },
  },
  Facebook: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "limited", text: "Message the buyer in the Marketplace conversation about their order." },
    potentialBuyer: {
      allowed: "limited",
      text: "Reply to people who messaged you about an item, in Marketplace messages. Facebook doesn't allow tools to message people for you.",
    },
  },
  WhatNot: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "limited", text: "Message the buyer about their order in Whatnot." },
    potentialBuyer: { allowed: "limited", text: "Reply to people who messaged you about an item. Whatnot treats unsolicited messages as spam." },
  },
  ThredUp: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "no", text: "ThredUp has no messages between sellers and buyers." },
    potentialBuyer: { allowed: "no", text: "ThredUp has no messages between sellers and buyers." },
  },
  Other: {
    bundle: NO_BUNDLES,
    pastBuyer: { allowed: "limited", text: "Follow that marketplace's rules on messaging buyers." },
    potentialBuyer: { allowed: "limited", text: "Follow that marketplace's rules on messaging buyers." },
  },
};

export const isAllowed = (platform: Platform, context: MessageContext) => MESSAGE_RULES[platform][context].allowed !== "no";

// Marketplaces with at least one kind of buyer message SellSync can help with.
export const MESSAGING_PLATFORMS: Platform[] = (Object.keys(MESSAGE_RULES) as Platform[]).filter(
  (p) => p !== "Other" && p !== "ThredUp",
);

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "tpl-bundle-thanks",
    name: "Thanks for bundling",
    context: "bundle",
    text: "Hi {buyer}! Thanks for bundling {item}. If you add one more item, I'll send you a private offer with {discount} off the whole bundle.",
  },
  {
    id: "tpl-bundle-offer",
    name: "Bundle offer coming",
    context: "bundle",
    text: "Hi {buyer}, I love what you picked! I'm sending you a bundle offer with {discount} off and a shipping discount. Let me know if you have any questions.",
  },
  {
    id: "tpl-bundle-question",
    name: "Happy to help",
    context: "bundle",
    text: "Hi {buyer}! Let me know if you'd like measurements or more photos of {item}. Happy to help.",
  },
  {
    id: "tpl-past-thanks",
    name: "Thank you",
    context: "pastBuyer",
    text: "Hi {buyer}, thank you so much for your order of {item}! It's packed with care and will ship soon.",
  },
  {
    id: "tpl-past-shipped",
    name: "It's on the way",
    context: "pastBuyer",
    text: "Hi {buyer}, {item} is on its way. I hope you love it!",
  },
  {
    id: "tpl-past-delivered",
    name: "Did it arrive?",
    context: "pastBuyer",
    text: "Hi {buyer}, I see {item} was delivered. I hope it fits and you love it! If anything's wrong, let me know here and I'll make it right.",
  },
  {
    id: "tpl-past-new",
    name: "New items you might like",
    context: "pastBuyer",
    promo: true,
    text: "Hi {buyer}, thanks again for buying {item}! I just added a few new pieces you might like. Bundle two or more and I'll send you {discount} off.",
  },
  {
    id: "tpl-potential-interest",
    name: "Saw you liked it",
    context: "potentialBuyer",
    text: "Hi {buyer}! I saw you liked {item}. It's still available, and I can do {discount} off if you'd like it.",
  },
  {
    id: "tpl-potential-question",
    name: "Answer a question",
    context: "potentialBuyer",
    text: "Hi {buyer}, thanks for asking about {item}! Let me know if you'd like measurements or more photos.",
  },
];

export const DEFAULT_MESSAGING: MessagingSettings = { templates: DEFAULT_TEMPLATES, contacts: {} };

// Settings saved before messaging existed have none, so fill in the defaults.
export function messagingOf(saved?: Partial<MessagingSettings>): MessagingSettings {
  return { templates: saved?.templates?.length ? saved.templates : DEFAULT_TEMPLATES, contacts: saved?.contacts ?? {} };
}

export function templatesFor(templates: MessageTemplate[], platform: Platform, context: MessageContext): MessageTemplate[] {
  if (!isAllowed(platform, context)) return [];
  return templates.filter((t) => t.context === context && (!t.platforms?.length || t.platforms.includes(platform)));
}

export interface TemplateValues {
  buyer?: string;
  item?: string;
  discount?: string;
  seller?: string;
}

// Fills {buyer}, {item}, {discount} and {seller}. Missing values get words that still read well,
// so a template dropped into a comment box never shows a bare placeholder.
export function fillTemplate(text: string, values: TemplateValues): string {
  const fallback: Required<TemplateValues> = { buyer: "there", item: "your items", discount: "10%", seller: "" };
  return text
    .replace(/\{(buyer|item|discount|seller)\}/g, (_, key: keyof TemplateValues) => values[key]?.trim() || fallback[key])
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const contactKey = (platform: Platform, buyer: string) => `${platform}:${buyer.trim().replace(/^@/, "").toLowerCase()}`;

export const DAY_MS = 86_400_000;

// Whether a promotional note to this buyer would be fine now, and if not, why.
export function promoCheck(record: ContactRecord | undefined, now = new Date()): { ok: boolean; reason?: string } {
  if (record?.optOut) return { ok: false, reason: "This buyer is marked as don't contact." };
  if (!record?.lastPromoAt) return { ok: true };
  const days = Math.floor((now.getTime() - new Date(record.lastPromoAt).getTime()) / DAY_MS);
  if (days >= PROMO_GAP_DAYS) return { ok: true };
  const wait = PROMO_GAP_DAYS - days;
  return { ok: false, reason: `You sent this buyer a note about new items ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}. Wait ${wait} more day${wait === 1 ? "" : "s"} so it doesn't count as spam.` };
}

// Notes that a message was written and opened for this buyer.
export function recordContact(contacts: Record<string, ContactRecord>, key: string, promo: boolean, now = new Date()): Record<string, ContactRecord> {
  const prev = contacts[key];
  const at = now.toISOString();
  return { ...contacts, [key]: { ...prev, count: (prev?.count ?? 0) + 1, lastAt: at, lastPromoAt: promo ? at : prev?.lastPromoAt } };
}

export interface PastBuyer {
  key: string;
  platform: Platform;
  buyer: string;
  orders: Order[]; // newest first
  lastOrder: Order;
  spent: number;
}

// Everyone who bought from the seller on one marketplace, newest order first.
export function pastBuyers(orders: Order[], platform: Platform): PastBuyer[] {
  const byKey = new Map<string, PastBuyer>();
  for (const o of orders) {
    if (o.platform !== platform || !o.buyer.trim() || o.shipment?.status === "cancelled") continue;
    const key = contactKey(platform, o.buyer);
    const entry = byKey.get(key) ?? { key, platform, buyer: o.buyer.trim().replace(/^@/, ""), orders: [], lastOrder: o, spent: 0 };
    entry.orders.push(o);
    entry.spent += o.items.reduce((s, i) => s + (i.price ?? 0), 0);
    byKey.set(key, entry);
  }
  const list = [...byKey.values()];
  for (const b of list) {
    b.orders.sort((a, z) => z.date.localeCompare(a.date));
    b.lastOrder = b.orders[0];
    b.buyer = b.lastOrder.buyer.trim().replace(/^@/, "");
  }
  return list.sort((a, z) => z.lastOrder.date.localeCompare(a.lastOrder.date));
}

// The template that fits where an order is: thanks before it ships, on its way, then delivered.
export function suggestedTemplateId(order: Order): string {
  if (order.shipment?.status === "delivered") return "tpl-past-delivered";
  if (order.status === "shipped" || order.shipment?.status === "in_transit") return "tpl-past-shipped";
  return "tpl-past-thanks";
}

export const orderItemText = (o: Order) =>
  o.items.length > 1 ? `${o.items[0].name} and ${o.items.length - 1} more` : o.items[0]?.name ?? "your order";

const handle = (s: string) => encodeURIComponent(s.trim().replace(/^@/, ""));

// The page to paste the message into. Only addresses SellSync already uses or that are each
// marketplace's long-standing public pages; otherwise the marketplace's home page.
export function messagePageUrl(platform: Platform, context: MessageContext, opts: { buyer?: string; orderId?: string }): string {
  const { buyer, orderId } = opts;
  switch (platform) {
    case "Poshmark":
      if (context === "pastBuyer" && orderId) return `https://poshmark.com/order/sales/${encodeURIComponent(orderId)}`;
      if (buyer) return `https://poshmark.com/closet/${handle(buyer)}`;
      return "https://poshmark.com/";
    case "Depop":
      return buyer ? `https://www.depop.com/${handle(buyer)}/` : "https://www.depop.com/";
    case "Vinted":
      return "https://www.vinted.com/inbox";
    case "Mercari":
      return "https://www.mercari.com/";
    case "eBay":
      return "https://www.ebay.com/sh/ord";
    case "Etsy":
      return "https://www.etsy.com/your/orders/sold";
    case "Facebook":
      return "https://www.facebook.com/marketplace/inbox";
    case "WhatNot":
      return "https://www.whatnot.com/";
    default:
      return "";
  }
}

// Where to post it once the page is open, in a few words.
export function whereToPost(platform: Platform, context: MessageContext): string {
  if (platform === "Poshmark" && context === "bundle") return "On Poshmark, open My Shoppers, tap this shopper's bundle, and paste it as a comment.";
  if (platform === "Poshmark" && context === "pastBuyer") return "Paste it as a comment on the order page.";
  if (platform === "Depop") return "Open Message on their profile and paste it.";
  if (platform === "Vinted") return "Open the conversation about this item and paste it.";
  if (platform === "eBay") return "Open the order, choose Contact buyer, and paste it.";
  if (platform === "Etsy") return "Open the order, choose Message buyer, and paste it.";
  return "Open the conversation and paste it.";
}
