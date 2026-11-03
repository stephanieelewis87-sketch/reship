import type { Affiliate, AffiliateBalanceRow, AffiliateProgram, Commission, PayoutMethod, Payout, PlanId, Referral } from "./affiliates";
import { DEFAULT_PROGRAM, balances, commissionsFor } from "./affiliates";
import { supabase } from "./supabase";

// The affiliate program's data, behind the same two backends as the rest of the app.
export interface AffiliateApi {
  program(): Promise<AffiliateProgram>;
  me(): Promise<Affiliate | null>;
  join(details: { code: string; payoutMethod: PayoutMethod; payoutTo: string }): Promise<Affiliate>;
  update(details: { code: string; payoutMethod: PayoutMethod; payoutTo: string }): Promise<Affiliate>;
  referrals(): Promise<Referral[]>;
  commissions(): Promise<Commission[]>;
  payouts(): Promise<Payout[]>;
  // Credits the signed-in seller to the affiliate whose link they came from. True when it counted.
  claim(code: string): Promise<boolean>;
  recordClick(code: string): Promise<void>;
  admin: {
    balances(): Promise<AffiliateBalanceRow[]>;
    referrals(): Promise<(Referral & { affiliateCode: string })[]>;
    // Until billing is built, the owner records referred sellers' payments by hand.
    recordPayment(referral: Referral, plan: PlanId, cents: number): Promise<number>;
    payOut(affiliateId: string, method: string, reference: string): Promise<boolean>;
  };
}

export class CodeTakenError extends Error {
  constructor() {
    super("That code is taken. Try another.");
  }
}

// ---------- Demo mode: everything in this browser ----------

const KEY = "reship.affiliates.v1";
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString();

interface DemoState {
  affiliate: Affiliate | null;
  referrals: Referral[];
  commissions: Commission[];
  payouts: Payout[];
}

const empty = (): DemoState => ({ affiliate: null, referrals: [], commissions: [], payouts: [] });

// A few months of made-up referrals, so the dashboard has something to show after joining the demo.
export function sampleAffiliateHistory(program: AffiliateProgram, now = Date.now()): Omit<DemoState, "affiliate"> {
  const people: { label: string; plan?: PlanId; months: number; canceled?: boolean; joinedDaysAgo: number }[] = [
    { label: "ma•••@gmail.com", plan: "grow", months: 4, joinedDaysAgo: 125 },
    { label: "th•••@yahoo.com", plan: "ship", months: 3, joinedDaysAgo: 95 },
    { label: "ka•••@icloud.com", plan: "flow", months: 2, joinedDaysAgo: 64 },
    { label: "de•••@gmail.com", plan: "grow", months: 1, joinedDaysAgo: 20 },
    { label: "ro•••@outlook.com", plan: "ship", months: 2, canceled: true, joinedDaysAgo: 80 },
    { label: "li•••@gmail.com", joinedDaysAgo: 3, months: 0 },
  ];
  const referrals: Referral[] = [];
  const commissions: Commission[] = [];
  people.forEach((p, i) => {
    const ref: Referral = { id: `ref-${i}`, label: p.label, plan: p.plan, status: "signed_up", totalPaidCents: 0, bonusEarned: false, createdAt: iso(now - p.joinedDaysAgo * DAY) };
    for (let m = 0; m < p.months && p.plan; m++) {
      const paidAt = now - (p.joinedDaysAgo - 1 - m * 30) * DAY;
      const cents = { ship: 999, grow: 4900, flow: 10900 }[p.plan];
      for (const c of commissionsFor(program, ref, { plan: p.plan, cents })) {
        commissions.push({
          id: `com-${i}-${m}-${c.kind}`,
          referralId: ref.id,
          kind: c.kind,
          amountCents: c.amountCents,
          paymentRef: `demo-${i}-${m}`,
          paymentCents: cents,
          status: "pending",
          availableAt: iso(paidAt + program.holdDays * DAY),
          createdAt: iso(paidAt),
        });
        if (c.kind === "bonus") ref.bonusEarned = true;
      }
      ref.totalPaidCents += cents;
      ref.firstPaidAt ??= iso(paidAt);
      ref.status = "paying";
    }
    if (p.canceled) ref.status = "canceled";
    referrals.push(ref);
  });
  // Last month's payout covered everything that was ready more than 30 days ago.
  const cutoff = now - 30 * DAY;
  const paid = commissions.filter((c) => new Date(c.availableAt).getTime() <= cutoff);
  const payouts: Payout[] = [];
  if (paid.length) {
    const payout: Payout = { id: "payout-1", amountCents: paid.reduce((s, c) => s + c.amountCents, 0), method: "PayPal", reference: "Sample payout", createdAt: iso(cutoff) };
    payouts.push(payout);
    paid.forEach((c) => Object.assign(c, { status: "paid", paidAt: payout.createdAt }));
  }
  return { referrals, commissions, payouts };
}

export class LocalAffiliates implements AffiliateApi {
  private state: DemoState | null = null;

