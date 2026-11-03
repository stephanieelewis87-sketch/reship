import { useState } from "react";
import { BadgeDollarSign, Link2, Repeat, Users } from "lucide-react";
import type { AffiliateProgram, PlanId } from "@/lib/affiliates";
import { PLANS, PLAN_IDS, bonusHeadline, bonusRule, formatCents, projectEarnings, ratePercent } from "@/lib/affiliates";

// What the affiliate program pays and how it works. Shown on the public program page and to
// sellers who haven't joined yet.
export function ProgramHero({ program, children }: { program: AffiliateProgram; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border text-foreground px-5 py-8 md:px-10 md:py-12 overflow-hidden relative">
      <div aria-hidden className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-accent/25 blur-3xl" />
      <div className="relative max-w-xl">
        <p className="font-mono text-[12px] uppercase tracking-widest text-accent">SellSync affiliate program</p>
        <h1 className="font-serif text-3xl md:text-[44px] font-medium tracking-tight mt-2 leading-tight">
          Earn {bonusHeadline(program)}, then {ratePercent(program.rate)} for life.
        </h1>
        <p className="text-sm text-muted-foreground mt-3">
          Share your link with the resellers you know. When they subscribe, you get a one-time bonus{program.bonusMatchesPayment ? " equal to their first month" : ""}, plus {ratePercent(program.rate)} of every payment they make for as long as
          they stay with SellSync.
        </p>
        {children && <div className="mt-6 flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}

export function HowItWorks({ program }: { program: AffiliateProgram }) {
  const steps = [
    { icon: Link2, title: "Share your link", text: "Join free and get a personal link and code. Post it in your closet, groups, videos or bio." },
    { icon: Users, title: "Sellers sign up", text: `Anyone who signs up within ${program.cookieDays} days of using your link is yours, for good.` },
    { icon: BadgeDollarSign, title: program.bonusMatchesPayment ? "First month bonus" : `${formatCents(program.bonusCents)} bonus`, text: program.bonusMatchesPayment
        ? `One month of the plan they pick: ${PLAN_IDS.filter((p) => program.bonusPlans.includes(p)).map((p) => formatCents(Math.min(PLANS[p].cents, program.bonusCents))).join(", ")}.`
        : bonusRule(program) || "A one-time bonus per seller.",
    },
    { icon: Repeat, title: `${ratePercent(program.rate)} for life`, text: `${ratePercent(program.rate)} of every subscription payment they make, every month, for as long as they stay.` },
  ];
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {steps.map(({ icon: Icon, title, text }, i) => (
        <div key={title} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-accent/12 text-accent flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">Step {i + 1}</span>
          </div>
          <p className="font-display text-sm font-semibold text-foreground mt-2">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{text}</p>
        </div>
      ))}
    </div>
  );
}

// "If I refer this many sellers, what do I make in a year?"
export function EarningsCalculator({ program }: { program: AffiliateProgram }) {
  const [counts, setCounts] = useState<Record<PlanId, number>>({ sell: 5, ship: 4, sync: 3, grow: 2, flow: 1 });
  const year = projectEarnings(program, counts, 12);
  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5">
      <h2 className="font-display text-sm font-semibold text-foreground">What could you earn?</h2>
      <p className="text-xs text-muted-foreground mt-0.5">Sellers you refer, by plan, and what you'd make in their first year.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        {PLAN_IDS.map((p) => (
          <label key={p} className="block">
            <span className="flex justify-between text-xs">
              <span className="font-medium text-foreground">
                {PLANS[p].name} <span className="text-muted-foreground font-normal">{formatCents(PLANS[p].cents, true)}/mo</span>
              </span>
              <span className="font-mono tabular-nums text-foreground">{counts[p]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={50}
              value={counts[p]}
              onChange={(e) => setCounts((c) => ({ ...c, [p]: Number(e.target.value) }))}
              className="w-full accent-[var(--accent)] mt-1"
              aria-label={`Sellers on ${PLANS[p].name}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">First year</p>
          <p className="font-display text-3xl font-semibold text-accent">{formatCents(year.totalCents)}</p>
        </div>
        <p className="text-xs text-muted-foreground pb-1">
          {formatCents(year.bonusCents)} in bonuses + {formatCents(year.recurringCents)} from {ratePercent(program.rate)} monthly, which keeps coming every year after.
        </p>
      </div>
    </div>
  );
}

export function ProgramTerms({ program }: { program: AffiliateProgram }) {
  const items = [
    bonusRule(program),
    `${ratePercent(program.rate)} of every subscription payment from sellers you referred, for as long as they're subscribed.`,
    `Earnings are held ${program.holdDays} days in case a payment is refunded, then become ready to pay.`,
    `Paid monthly by PayPal, Venmo, Cash App or bank transfer once you have at least ${formatCents(program.minPayoutCents)} ready.`,
    "You can't refer yourself or an account that already exists. Sellers can only be referred once.",
    "No paid ads on the SellSync name, no spam, and no misleading claims. We can pause accounts that break these rules and void their unpaid earnings.",
  ].filter(Boolean);
  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5">
      <h2 className="font-display text-sm font-semibold text-foreground">The terms</h2>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
