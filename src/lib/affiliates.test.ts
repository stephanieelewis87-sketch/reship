// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Commission } from "./affiliates";
import { DEFAULT_PROGRAM, balances, bonusRule, commissionsFor, formatCents, normalizeCode, projectEarnings, suggestCode } from "./affiliates";
import { sampleAffiliateHistory } from "./affiliateStore";
import { captureReferral, clearReferral, pendingReferral } from "./referralCapture";

const fresh = { totalPaidCents: 0, bonusEarned: false };

describe("commissionsFor", () => {
  it("pays 5% of every payment and a first-month bonus on the first payment", () => {
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "grow", cents: 6500 })).toEqual([
      { kind: "recurring", amountCents: 325 },
      { kind: "bonus", amountCents: 6500 },
    ]);
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "flow", cents: 9500 })[1]).toEqual({ kind: "bonus", amountCents: 9500 });
    // A bigger payment (say, a year up front) still earns at most the cap.
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "flow", cents: 95000 })[1]).toEqual({ kind: "bonus", amountCents: 9500 });
    expect(commissionsFor(DEFAULT_PROGRAM, { totalPaidCents: 6500, bonusEarned: true }, { plan: "grow", cents: 6500 })).toEqual([{ kind: "recurring", amountCents: 325 }]);
  });

  it("pays the bonus on any plan by default, Sell and Ship included", () => {
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "sell", cents: 1500 })).toEqual([
      { kind: "recurring", amountCents: 75 },
      { kind: "bonus", amountCents: 1500 },
    ]);
    expect(commissionsFor(DEFAULT_PROGRAM, fresh, { plan: "ship", cents: 2500 })).toEqual([
      { kind: "recurring", amountCents: 125 },
      { kind: "bonus", amountCents: 2500 },
    ]);
  });

  it("can pay a flat bonus instead", () => {
    const flat = { ...DEFAULT_PROGRAM, bonusCents: 10000, bonusMatchesPayment: false };
    expect(commissionsFor(flat, fresh, { plan: "ship", cents: 2500 })[1]).toEqual({ kind: "bonus", amountCents: 10000 });
  });

  it("can limit the bonus to some plans, or wait until the seller has paid enough", () => {
    const growFlow = { ...DEFAULT_PROGRAM, bonusPlans: ["grow", "flow"] } as typeof DEFAULT_PROGRAM;
    expect(commissionsFor(growFlow, fresh, { plan: "ship", cents: 2500 })).toEqual([{ kind: "recurring", amountCents: 125 }]);
    const anyPlan = DEFAULT_PROGRAM;
    const afterHundred = { ...anyPlan, bonusAfterPaidCents: 10000, bonusMatchesPayment: false };
    expect(commissionsFor(afterHundred, { totalPaidCents: 7400, bonusEarned: false }, { plan: "ship", cents: 2500 })).toHaveLength(1);
    expect(commissionsFor(afterHundred, { totalPaidCents: 7500, bonusEarned: false }, { plan: "ship", cents: 2500 })).toHaveLength(2);
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
    expect(y.bonusCents).toBe(10 * 1000 + 2 * 6500);
    expect(y.recurringCents).toBe(10 * 50 * 12 + 2 * 325 * 12);
  });
});

describe("codes and wording", () => {
  it("makes link-safe codes", () => {
    expect(normalizeCode("  Zoë's Closet!! ")).toBe("zoe-s-closet");
    expect(suggestCode("", "jane.doe@example.com")).toBe("jane-doe");
    expect(suggestCode("A")).toMatch(/^seller-/);
  });
  it("describes the bonus rule", () => {
    expect(bonusRule(DEFAULT_PROGRAM)).toBe("A one-time bonus equal to one month of the plan a seller you referred picks ($10 for Ship, $25 for Sell, $50 for Sync, $65 for Grow, $95 for Flow), after their first payment.");
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
    expect(h.referrals.filter((r) => r.bonusEarned).length).toBe(5);
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