  private load(): DemoState {
    if (!this.state) {
      try {
        this.state = (JSON.parse(localStorage.getItem(KEY) ?? "null") as DemoState | null) ?? empty();
      } catch {
        this.state = empty();
      }
    }
    return this.state;
  }
  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage blocked; the demo keeps working in memory.
    }
  }
  reset() {
    this.state = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }

  program = async () => DEFAULT_PROGRAM;
  me = async () => this.load().affiliate;
  join = async (d: { code: string; payoutMethod: PayoutMethod; payoutTo: string }) => {
    const s = this.load();
    s.affiliate = { ...d, status: "active", clicks: 214, createdAt: iso(Date.now() - 130 * DAY) };
    Object.assign(s, sampleAffiliateHistory(DEFAULT_PROGRAM));
    this.save();
    return s.affiliate;
  };
  update = async (d: { code: string; payoutMethod: PayoutMethod; payoutTo: string }) => {
    const s = this.load();
    if (!s.affiliate) throw new Error("Join the program first.");
    s.affiliate = { ...s.affiliate, ...d };
    this.save();
    return s.affiliate;
  };
  referrals = async () => [...this.load().referrals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  commissions = async () => [...this.load().commissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  payouts = async () => [...this.load().payouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  claim = async () => false;
  recordClick = async () => undefined;

  admin: AffiliateApi["admin"] = {
    balances: async () => {
      const s = this.load();
      const own: AffiliateBalanceRow[] = s.affiliate
        ? [
            {
              affiliateId: "me",
              email: "you (demo)",
              code: s.affiliate.code,
              payoutMethod: s.affiliate.payoutMethod,
              payoutTo: s.affiliate.payoutTo,
              status: s.affiliate.status,
              clicks: s.affiliate.clicks,
              referrals: s.referrals.length,
              paying: s.referrals.filter((r) => r.status === "paying").length,
              ...balances(s.commissions),
            },
          ]
        : [];
      return own;
    },
    referrals: async () => {
      const s = this.load();
      return (await this.referrals()).map((r) => ({ ...r, affiliateCode: s.affiliate?.code ?? "" }));
    },
    recordPayment: async (referral, plan, cents) => {
      const s = this.load();
      const ref = s.referrals.find((r) => r.id === referral.id);
      if (!ref) return 0;
      const now = Date.now();
      const earned = commissionsFor(DEFAULT_PROGRAM, ref, { plan, cents });
      const paymentRef = `manual-${crypto.randomUUID()}`;
      for (const c of earned) {
        s.commissions.push({ id: crypto.randomUUID(), referralId: ref.id, kind: c.kind, amountCents: c.amountCents, paymentRef, paymentCents: cents, status: "pending", availableAt: iso(now + DEFAULT_PROGRAM.holdDays * DAY), createdAt: iso(now) });
        if (c.kind === "bonus") ref.bonusEarned = true;
      }
      Object.assign(ref, { plan, status: "paying", totalPaidCents: ref.totalPaidCents + cents, firstPaidAt: ref.firstPaidAt ?? iso(now) });
      this.save();
      return earned.reduce((t, c) => t + c.amountCents, 0);
    },
    payOut: async (_affiliateId, method, reference) => {
      const s = this.load();
      const now = Date.now();
      const ready = s.commissions.filter((c) => c.status === "pending" && new Date(c.availableAt).getTime() <= now);
      if (!ready.length) return false;
      const payout: Payout = { id: crypto.randomUUID(), amountCents: ready.reduce((t, c) => t + c.amountCents, 0), method, reference: reference || undefined, createdAt: iso(now) };
      s.payouts.push(payout);
      ready.forEach((c) => Object.assign(c, { status: "paid", paidAt: payout.createdAt }));
      this.save();
      return true;
    },
  };
}

// ---------- Supabase ----------

interface AffiliateRow {
  code: string;
  payout_method: PayoutMethod;
  payout_to: string | null;
  status: Affiliate["status"];
  clicks: number;
  created_at: string;
}
interface ReferralRow {
  id: string;
  affiliate_id: string;
  referred_user_id: string;
  referred_label: string;
  plan: PlanId | null;
  status: Referral["status"];
  total_paid_cents: number;
  bonus_earned: boolean;
  first_paid_at: string | null;
  created_at: string;
  affiliates?: { code: string } | null;
}
interface CommissionRow {
  id: string;
  referral_id: string;
  kind: Commission["kind"];
  amount_cents: number;
  payment_ref: string;
  payment_cents: number;
  status: Commission["status"];
  available_at: string;
  paid_at: string | null;
  created_at: string;
}

const fromAffiliate = (r: AffiliateRow): Affiliate => ({ code: r.code, payoutMethod: r.payout_method, payoutTo: r.payout_to ?? "", status: r.status, clicks: r.clicks, createdAt: r.created_at });
const fromReferral = (r: ReferralRow): Referral => ({
  id: r.id,
  referredUserId: r.referred_user_id,
  affiliateId: r.affiliate_id,
  label: r.referred_label,
  plan: r.plan ?? undefined,
  status: r.status,
  totalPaidCents: r.total_paid_cents,
  bonusEarned: r.bonus_earned,
  firstPaidAt: r.first_paid_at ?? undefined,
  createdAt: r.created_at,
});

// The live terms from the affiliate_program table; anyone can read them, signed in or not.
export async function loadProgram(): Promise<AffiliateProgram> {
  if (!supabase) return DEFAULT_PROGRAM;
  const { data, error } = await supabase.from("affiliate_program").select("*").maybeSingle();
  if (error || !data) return DEFAULT_PROGRAM;
  return {
    bonusCents: data.bonus_cents,
    bonusMatchesPayment: data.bonus_matches_payment ?? false,
    rate: Number(data.rate),
    holdDays: data.hold_days,
    bonusPlans: data.bonus_plans,
    bonusAfterPaidCents: data.bonus_after_paid_cents,
    cookieDays: data.cookie_days,
    minPayoutCents: data.min_payout_cents,
  };
}

export class SupabaseAffiliates implements AffiliateApi {
  constructor(private userId: string) {}
  private get db() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  program = loadProgram;
  async me() {
    const { data, error } = await this.db.from("affiliates").select("*").eq("user_id", this.userId).maybeSingle();
    if (error) throw error;
    return data ? fromAffiliate(data as AffiliateRow) : null;
  }
  async join(d: { code: string; payoutMethod: PayoutMethod; payoutTo: string }) {
    const { data, error } = await this.db
      .from("affiliates")
      .insert({ user_id: this.userId, code: d.code, payout_method: d.payoutMethod, payout_to: d.payoutTo || null })
      .select()
      .single();
    if (error) throw error.code === "23505" ? new CodeTakenError() : error;
    return fromAffiliate(data as AffiliateRow);
  }
  async update(d: { code: string; payoutMethod: PayoutMethod; payoutTo: string }) {
    const { data, error } = await this.db
      .from("affiliates")
      .update({ code: d.code, payout_method: d.payoutMethod, payout_to: d.payoutTo || null })
      .eq("user_id", this.userId)
      .select()
      .single();
    if (error) throw error.code === "23505" ? new CodeTakenError() : error;
    return fromAffiliate(data as AffiliateRow);
  }
  async referrals() {
    const { data, error } = await this.db.from("referrals").select("*").eq("affiliate_id", this.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data as ReferralRow[]).map((r) => ({ ...fromReferral(r), referredUserId: undefined }));
  }
  async commissions() {
    const { data, error } = await this.db.from("affiliate_commissions").select("*").eq("affiliate_id", this.userId).order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return (data as CommissionRow[]).map(
      (r): Commission => ({
        id: r.id,
        referralId: r.referral_id,
        kind: r.kind,
        amountCents: r.amount_cents,
        paymentRef: r.payment_ref,
        paymentCents: r.payment_cents,
        status: r.status,
        availableAt: r.available_at,
        paidAt: r.paid_at ?? undefined,
        createdAt: r.created_at,
      }),
    );
  }
  async payouts() {
    const { data, error } = await this.db.from("affiliate_payouts").select("*").eq("affiliate_id", this.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data as { id: string; amount_cents: number; method: string; reference: string | null; created_at: string }[]).map(
      (r): Payout => ({ id: r.id, amountCents: r.amount_cents, method: r.method, reference: r.reference ?? undefined, createdAt: r.created_at }),
    );
  }
  async claim(code: string) {
    const { data, error } = await this.db.rpc("claim_referral", { p_code: code });
    if (error) throw error;
    return !!data;
  }
  async recordClick(code: string) {
    await this.db.rpc("record_referral_click", { p_code: code });
  }

  admin: AffiliateApi["admin"] = {
    balances: async () => {
      const { data, error } = await this.db.rpc("admin_affiliate_balances");
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(
        (r): AffiliateBalanceRow => ({
          affiliateId: r.affiliate_id as string,
          email: (r.email as string) ?? "",
          code: r.code as string,
          payoutMethod: r.payout_method as PayoutMethod,
          payoutTo: (r.payout_to as string) ?? "",
          status: r.status as Affiliate["status"],
          clicks: Number(r.clicks),
          referrals: Number(r.referrals),
          paying: Number(r.paying),
          pendingCents: Number(r.pending_cents),
          availableCents: Number(r.available_cents),
          paidCents: Number(r.paid_cents),
        }),
      );
    },
    referrals: async () => {
      const { data, error } = await this.db.from("referrals").select("*, affiliates(code)").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as ReferralRow[]).map((r) => ({ ...fromReferral(r), affiliateCode: r.affiliates?.code ?? "" }));
    },
    recordPayment: async (referral, plan, cents) => {
      const { data, error } = await this.db.rpc("record_subscription_payment", {
        p_user: referral.referredUserId,
        p_plan: plan,
        p_amount_cents: cents,
        p_payment_ref: `manual-${crypto.randomUUID()}`,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    payOut: async (affiliateId, method, reference) => {
      const { data, error } = await this.db.rpc("admin_record_payout", { p_affiliate: affiliateId, p_method: method, p_reference: reference });
      if (error) throw error;
      return !!data;
    },
  };
}
