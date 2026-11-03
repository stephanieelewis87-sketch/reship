// The affiliate program: types, the terms, and the money math. The database does the same math in
// record_subscription_payment (supabase/migrations/0009_affiliates.sql); demo mode and the screens use this.

export type PlanId = "ship" | "grow" | "flow";
export const PLANS: Record<PlanId, { name: string; cents: number }> = {
  ship: { name: "Ship", cents: 999 },
  grow: { name: "Grow", cents: 4900 },
  flow: { name: "Flow", cents: 10900 },
};
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export interface AffiliateProgram {
  bonusCents: number;
  rate: number;
  holdDays: number;
  bonusPlans: PlanId[];
  bonusAfterPaidCents: number;
  cookieDays: number;
  minPayoutCents: number;
}

// Matches the defaults in 0009_affiliates.sql; the live terms come from the affiliate_program table.
export const DEFAULT_PROGRAM: AffiliateProgram = {
  bonusCents: 10000,
  rate: 0.05,
  holdDays: 30,
  bonusPlans: ["grow", "flow"],
  bonusAfterPaidCents: 0,
  cookieDays: 60,
  minPayoutCents: 2500,
};

export type PayoutMethod = "paypal" | "venmo" | "cashapp" | "bank" | "other";
export const PAYOUT_METHODS: { id: PayoutMethod; label: string; placeholder: string }[] = [
  { id: "paypal", label: "PayPal", placeholder: "PayPal email" },
  { id: "venmo", label: "Venmo", placeholder: "@your-venmo" },
  { id: "cashapp", label: "Cash App", placeholder: "$cashtag" },
  { id: "bank", label: "Bank transfer", placeholder: "We'll email you for bank details" },
  { id: "other", label: "Other", placeholder: "How you'd like to be paid" },
];

export interface Affiliate {
  code: string;
  payoutMethod: PayoutMethod;
  payoutTo: string;
  status: "active" | "paused" | "banned";
  clicks: number;
  createdAt: string;
}

export interface Referral {
  id: string;
  referredUserId?: string; // only for admins
  label: string;
  plan?: PlanId;
  status: "signed_up" | "paying" | "canceled";
  totalPaidCents: number;
  bonusEarned: boolean;
  firstPaidAt?: string;
  createdAt: string;
  affiliateId?: string;
}

export interface Commission {
  id: string;
  referralId: string;
  kind: "bonus" | "recurring";
  amountCents: number;
  paymentRef: string;
  paymentCents: number;
  status: "pending" | "paid" | "void";
  availableAt: string;
  paidAt?: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  amountCents: number;
  method: string;
  reference?: string;
  createdAt: string;
}

export interface AffiliateBalanceRow {
  affiliateId: string;
  email: string;
  code: string;
  payoutMethod: PayoutMethod;
  payoutTo: string;
  status: Affiliate["status"];
  clicks: number;
  referrals: number;
  paying: number;
  pendingCents: number;
  availableCents: number;
  paidCents: number;
}

export const formatCents = (cents: number, exact = false) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: exact || cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

export const ratePercent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

// Codes are short, lowercase and safe in a link: letters, numbers and dashes, 3 to 24 long.
export const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{2,23}$/;
export function normalizeCode(raw: string) {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}
export function suggestCode(name: string, email?: string | null) {
  const base = normalizeCode(name) || normalizeCode((email ?? "").split("@")[0]);
  return base.length >= 3 ? base : `seller-${Math.random().toString(36).slice(2, 7)}`;
}

export const referralLink = (code: string, origin = window.location.origin) => `${origin}/?ref=${encodeURIComponent(code)}`;

// What one subscription payment earns the affiliate, given what the referral had already paid.
export function commissionsFor(
  program: AffiliateProgram,
  referral: Pick<Referral, "totalPaidCents" | "bonusEarned">,
  payment: { plan: PlanId; cents: number },
): { kind: Commission["kind"]; amountCents: number }[] {
  const out: { kind: Commission["kind"]; amountCents: number }[] = [{ kind: "recurring", amountCents: Math.round(payment.cents * program.rate) }];
  const paidAfter = referral.totalPaidCents + payment.cents;
  if (!referral.bonusEarned && program.bonusCents > 0 && program.bonusPlans.includes(payment.plan) && paidAfter >= program.bonusAfterPaidCents) {
    out.push({ kind: "bonus", amountCents: program.bonusCents });
  }
  return out;
}

// Pending: earned, still in the refund hold. Available: ready to be paid. Paid: already sent.
export function balances(commissions: Commission[], now = new Date()) {
  const t = now.getTime();
  const sum = (f: (c: Commission) => boolean) => commissions.filter(f).reduce((s, c) => s + c.amountCents, 0);
  const live = (c: Commission) => c.status === "pending";
  return {
    pendingCents: sum((c) => live(c) && new Date(c.availableAt).getTime() > t),
    availableCents: sum((c) => live(c) && new Date(c.availableAt).getTime() <= t),
    paidCents: sum((c) => c.status === "paid"),
    lifetimeCents: sum((c) => c.status !== "void"),
  };
}

// What an affiliate would earn over `months` with these referrals per plan, for the calculator.
export function projectEarnings(program: AffiliateProgram, referrals: Partial<Record<PlanId, number>>, months = 12) {
  let bonus = 0;
  let recurring = 0;
  for (const plan of PLAN_IDS) {
    const n = referrals[plan] ?? 0;
    if (!n) continue;
    const price = PLANS[plan].cents;
    recurring += n * Math.round(price * program.rate) * months;
    if (program.bonusCents > 0 && program.bonusPlans.includes(plan) && price * months >= program.bonusAfterPaidCents) bonus += n * program.bonusCents;
  }
  return { bonusCents: bonus, recurringCents: recurring, totalCents: bonus + recurring };
}

// A sentence for the bonus rule, shown in the terms.
export function bonusRule(program: AffiliateProgram) {
  const plans = program.bonusPlans.map((p) => PLANS[p].name);
  const which = plans.length === PLAN_IDS.length ? "any plan" : plans.length ? `the ${plans.join(" or ")} plan` : "";
  if (!which || program.bonusCents <= 0) return "";
  const after = program.bonusAfterPaidCents > 0 ? `once they've paid ${formatCents(program.bonusAfterPaidCents)} in total` : "after their first payment";
  return `${formatCents(program.bonusCents)} when a seller you referred subscribes to ${which}, ${after}.`;
}
