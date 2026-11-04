// The SellSync helper: a chat that answers how-to questions about SellSync and reselling.
// On Flow it also sees a short summary of the seller's own shop (inventory, orders, profit), so it can
// answer "what should I mark down?" or "where did I put the Lululemon leggings?".
// This file holds the parts that don't need a network: who gets the helper, the shop summary sent with
// each question, and the canned answers the demo gives without an AI backend.

import type { InventoryItem, Order, Settings } from "./types";
import { type PlanId, PLANS, hasFeature } from "./plans";
import { addDays, daysBetween, saleLines, staleAdvice } from "./analytics";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export type AssistantLevel = "none" | "helper" | "full";

export interface AssistantAccess {
  level: AssistantLevel;
  // Questions a day; 0 when the plan has no helper.
  daily: number;
  // Whether the helper sees the seller's inventory and orders.
  seesShop: boolean;
}

// Sell has no AI. Ship, Sync and Grow get the helper for how-to questions with a daily cap; Flow
// ("Full AI") gets a helper that knows the shop, with a much higher cap.
export const HELPER_DAILY = 15;
export const FULL_DAILY = 200;

export function assistantAccess(plan: PlanId): AssistantAccess {
  if (hasFeature(plan, "ai")) return { level: "full", daily: FULL_DAILY, seesShop: true };
  if (hasFeature(plan, "assistant")) return { level: "helper", daily: HELPER_DAILY, seesShop: false };
  return { level: "none", daily: 0, seesShop: false };
}

// How many earlier messages go with each question. Older ones drop off so a long chat stays cheap.
export const HISTORY_LIMIT = 20;
export const MAX_QUESTION = 2000;

export const STARTERS: Record<"helper" | "full", string[]> = {
  helper: ["How do I crosslist an item?", "How do I print all my labels at once?", "What sells best on Poshmark vs Depop?", "How should I price thrifted jeans?"],
  full: ["What should I mark down this week?", "How much profit did I make this month?", "Which orders still need to ship?", "Which brands make me the most money?"],
};

// --- The shop summary -------------------------------------------------------------------------

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const MAX_ITEMS = 150;
const MAX_ORDERS = 25;

