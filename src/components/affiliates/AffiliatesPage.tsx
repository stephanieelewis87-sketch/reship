import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Gift, Share2 } from "lucide-react";
import type { Affiliate, AffiliateBalanceRow, AffiliateProgram, Commission, PayoutMethod, Payout, PlanId, Referral } from "@/lib/affiliates";
import { CODE_PATTERN, DEFAULT_PROGRAM, PAYOUT_METHODS, PLANS, PLAN_IDS, balances, bonusHeadline, bonusRule, formatCents, normalizeCode, ratePercent, referralLink, suggestCode } from "@/lib/affiliates";
import type { useReshipData } from "@/lib/useReshipData";
import { Card, Kpi } from "../analytics/parts";
import { PageHeader } from "../shell/PageHeader";
import { Field, Modal, ModalHeader, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";
import { EarningsCalculator, HowItWorks, ProgramHero, ProgramTerms } from "./ProgramPitch";

type Data = ReturnType<typeof useReshipData>;
type Tab = "overview" | "referrals" | "earnings" | "payout" | "admin";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const STATUS_LABEL: Record<Referral["status"], { text: string; tone: string }> = {
  signed_up: { text: "Signed up", tone: "bg-muted text-muted-foreground" },
  paying: { text: "Paying", tone: "bg-emerald-50 text-emerald-800" },
  canceled: { text: "Canceled", tone: "bg-rose-50 text-rose-800" },
};

export function AffiliatesPage({ data, email, tab: initialTab }: { data: Data; email: string | null; tab?: string | null }) {
  const api = data.store.affiliates;
  const [program, setProgram] = useState<AffiliateProgram>(DEFAULT_PROGRAM);
  const [me, setMe] = useState<Affiliate | null | undefined>(undefined);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>((["overview", "referrals", "earnings", "payout", "admin"] as Tab[]).includes(initialTab as Tab) ? (initialTab as Tab) : "overview");

  const load = useCallback(async () => {
    try {
      const [p, mine, isAdmin] = await Promise.all([api.program(), api.me(), data.store.isFeedbackAdmin()]);
      setProgram(p);
      setMe(mine);
      setAdmin(isAdmin);
      if (mine) {
        const [r, c, po] = await Promise.all([api.referrals(), api.commissions(), api.payouts()]);
        setReferrals(r);
        setCommissions(c);
        setPayouts(po);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMe((m) => m ?? null);
    }
  }, [api, data.store]);
  useEffect(() => {
    load();
  }, [load]);

  const tabs: { key: Tab; label: string }[] = me
    ? [
        { key: "overview", label: "Overview" },
        { key: "referrals", label: `Referrals (${referrals.length})` },
        { key: "earnings", label: "Earnings and payouts" },
        { key: "payout", label: "Link and payout details" },
      ]
    : [];
  if (admin) tabs.push({ key: "admin", label: "Pay affiliates" });
  const shown: Tab = tabs.some((t) => t.key === tab) ? tab : me ? "overview" : admin && tab === "admin" ? "admin" : "overview";

  return (
    <div>
      <PageHeader title="Affiliates" subtitle={`Earn ${bonusHeadline(program)}, then ${ratePercent(program.rate)} of what they pay, for life`}>
        <a href="/?affiliates" target="_blank" rel="noreferrer" className={secondaryButton}>
          <ExternalLink className="w-4 h-4" /> Program page
        </a>
      </PageHeader>
      {tabs.length > 1 && (
        <div className="px-4 md:px-8 border-b border-border flex gap-5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={shown === t.key ? "page" : undefined}
              className={`py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${shown === t.key ? "border-accent text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="px-4 md:px-8 py-5 space-y-4 max-w-6xl">
        {error && <p className="text-xs rounded-lg border border-rose-200 bg-rose-50 text-rose-900 px-3 py-2">Couldn't load the affiliate program: {error}</p>}
        {me === undefined && !error && <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>}
        {me === null && shown !== "admin" && <JoinProgram data={data} email={email} program={program} onJoined={load} />}
        {me && shown === "overview" && <Overview me={me} program={program} referrals={referrals} commissions={commissions} payouts={payouts} onTab={setTab} />}
        {me && shown === "referrals" && <Referrals referrals={referrals} commissions={commissions} program={program} />}
        {me && shown === "earnings" && <Earnings commissions={commissions} payouts={payouts} referrals={referrals} program={program} />}
        {me && shown === "payout" && <PayoutDetails data={data} me={me} onSaved={setMe} />}
        {admin && shown === "admin" && <AdminPayouts data={data} program={program} onChanged={load} />}
      </div>
    </div>
  );
}

function JoinProgram({ data, email, program, onJoined }: { data: Data; email: string | null; program: AffiliateProgram; onJoined: () => void }) {
  const [code, setCode] = useState(() => suggestCode(data.settings.displayName, email));
  const [method, setMethod] = useState<PayoutMethod>("paypal");
  const [payTo, setPayTo] = useState(email ?? "");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = CODE_PATTERN.test(code);
  const join = async () => {
    setBusy(true);
    setMessage("");
    try {
      await data.store.affiliates.join({ code, payoutMethod: method, payoutTo: payTo.trim() });
      onJoined();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ProgramHero program={program} />
      <div className="grid lg:grid-cols-5 gap-4">
        <form
          className="lg:col-span-2 bg-card border border-border rounded-xl p-4 md:p-5 space-y-3 self-start"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && agreed) join();
          }}
        >
          <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <Gift className="w-4 h-4 text-accent" /> Join the program
          </h2>
          <Field label="Your referral code">
            <input className={inputClass} value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} aria-invalid={!valid} />
          </Field>
          <p className="text-[11px] text-muted-foreground -mt-1 break-all">
            Your link: <span className="font-mono text-foreground">{valid ? referralLink(code) : "3 to 24 letters, numbers or dashes"}</span>
          </p>
          <PayoutFields method={method} payTo={payTo} onMethod={setMethod} onPayTo={setPayTo} />
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span>I agree to the program terms below.</span>
          </label>
          {message && <p className="text-xs text-rose-700">{message}</p>}
          <button type="submit" className={`${primaryButton} w-full`} disabled={!valid || !agreed || busy}>
            {busy ? "Joining…" : "Get my link"}
          </button>
        </form>
        <div className="lg:col-span-3 space-y-4">
          <EarningsCalculator program={program} />
          <ProgramTerms program={program} />
        </div>
      </div>
      <HowItWorks program={program} />
    </>
  );
}

function PayoutFields({ method, payTo, onMethod, onPayTo }: { method: PayoutMethod; payTo: string; onMethod: (m: PayoutMethod) => void; onPayTo: (v: string) => void }) {
  const m = PAYOUT_METHODS.find((x) => x.id === method)!;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
      <Field label="Get paid by">
        <select className={`${selectClass} text-sm py-1.5`} value={method} onChange={(e) => onMethod(e.target.value as PayoutMethod)}>
          {PAYOUT_METHODS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Send it to">
        <input className={inputClass} value={payTo} placeholder={m.placeholder} onChange={(e) => onPayTo(e.target.value)} maxLength={200} />
      </Field>
    </div>
  );
}

function CopyLink({ code }: { code: string }) {
  const link = referralLink(code);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy your link", link);
    }
  };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground truncate">{link}</div>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={primaryButton}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => navigator.share({ title: "SellSync", text: "I ship all my sales from one place with SellSync. Try it with my link:", url: link }).catch(() => undefined)}
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
        )}
      </div>
    </div>
  );
}

function Overview({
  me,
  program,
  referrals,
  commissions,
  payouts,
  onTab,
}: {
  me: Affiliate;
  program: AffiliateProgram;
  referrals: Referral[];
  commissions: Commission[];
  payouts: Payout[];
  onTab: (t: Tab) => void;
}) {
  const b = balances(commissions);
  const paying = referrals.filter((r) => r.status === "paying");
  const monthly = paying.reduce((s, r) => s + Math.round((r.plan ? PLANS[r.plan].cents : 0) * program.rate), 0);
  const conversion = me.clicks ? Math.round((referrals.length / me.clicks) * 1000) / 10 : 0;
  const nextReady = commissions
    .filter((c) => c.status === "pending" && new Date(c.availableAt) > new Date())
    .sort((a, c) => a.availableAt.localeCompare(c.availableAt))[0];
  return (
    <>
      {me.status !== "active" && (
        <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
          Your affiliate account is {me.status}. New referrals and earnings are on hold. Send us feedback if you think this is a mistake.
        </p>
      )}
      <Card title="Your referral link" subtitle={`Code ${me.code}. Sellers who sign up within ${program.cookieDays} days of using it are credited to you.`}>
        <CopyLink code={me.code} />
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Ready to pay" value={formatCents(b.availableCents, true)} hint={b.availableCents >= program.minPayoutCents ? "In the next payout" : `Paid from ${formatCents(program.minPayoutCents)}`} />
        <Kpi label="Pending" value={formatCents(b.pendingCents, true)} hint={nextReady ? `Next ready ${day(nextReady.availableAt)}` : `${program.holdDays}-day refund hold`} />
        <Kpi label="Paid to you" value={formatCents(b.paidCents, true)} hint={payouts[0] ? `Last on ${day(payouts[0].createdAt)}` : "No payouts yet"} />
        <Kpi label="Monthly, for life" value={formatCents(monthly, true)} hint={`${ratePercent(program.rate)} of ${paying.length} paying seller${paying.length === 1 ? "" : "s"}`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Link visits" value={me.clicks.toLocaleString()} />
        <Kpi label="Sign-ups" value={referrals.length.toLocaleString()} hint={me.clicks ? `${conversion}% of visits` : undefined} onClick={() => onTab("referrals")} />
        <Kpi label="Paying" value={paying.length.toLocaleString()} hint={referrals.length ? `${Math.round((paying.length / referrals.length) * 100)}% of sign-ups` : undefined} onClick={() => onTab("referrals")} />
      </div>
      <Card title="Recent earnings" right={<button type="button" className="text-xs text-accent hover:underline" onClick={() => onTab("earnings")}>See all</button>}>
        <CommissionList commissions={commissions.slice(0, 6)} referrals={referrals} empty="Nothing yet. You earn when a seller you referred pays for a plan." />
      </Card>
    </>
  );
}

function StatusPill({ c }: { c: Commission }) {
  if (c.status === "paid") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">Paid</span>;
  if (c.status === "void") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-800">Refunded</span>;
  if (new Date(c.availableAt) <= new Date()) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">Ready</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">Ready {day(c.availableAt)}</span>;
}

function CommissionList({ commissions, referrals, empty }: { commissions: Commission[]; referrals: Referral[]; empty: string }) {
  const who = useMemo(() => new Map(referrals.map((r) => [r.id, r])), [referrals]);
  if (!commissions.length) return <p className="text-xs text-muted-foreground py-4 text-center">{empty}</p>;
  return (
    <div className="divide-y divide-border">
      {commissions.map((c) => {
        const r = who.get(c.referralId);
        return (
          <div key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="text-foreground truncate">
                {c.kind === "bonus" ? "Sign-up bonus" : `${r?.plan ? PLANS[r.plan].name : "Plan"} payment of ${formatCents(c.paymentCents, true)}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {r?.label ?? "A seller"} · {day(c.createdAt)}
              </p>
            </div>
            <StatusPill c={c} />
            <span className={`font-mono tabular-nums w-20 text-right ${c.status === "void" ? "line-through text-muted-foreground" : "text-foreground"}`}>{formatCents(c.amountCents, true)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Referrals({ referrals, commissions, program }: { referrals: Referral[]; commissions: Commission[]; program: AffiliateProgram }) {
  const earned = (id: string) => commissions.filter((c) => c.referralId === id && c.status !== "void").reduce((s, c) => s + c.amountCents, 0);
  if (!referrals.length)
    return (
      <Card>
        <p className="text-sm text-muted-foreground text-center py-8">No sign-ups yet. Share your link, and sellers who sign up with it show here.</p>
      </Card>
    );
  return (
    <Card title="Sellers you referred" subtitle={`We show part of each email to protect their privacy. Bonus: ${bonusRule(program)}`}>
      <div className="overflow-x-auto -mx-4 md:-mx-5">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="font-medium px-4 md:px-5 py-2">Seller</th>
              <th className="font-medium py-2">Signed up</th>
              <th className="font-medium py-2">Plan</th>
              <th className="font-medium py-2">Status</th>
              <th className="font-medium py-2">Bonus</th>
              <th className="font-medium py-2 text-right px-4 md:px-5">You've earned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {referrals.map((r) => (
              <tr key={r.id}>
                <td className="px-4 md:px-5 py-2.5 text-foreground">{r.label}</td>
                <td className="py-2.5 text-muted-foreground whitespace-nowrap">{day(r.createdAt)}</td>
                <td className="py-2.5 text-foreground">{r.plan ? PLANS[r.plan].name : <span className="text-muted-foreground">None yet</span>}</td>
                <td className="py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[r.status].tone}`}>{STATUS_LABEL[r.status].text}</span>
                </td>
                <td className="py-2.5 text-xs">{r.bonusEarned ? <span className="text-emerald-700">Earned</span> : <span className="text-muted-foreground">Not yet</span>}</td>
                <td className="py-2.5 px-4 md:px-5 text-right font-mono tabular-nums text-foreground">{formatCents(earned(r.id), true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Earnings({ commissions, payouts, referrals, program }: { commissions: Commission[]; payouts: Payout[]; referrals: Referral[]; program: AffiliateProgram }) {
  const b = balances(commissions);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2" title="Every earning" subtitle={`Each payment is held ${program.holdDays} days in case it's refunded, then it's ready to pay.`}>
        <CommissionList commissions={commissions} referrals={referrals} empty="Nothing yet." />
      </Card>
      <div className="space-y-4">
        <Card title="Lifetime">
          <p className="font-display text-3xl font-semibold text-foreground">{formatCents(b.lifetimeCents, true)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCents(b.paidCents, true)} paid, {formatCents(b.availableCents, true)} ready, {formatCents(b.pendingCents, true)} pending.
          </p>
        </Card>
        <Card title="Payouts" subtitle={`Sent monthly once at least ${formatCents(program.minPayoutCents)} is ready.`}>
          {payouts.length ? (
            <div className="divide-y divide-border">
              {payouts.map((p) => (
                <div key={p.id} className="py-2 flex justify-between text-sm gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground">{day(p.createdAt)}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums">{formatCents(p.amountCents, true)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No payouts yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function PayoutDetails({ data, me, onSaved }: { data: Data; me: Affiliate; onSaved: (a: Affiliate) => void }) {
  const [code, setCode] = useState(me.code);
  const [method, setMethod] = useState(me.payoutMethod);
  const [payTo, setPayTo] = useState(me.payoutTo);
  const [state, setState] = useState<{ busy?: boolean; text?: string; ok?: boolean }>({});
  const valid = CODE_PATTERN.test(code);
  const dirty = code !== me.code || method !== me.payoutMethod || payTo !== me.payoutTo;
  const save = async () => {
    setState({ busy: true });
    try {
      onSaved(await data.store.affiliates.update({ code, payoutMethod: method, payoutTo: payTo.trim() }));
      setState({ ok: true, text: "Saved." });
    } catch (e) {
      setState({ text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Card title="Link and payout details" className="max-w-xl">
      <div className="space-y-3">
        <Field label="Referral code">
          <input className={inputClass} value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} />
        </Field>
        {code !== me.code && <p className="text-[11px] text-amber-800 -mt-1">Links you've already shared with the old code stop working when you change it.</p>}
        <PayoutFields method={method} payTo={payTo} onMethod={setMethod} onPayTo={setPayTo} />
        {state.text && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.text}</p>}
        <button type="button" className={primaryButton} disabled={!valid || !dirty || state.busy} onClick={save}>
          Save
        </button>
      </div>
    </Card>
  );
}

// For the app owner: who's owed what, mark payouts as sent, and record payments until billing is built.
function AdminPayouts({ data, program, onChanged }: { data: Data; program: AffiliateProgram; onChanged: () => void }) {
  const api = data.store.affiliates.admin;
  const [rows, setRows] = useState<AffiliateBalanceRow[]>([]);
  const [refs, setRefs] = useState<(Referral & { affiliateCode: string })[]>([]);
  const [paying, setPaying] = useState<AffiliateBalanceRow | null>(null);
  const [recording, setRecording] = useState<Referral | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([api.balances(), api.referrals()]);
      setRows(b);
      setRefs(r);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);
  const refresh = () => {
    load();
    onChanged();
  };
  const owed = rows.reduce((s, r) => s + r.availableCents, 0);
  return (
    <>
      {message && <p className="text-xs rounded-lg border border-border bg-muted px-3 py-2">{message}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Affiliates" value={rows.length.toLocaleString()} />
        <Kpi label="Referred sellers" value={refs.length.toLocaleString()} hint={`${refs.filter((r) => r.status === "paying").length} paying`} />
        <Kpi label="Ready to pay out" value={formatCents(owed, true)} />
        <Kpi label="Paid out so far" value={formatCents(rows.reduce((s, r) => s + r.paidCents, 0), true)} />
      </div>
      <Card title="Affiliates" subtitle={`Send each affiliate their ready balance (from ${formatCents(program.minPayoutCents)}), then mark it paid here.`}>
        <div className="overflow-x-auto -mx-4 md:-mx-5">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="font-medium px-4 md:px-5 py-2">Affiliate</th>
                <th className="font-medium py-2">Pay to</th>
                <th className="font-medium py-2 text-right">Visits</th>
                <th className="font-medium py-2 text-right">Referred</th>
                <th className="font-medium py-2 text-right">Pending</th>
                <th className="font-medium py-2 text-right">Ready</th>
                <th className="font-medium py-2 text-right">Paid</th>
                <th className="px-4 md:px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.affiliateId}>
                  <td className="px-4 md:px-5 py-2.5">
                    <p className="text-foreground">{r.email}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {r.code}
                      {r.status !== "active" ? ` · ${r.status}` : ""}
                    </p>
                  </td>
                  <td className="py-2.5 text-xs">
                    <p className="text-foreground">{PAYOUT_METHODS.find((m) => m.id === r.payoutMethod)?.label}</p>
                    <p className="text-muted-foreground truncate max-w-40">{r.payoutTo || "Not set"}</p>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{r.clicks}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {r.referrals} <span className="text-muted-foreground text-xs">({r.paying} paying)</span>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatCents(r.pendingCents, true)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-foreground">{formatCents(r.availableCents, true)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatCents(r.paidCents, true)}</td>
                  <td className="px-4 md:px-5 py-2.5 text-right">
                    <button type="button" className="text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline" disabled={r.availableCents <= 0} onClick={() => setPaying(r)}>
                      Mark paid
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                    No affiliates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Referred sellers" subtitle="Billing isn't connected yet, so record a referred seller's subscription payment here to credit their affiliate.">
        <div className="divide-y divide-border">
          {refs.map((r) => (
            <div key={r.id} className="py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-foreground truncate">{r.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  via <span className="font-mono">{r.affiliateCode}</span> · {r.plan ? PLANS[r.plan].name : "No plan"} · paid {formatCents(r.totalPaidCents, true)}
                </p>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[r.status].tone}`}>{STATUS_LABEL[r.status].text}</span>
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setRecording(r)}>
                Record payment
              </button>
            </div>
          ))}
          {!refs.length && <p className="text-center text-xs text-muted-foreground py-6">No referred sellers yet.</p>}
        </div>
      </Card>
      {paying && (
        <MarkPaid
          row={paying}
          onClose={() => setPaying(null)}
          onDone={async (method, reference) => {
            await api.payOut(paying.affiliateId, method, reference);
            setPaying(null);
            setMessage(`Marked ${formatCents(paying.availableCents, true)} as paid to ${paying.email}.`);
            refresh();
          }}
        />
      )}
      {recording && (
        <RecordPayment
          referral={recording}
          onClose={() => setRecording(null)}
          onDone={async (plan, cents) => {
            const earned = await api.recordPayment(recording, plan, cents);
            setRecording(null);
            setMessage(`Recorded ${formatCents(cents, true)}. The affiliate earned ${formatCents(earned, true)}.`);
            refresh();
          }}
        />
      )}
    </>
  );
}

function MarkPaid({ row, onClose, onDone }: { row: AffiliateBalanceRow; onClose: () => void; onDone: (method: string, reference: string) => Promise<void> }) {
  const [method, setMethod] = useState(PAYOUT_METHODS.find((m) => m.id === row.payoutMethod)?.label ?? "PayPal");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal onClose={onClose} label="Mark paid">
      <ModalHeader title={`Pay ${formatCents(row.availableCents, true)} to ${row.email}`} subtitle={`${method}: ${row.payoutTo || "no payout address set"}`} onClose={onClose} />
      <form
        className="p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onDone(method, reference);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <p className="text-xs text-muted-foreground">Send the money first, then mark it paid. Everything that's ready is included.</p>
        <Field label="Sent by">
          <input className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
        <Field label="Transaction id or note (optional)">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Mark paid
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPayment({ referral, onClose, onDone }: { referral: Referral; onClose: () => void; onDone: (plan: PlanId, cents: number) => Promise<void> }) {
  const [plan, setPlan] = useState<PlanId>(referral.plan ?? "grow");
  const [amount, setAmount] = useState((PLANS[referral.plan ?? "grow"].cents / 100).toFixed(2));
  const [error, setError] = useState("");
  const cents = Math.round(Number(amount) * 100);
  return (
    <Modal onClose={onClose} label="Record payment">
      <ModalHeader title={`Record a payment from ${referral.label}`} onClose={onClose} />
      <form
        className="p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onDone(plan, cents);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan">
            <select
              className={`${selectClass} w-full text-sm py-1.5`}
              value={plan}
              onChange={(e) => {
                const p = e.target.value as PlanId;
                setPlan(p);
                setAmount((PLANS[p].cents / 100).toFixed(2));
              }}
            >
              {PLAN_IDS.map((p) => (
                <option key={p} value={p}>
                  {PLANS[p].name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount paid ($)">
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={!(cents > 0)}>
            Record
          </button>
        </div>
      </form>
    </Modal>
  );
}
