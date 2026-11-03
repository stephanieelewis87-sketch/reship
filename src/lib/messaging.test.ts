import { describe, expect, it } from "vitest";
import type { Order } from "./types";
import {
  DEFAULT_TEMPLATES,
  MESSAGE_RULES,
  MESSAGING_PLATFORMS,
  contactKey,
  fillTemplate,
  isAllowed,
  messagePageUrl,
  messagingOf,
  pastBuyers,
  promoCheck,
  recordContact,
  suggestedTemplateId,
  templatesFor,
} from "./messaging";

const order = (id: string, buyer: string, date: string, extra: Partial<Order> = {}): Order => ({
  id,
  platform: "Poshmark",
  orderId: `pm-${id}`,
  buyer,
  items: [{ name: `Item ${id}`, price: 20 }],
  date,
  status: "pending",
  carrier: "USPS",
  source: "sync",
  ...extra,
});

describe("marketplace rules", () => {
  it("allows Poshmark bundle comments and order-page notes, but no messages to shoppers", () => {
    expect(isAllowed("Poshmark", "bundle")).toBe(true);
    expect(MESSAGE_RULES.Poshmark.pastBuyer.allowed).toBe("limited");
    expect(isAllowed("Poshmark", "potentialBuyer")).toBe(false);
  });

  it("only offers bundle comments on Poshmark", () => {
    for (const p of MESSAGING_PLATFORMS) expect(isAllowed(p, "bundle")).toBe(p === "Poshmark");
  });

  it("doesn't message potential buyers where the marketplace calls it spam or has no messages", () => {
    for (const p of ["eBay", "Etsy", "Mercari", "ThredUp"] as const) expect(isAllowed(p, "potentialBuyer")).toBe(false);
    for (const p of ["Depop", "Vinted", "Facebook"] as const) expect(isAllowed(p, "potentialBuyer")).toBe(true);
  });

  it("gives no templates where the marketplace doesn't allow the message", () => {
    expect(templatesFor(DEFAULT_TEMPLATES, "eBay", "potentialBuyer")).toEqual([]);
    expect(templatesFor(DEFAULT_TEMPLATES, "Poshmark", "bundle").length).toBeGreaterThan(0);
  });

  it("keeps templates limited to their marketplaces", () => {
    const t = [{ id: "a", name: "a", context: "potentialBuyer" as const, platforms: ["Depop" as const], text: "x" }];
    expect(templatesFor(t, "Depop", "potentialBuyer")).toHaveLength(1);
    expect(templatesFor(t, "Vinted", "potentialBuyer")).toHaveLength(0);
  });
});

describe("fillTemplate", () => {
  it("fills placeholders", () => {
    expect(fillTemplate("Hi {buyer}, {item} is {discount} off", { buyer: "sam", item: "the jeans", discount: "15%" })).toBe("Hi sam, the jeans is 15% off");
  });

  it("uses words that still read well when a value is missing", () => {
    expect(fillTemplate("Hi {buyer}! Thanks for bundling {item}.", {})).toBe("Hi there! Thanks for bundling your items.");
  });
});

describe("promotional notes", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("allows the first one", () => expect(promoCheck(undefined, now).ok).toBe(true));

  it("waits 30 days between notes about new items", () => {
    const contacts = recordContact({}, "k", true, new Date("2026-10-20T12:00:00Z"));
    const check = promoCheck(contacts.k, now);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/14 days ago.*16 more days/);
    expect(promoCheck(contacts.k, new Date("2026-11-20T12:00:00Z")).ok).toBe(true);
  });

  it("doesn't count order messages against the wait", () => {
    const contacts = recordContact({}, "k", false, now);
    expect(contacts.k.count).toBe(1);
    expect(promoCheck(contacts.k, now).ok).toBe(true);
  });

  it("never allows them to a buyer marked don't contact", () => {
    expect(promoCheck({ lastAt: "", count: 0, optOut: true }, now).ok).toBe(false);
  });
});

describe("pastBuyers", () => {
  it("groups a buyer's orders, newest first, and skips cancelled ones and other marketplaces", () => {
    const orders = [
      order("1", "sam", "2026-09-01"),
      order("2", "@Sam", "2026-10-15"),
      order("3", "lee", "2026-10-01"),
      order("4", "lee", "2026-10-30", { shipment: { status: "cancelled", updatedAt: "" } }),
      order("5", "kim", "2026-10-31", { platform: "Depop" }),
    ];
    const list = pastBuyers(orders, "Poshmark");
    expect(list.map((b) => b.buyer)).toEqual(["Sam", "lee"]);
    expect(list[0].orders.map((o) => o.id)).toEqual(["2", "1"]);
    expect(list[0].spent).toBe(40);
    expect(list[0].key).toBe(contactKey("Poshmark", "sam"));
  });
});

describe("helpers", () => {
  it("suggests a template that fits where the order is", () => {
    expect(suggestedTemplateId(order("1", "a", "2026-10-01"))).toBe("tpl-past-thanks");
    expect(suggestedTemplateId(order("1", "a", "2026-10-01", { status: "shipped" }))).toBe("tpl-past-shipped");
    expect(suggestedTemplateId(order("1", "a", "2026-10-01", { status: "shipped", shipment: { status: "delivered", updatedAt: "" } }))).toBe("tpl-past-delivered");
  });

  it("opens the Poshmark order page for past buyers and the closet otherwise", () => {
    expect(messagePageUrl("Poshmark", "pastBuyer", { orderId: "abc123" })).toBe("https://poshmark.com/order/sales/abc123");
    expect(messagePageUrl("Poshmark", "bundle", { buyer: "@sam" })).toBe("https://poshmark.com/closet/sam");
  });

  it("fills in default templates for settings saved before messages existed", () => {
    expect(messagingOf(undefined).templates).toBe(DEFAULT_TEMPLATES);
    expect(messagingOf({ templates: [], contacts: {} }).templates).toBe(DEFAULT_TEMPLATES);
  });
});