// A plain-text picture of the shop for the AI: totals, what's stale, what needs shipping, how sales are
// going, and a line per item. Kept short (no photos, no buyer addresses).
export function shopSnapshot({ inventory, orders, settings }: { inventory: InventoryItem[]; orders: Order[]; settings: Settings }, today: string): string {
  const out: string[] = [];
  const listed = inventory.filter((i) => i.status === "listed");
  const drafts = inventory.filter((i) => i.status === "draft");
  const sold = inventory.filter((i) => i.status === "sold");
  out.push(`Shop: ${settings.displayName || "(no name set)"}. Today is ${today}. Plan: ${PLANS[settings.plan]?.name ?? settings.plan}.`);
  out.push(
    `Inventory: ${listed.length} listed, ${drafts.length} drafts, ${sold.length} sold. Money tied up in listed items (what they cost): ${money(listed.reduce((s, i) => s + (i.cost ?? 0), 0))}. Listed value: ${money(listed.reduce((s, i) => s + (i.listPrice ?? 0), 0))}.`,
  );
  const byMarket = new Map<string, number>();
  for (const i of listed) for (const l of i.listings) if (l.status === "active") byMarket.set(l.platform, (byMarket.get(l.platform) ?? 0) + 1);
  if (byMarket.size) out.push(`Active listings by marketplace: ${[...byMarket].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(", ")}.`);

  // Sales and profit.
  const lines = saleLines(orders, inventory);
  const sum = (from: string, to: string) => {
    const ls = lines.filter((l) => l.date >= from && l.date <= to);
    return { n: ls.length, sales: ls.reduce((s, l) => s + l.price, 0), profit: ls.reduce((s, l) => s + l.profit, 0) };
  };
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const thisMonth = sum(monthStart, today);
  const lastMonth = sum(lastMonthStart, addDays(monthStart, -1));
  const last30 = sum(addDays(today, -29), today);
  const fmt = (x: { n: number; sales: number; profit: number }) => `${x.n} items sold, ${money(x.sales)} in sales, ${money(x.profit)} profit`;
  out.push(`This month so far: ${fmt(thisMonth)}. Last month: ${fmt(lastMonth)}. Last 30 days: ${fmt(last30)}. (Profit is after marketplace fees, shipping paid and item cost; fees are estimated when an order doesn't say.)`);

  const since90 = addDays(today, -89);
  const top = (key: "brand" | "platform") => {
    const m = new Map<string, { n: number; profit: number }>();
    for (const l of lines) if (l.date >= since90) {
      const k = l[key] || "Unknown";
      const v = m.get(k) ?? { n: 0, profit: 0 };
      m.set(k, { n: v.n + 1, profit: v.profit + l.profit });
    }
    return [...m].sort((a, b) => b[1].profit - a[1].profit).slice(0, 6).map(([k, v]) => `${k} (${v.n} sold, ${money(v.profit)})`).join(", ");
  };
  if (lines.some((l) => l.date >= since90)) {
    out.push(`Most profitable brands, last 90 days: ${top("brand")}.`);
    out.push(`Profit by marketplace, last 90 days: ${top("platform")}.`);
  }

  // Stale listings.
  const stale = listed
    .filter((i) => i.listedAt && daysBetween(i.listedAt, today) > 60)
    .map((i) => staleAdvice(i, daysBetween(i.listedAt!, today)))
    .sort((a, b) => b.age - a.age);
  if (stale.length) {
    out.push(`Listed over 60 days (${stale.length}), oldest first:`);
    for (const s of stale.slice(0, 12))
      out.push(`- ${s.item.sku} ${s.item.title}: ${s.age} days, listed at ${s.item.listPrice != null ? money(s.item.listPrice) : "no price"}${s.suggestedPrice != null ? `, suggested ${money(s.suggestedPrice)}` : ""}. ${s.advice}.`);
  }

  // Orders to handle.
  const toPrint = orders.filter((o) => o.status === "pending");
  const toShip = orders.filter((o) => o.status === "printed");
  out.push(`Orders: ${toPrint.length} need a label printed, ${toShip.length} printed but not shipped yet.`);
  const recent = [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ORDERS);
  if (recent.length) {
    out.push(`Latest orders (date | marketplace | items | status):`);
    for (const o of recent)
      out.push(`- ${o.date} | ${o.platform} | ${o.items.map((i) => `${i.name}${i.price != null ? ` ${money(i.price)}` : ""}${i.sku ? ` [${i.sku}]` : ""}`).join("; ")} | ${o.status}${o.shipment ? `, ${o.shipment.status.replace("_", " ")}` : ""}`);
  }

  // A line per item, listed first, then drafts; newest first.
  const items = [...listed, ...drafts].sort((a, b) => (b.listedAt ?? b.purchasedAt ?? "").localeCompare(a.listedAt ?? a.purchasedAt ?? ""));
  if (items.length) {
    out.push(`Items (SKU | title | brand | size | list price | cost | days listed | live on | location | views/watchers)${items.length > MAX_ITEMS ? `, newest ${MAX_ITEMS} of ${items.length}` : ""}:`);
    for (const i of items.slice(0, MAX_ITEMS)) {
      const live = i.listings.filter((l) => l.status === "active").map((l) => l.platform);
      const views = i.listings.reduce((s, l) => s + (l.views ?? 0), 0);
      const watchers = i.listings.reduce((s, l) => s + (l.watchers ?? 0), 0);
      out.push(
        [
          i.sku || "-",
          i.title,
          i.brand || "-",
          i.size || "-",
          i.listPrice != null ? money(i.listPrice) : "-",
          i.cost != null ? money(i.cost) : "-",
          i.status === "draft" ? "draft" : i.listedAt ? String(daysBetween(i.listedAt, today)) : "-",
          live.join("+") || "-",
          i.location || "-",
          views || watchers ? `${views}/${watchers}` : "-",
        ].join(" | "),
      );
    }
  }
  return out.join("\n");
}

// --- Demo answers -----------------------------------------------------------------------------

// What the demo can say without an AI backend: a few how-to topics, and answers worked out from the
// sample shop. Each topic matches on a few words in the question.
const HOW_TO: { words: RegExp; answer: string }[] = [
  {
    words: /crosslist|cross-list|list (it )?(on|to) (other|more|another)/,
    answer:
      "To crosslist an item, open [Inventory](#/inventory), click the item's menu and pick **Crosslist**, then tick the marketplaces you want. **Crosslist to all** puts it on every marketplace you use that it isn't on yet. When it sells anywhere, SellSync takes the other listings down. Crosslisting is on Sync and up.",
  },
  {
    words: /print|label|packing slip/,
    answer:
      "Go to [Orders](#/orders), tick the orders you want (or **Select all** under *Needs label*), then press **Print labels**. You get one PDF with every label, and you can add the SKU and a packing slip to each one. On Mercari and Depop orders, **Buy label** compares the marketplace's label with SellSync's and buys the cheaper one.",
  },
  {
    words: /sku|barcode|scan/,
    answer:
      "Every new item gets the next SKU automatically (set the prefix in [Settings](#/settings?tab=guardian)). To print SKU labels, select items in [Inventory](#/inventory) and press **SKU labels**. **Scan** in Inventory finds an item by its barcode and lets you set where it's stored.",
  },
  {
    words: /backup|restore|lost|undo/,
    answer:
      "SellSync makes a backup of your inventory every day you open it. Open **Guardian** in [Inventory](#/inventory) to see backups, download one, or restore items from it. Restoring only changes SellSync's records, never your marketplace listings.",
  },
  {
    words: /import|csv|spreadsheet/,
    answer:
      "In [Orders](#/orders), press **Import CSV** and pick the export file from your marketplace. SellSync matches the columns for you and groups bundles together.",
  },
  {
    words: /video|photos?|ai listing|describe/,
    answer:
      "In [Inventory](#/inventory), press **Add** and pick **List with a video** or **List from photos**. SellSync finds each item, writes the title and description, and suggests a price for you to check. This is part of Full AI on Flow.",
  },
  {
    words: /comps?|research|price check|worth/,
    answer:
      "Open [Research](#/research) and search for the item. You'll see sold and listed prices side by side with a suggested range. You can also pick **Find comps** from any item's menu.",
  },
  {
    words: /automation|relist|offer|share/,
    answer: "[Automations](#/automations) relist stale items and send offers to likers on a schedule. They're on Grow and up.",
  },
  {
    words: /plan|upgrade|price of sellsync|subscription|cost of sellsync/,
    answer:
      "SellSync has five plans: Ship $10, Sell $25, Sync $50, Grow $65 and Flow $150 a month, each with everything in the ones before it. See them in [Settings → Subscription](#/settings?tab=subscription).",
  },
];

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9$ ]+/g, " ");

