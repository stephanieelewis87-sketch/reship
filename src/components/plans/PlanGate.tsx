import { Lock, Sparkles } from "lucide-react";
import { FEATURE_NAMES, FEATURE_PLAN, PLANS, type Feature, type PlanId, planOf, priceLabel } from "@/lib/plans";
import type { Settings } from "@/lib/types";
import { go } from "../shell/route";
import { PageHeader } from "../shell/PageHeader";
import { primaryButton } from "../ui";

export const currentPlan = (settings: Pick<Settings, "plan">): PlanId => planOf(settings.plan);

// Opens Subscription in Settings, pointing at the plan that has this feature.
export const upgradeFor = (feature: Feature) => go("settings", { tab: "subscription", need: feature });

// A small "Grow" chip with a lock, next to something the current plan doesn't include.
export function PlanTag({ feature, className = "" }: { feature: Feature; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium leading-none ${className}`}>
      <Lock className="w-2.5 h-2.5" /> {PLANS[FEATURE_PLAN[feature]].name}
    </span>
  );
}

// The sentence used in upgrade prompts: "Crosslisting is on Grow ($50/mo) and up."
export function needsPlanText(feature: Feature) {
  const plan = FEATURE_PLAN[feature];
  const top = plan === "flow";
  return `${FEATURE_NAMES[feature]} ${top ? "comes with" : "is on"} ${PLANS[plan].name} (${priceLabel(plan)}/mo)${top ? "" : " and up"}.`;
}

// Stands in for a whole section the plan doesn't include.
export function LockedSection({ feature, title, text }: { feature: Feature; title: string; text: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="px-4 md:px-8 py-10">
        <LockedCard feature={feature} text={text} />
      </div>
    </div>
  );
}

export function LockedCard({ feature, text, compact }: { feature: Feature; text?: string; compact?: boolean }) {
  const plan = FEATURE_PLAN[feature];
  return (
    <div className={`max-w-md mx-auto text-center bg-card border border-border rounded-xl ${compact ? "p-4" : "p-6"}`}>
      <div className="w-10 h-10 mx-auto rounded-full bg-accent/15 flex items-center justify-center">
        <Lock className="w-4 h-4 text-accent" />
      </div>
      <p className="font-display text-base font-semibold mt-3">{needsPlanText(feature)}</p>
      {text && <p className="text-xs text-muted-foreground mt-1.5">{text}</p>}
      <button type="button" className={`${primaryButton} mt-4 inline-flex items-center gap-1.5`} onClick={() => upgradeFor(feature)}>
        <Sparkles className="w-3.5 h-3.5" /> See {PLANS[plan].name}
      </button>
    </div>
  );
}
