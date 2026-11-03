// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Commission } from "./affiliates";
import { DEFAULT_PROGRAM, balances, bonusRule, commissionsFor, formatCents, normalizeCode, projectEarnings, suggestCode } from "./affiliates";
import { sampleAffiliateHistory } from "./affiliateStore";
import { captureReferral, clearReferral, pendingReferral } from "./referralCapture";

const fresh = { totalPaidCents: 0, bonusEarned: false };

describe("commissionsFor", () => {
  it("pays 5% of every payment and the $100 bonus on a Grow or Flow first payment", () => {
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "grow", cents: 4900 })).toEqual([
      { kind: "recurring", amountCents: 245 },
      { kind: "bonus", amountCents: 10000 },
    ]);
    expect(commissionsFor(DEFAULT_PROGRAM, { totalPaidCents: 4900, bonusEarned: true }, { plan: "grow", cents: 4900 })).toEqual([{ kind: "recurring", amountCents: 245 }]);
  });

  it("pays no bonus on Ship by default, only the 5%", () => {
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "ship", cents: 999 })).toEqual([{ kind: "recurring", amountCents: 50 }]);
  });

  it("can pay the bonus on any plan, or wait until the seller has paid enough", () => {
    const anyPlan = { ...DEFAULT_PROGRAM, bonusPlans: ["ship", "grow", "flow"] as const } as typeof DEFAULT_PROGRAM;
    expect(commissionsFor(anyPlan, fresh, { plan: "ship", cents: 999 })).toHaveLength(2);
    const afterHundred = { ...anyPlan, bonusAfterPaidCents: 10000 };
    expect(commissionsFor(afterHundred, { totalPaidCents: 8991, bonusEarned: false }, { plan: "ship", cents: 999 })).toHaveLength(1);
    expect(commissionsFor(afterHundred, { totalPaidCents: 9990, bonusEarned: false }, { plan: "ship", cents: 999 })).toHaveLength(2);
  });
});

describe("balances", () => {
  const c = (amountCents: number, status: Commission["status"], availableAt: string): Commission => ({
    id: Math.random().toString(),
    referralId: "r",
    kind: "recurring",
    amountCents,
    paymentRef: "p",
    paymentCents: 0,
    status,
    availableAt,
    createdAt: availableAt,
  });
  it("splits earnings into pending, ready, paid, and leaves refunds out", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const b = balances([c(100, "pending", "2026-07-01T00:00:00Z"), c(200, "pending", "2026-06-01T00:00:00Z"), c(400, "paid", "2026-05-01T00:00:00Z"), c(800, "void", "2026-05-01T00:00:00Z")], now);
    expect(b).toEqual({ pendingCents: 100, availableCents: 200, paidCents: 400, lifetimeCents: 700 });
  });
});

describe("projectEarnings", () => {
  it("adds bonuses and a year of 5%", () => {
    const y = projectEarnings(DEFAULT_PROGRAM, { ship: 10, grow: 2 }, 12);
    expect(y.bonusCents).toBe(20000);
    expect(y.recurringCents).toBe(10 * 50 * 12 + 2 * 245 * 12);
  });
});

describe("codes and wording", () => {
  it("makes link-safe codes", () => {
    expect(normalizeCode("  Zoë's Closet!! ")).toBe("zoe-s-closet");
    expect(suggestCode("", "jane.doe@example.com")).toBe("jane-doe");
    expect(suggestCode("A")).toMatch(/^seller-/);
  });
  it("describes the bonus rule", () => {
    expect(bonusRule(DEFAULT_PROGRAM)).toBe("$100 when a seller you referred subscribes to the Grow or Flow plan, after their first payment.");
    expect(formatCents(245)).toBe("$2.45");
    expect(formatCents(10000)).toBe("$100");
  });
});

describe("sample history", () => {
  it("gives the demo a mix of paid, ready and pending earnings", () => {
    const h = sampleAffiliateHistory(DEFAULT_PROGRAM, Date.parse("2026-06-15T00:00:00Z"));
    const b = balances(h.commissions, new Date("2026-06-15T00:00:00Z"));
    expect(b.paidCents).toBeGreaterThan(0);
    expect(b.pendingCents).toBeGreaterThan(0);
    expect(h.payouts[0].amountCents).toBe(b.paidCents);
    expect(h.referrals.filter((r) => r.bonusEarned).length).toBe(3);
  });
});

describe("referral links", () => {
  beforeEach(() => clearReferral());
  it("remembers a valid ?ref= code until it expires", () => {
    const t = Date.parse("2026-06-01T00:00:00Z");
    expect(captureReferral("?ref=Jane-Doe", t)).toBe("jane-doe");
    expect(pendingReferral(t + 10 * 86400000)).toBe("jane-doe");
    expect(pendingReferral(t + 61 * 86400000)).toBeNull();
    expect(pendingReferral(t)).toBeNull();
  });
  it("ignores missing and malformed codes", () => {
    expect(captureReferral("?demo")).toBeNull();
    expect(captureReferral("?ref=<script>")).toBeNull();
    expect(pendingReferral()).toBeNull();
  });
});