export function demoAnswer(question: string, shop: { inventory: InventoryItem[]; orders: Order[]; settings: Settings }, today: string): string {
  const q = words(question);
  const listed = shop.inventory.filter((i) => i.status === "listed");

  if (/mark ?down|stale|old|not selling|sitting|lower (the )?price|drop (the )?price/.test(q)) {
    const stale = listed
      .filter((i) => i.listedAt && daysBetween(i.listedAt, today) > 60)
      .map((i) => staleAdvice(i, daysBetween(i.listedAt!, today)))
      .sort((a, b) => b.age - a.age);
    if (!stale.length) return "Nothing has been listed for more than 60 days, so there's nothing to mark down yet. Nice work.";
    const top = stale.slice(0, 5).map((s) => `- **${s.item.title}** (${s.item.sku}), ${s.age} days${s.suggestedPrice != null ? `: try ${money(s.suggestedPrice)} instead of ${money(s.item.listPrice!)}` : ""}. ${s.advice}.`);
    return `You have ${stale.length} item${stale.length === 1 ? "" : "s"} listed for over 60 days. Start with these:\n\n${top.join("\n")}\n\nSee them all on [Analytics → Inventory health](#/analytics?tab=inventory).`;
  }

  if (/profit|made|earn|sales|revenue|how (am i|is my shop) doing/.test(q)) {
    const lines = saleLines(shop.orders, shop.inventory);
    const monthStart = `${today.slice(0, 7)}-01`;
    const ls = lines.filter((l) => l.date >= monthStart && l.date <= today);
    const sales = ls.reduce((s, l) => s + l.price, 0);
    const profit = ls.reduce((s, l) => s + l.profit, 0);
    return `This month so far you've sold ${ls.length} item${ls.length === 1 ? "" : "s"} for ${money(sales)}, and kept ${money(profit)} after fees, shipping and what you paid for them. The full picture is in [Analytics](#/analytics).`;
  }

  if (/ship|need(s)? to go out|to send|pending|orders/.test(q) && !/how/.test(q)) {
    const toPrint = shop.orders.filter((o) => o.status === "pending");
    const toShip = shop.orders.filter((o) => o.status === "printed");
    if (!toPrint.length && !toShip.length) return "You're all caught up: every order has shipped.";
    const list = toPrint.slice(0, 5).map((o) => `- ${o.platform}: ${o.items.map((i) => i.name).join(", ")} (sold ${o.date})`);
    return `${toPrint.length} order${toPrint.length === 1 ? " needs" : "s need"} a label and ${toShip.length} ${toShip.length === 1 ? "is" : "are"} printed but not shipped yet.${list.length ? `\n\nNeeds a label:\n${list.join("\n")}` : ""}\n\nPrint them all from [Orders](#/orders).`;
  }

  if (/where|find|location|bin/.test(q)) {
    const terms = q.split(" ").filter((w) => w.length > 2 && !["where", "find", "did", "put", "the", "my", "is", "are", "location", "bin", "what", "can"].includes(w));
    const hits = shop.inventory.filter((i) => i.status !== "sold" && terms.length && terms.every((t) => words(`${i.title} ${i.brand ?? ""} ${i.sku}`).includes(t)));
    if (hits.length)
      return hits
        .slice(0, 5)
        .map((i) => `- **${i.title}** (${i.sku}): ${i.location ? `stored in ${i.location}` : "no storage location set yet"}`)
        .join("\n");
  }

  if (/brand/.test(q)) {
    const lines = saleLines(shop.orders, shop.inventory).filter((l) => l.date >= addDays(today, -89));
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.brand, (m.get(l.brand) ?? 0) + l.profit);
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) return `Your most profitable brands over the last 90 days:\n\n${top.map(([b, p], i) => `${i + 1}. **${b}**: ${money(p)}`).join("\n")}\n\nMore in [Analytics → Brands](#/analytics?tab=brands).`;
  }

  const topic = HOW_TO.find((t) => t.words.test(q));
  if (topic) return topic.answer;

  return "In the demo I can answer common questions, like what to mark down, how much you've made, what needs to ship, where an item is stored, or how to crosslist, print labels and restore a backup. With a SellSync account the helper runs on Claude and can answer anything about SellSync or reselling.";
}
