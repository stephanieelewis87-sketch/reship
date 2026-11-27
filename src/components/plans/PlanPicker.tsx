import { Check } from "lucide-react";
import { FEATURE_NAMES, FEATURE_PLAN, PLANS, PLAN_IDS, type Feature, type PlanId, isPlanId, planRank, priceLabel } from "@/lib/plans";

const isFeature = (v: unknown): v is Feature => typeof v === "string" && v in FEATURE_PLAN;

// The five plans side by side, for Settings > Subscription. `need` is a feature the seller just
// tried to use; the plan that has it is highlighted.
export function PlanPicker({ current, need, onChoose }: { current: PlanId; need?: string | null; onChoose: (plan: PlanId) => void }) {
  // `need` is a feature, or a plan picked for its higher limits.
  const wanted = isFeature(need) ? FEATURE_PLAN[need] : isPlanId(need) ? need : null;
  const showNeed = wanted !== null && planRank(current) < planRank(wanted);
  return (
    <div className="space-y-3">
      {showNeed && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 text-xs px-3 py-2.5">
          {isFeature(need)
            ? `${FEATURE_NAMES[need]} ${wanted === "flow" ? "comes with Flow" : `starts on ${PLANS[wanted].name}`}.`
            : `${PLANS[wanted].name} raises your listing and marketplace limits.`}{" "}
          You're on {PLANS[current].name}.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {PLAN_IDS.map((id, i) => {
          const p = PLANS[id];
          const isCurrent = id === current;
          const highlight = showNeed && id === wanted;
          return (
            <div key={id} className={`rounded-xl border p-4 flex flex-col ${isCurrent ? "border-accent bg-accent/5" : highlight ? "border-accent/60" : "border-border"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-base font-semibold">{p.name}</p>
                <p className="text-sm">
                  <span className="font-display text-xl">{priceLabel(id)}</span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.pitch}</p>
              <ul className="mt-3 space-y-1.5 text-xs flex-1">
                {i > 0 && (
                  <li className="flex gap-1.5 text-muted-foreground">
                    <Check className="w-3.5 h-3.5 shrink-0 text-accent" /> Everything in {PLANS[PLAN_IDS[i - 1]].name}
                  </li>
                )}
                {p.adds.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0 text-accent" /> {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => onChoose(id)}
                className={`mt-4 w-full px-3 py-2 rounded-md text-sm font-medium ${
                  isCurrent ? "bg-muted text-muted-foreground" : highlight || planRank(id) > planRank(current) ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "border border-border hover:bg-muted"
                }`}
              >
                {isCurrent ? "Your plan" : planRank(id) > planRank(current) ? `Switch to ${p.name}` : `Move to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
