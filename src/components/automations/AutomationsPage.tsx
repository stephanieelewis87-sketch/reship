import { useState } from "react";
import { Info, Puzzle } from "lucide-react";
import type { AutomationKind, AutomationSetting, Automations, Platform } from "@/lib/types";
import { AUTOMATION_KINDS, automationOn } from "@/lib/types";
import { relistState } from "@/lib/inventory";
import type { useReshipData } from "@/lib/useReshipData";
import { PlatformIcon, Toggle, inputClass, primaryButton } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { MessagesPanel } from "./MessagesPanel";

type Data = ReturnType<typeof useReshipData>;

const KINDS: { kind: AutomationKind; label: string; text: string }[] = [
  { kind: "relists", label: "Relists", text: "Delist and relist older items so they show up as new." },
  { kind: "offers", label: "Offers", text: "Send offers to people who liked or watched an item." },
];

// What each marketplace lets sellers automate.
const SUPPORTED: Partial<Record<Platform, AutomationKind[]>> = {
  Poshmark: ["relists", "offers"],
  Mercari: ["relists", "offers"],
  Depop: ["relists", "offers"],
  eBay: ["offers"],
  Vinted: ["relists"],
  Etsy: ["relists"],
};

const DEFAULTS: Record<AutomationKind, AutomationSetting> = {
  relists: { enabled: false, perDay: 20, minAgeDays: 60 },
  offers: { enabled: false, perDay: 50, discountPct: 10, followUps: 0 },
};

export function AutomationsPage({ data }: { data: Data }) {
  const platforms = Object.keys(SUPPORTED) as Platform[];
  const [platform, setPlatform] = useState<Platform>(platforms.includes(data.settings.primaryMarketplace) ? data.settings.primaryMarketplace : "Poshmark");
  const [draft, setDraft] = useState<Automations>(data.settings.automations);
  const [saved, setSaved] = useState(true);
  const kinds = SUPPORTED[platform] ?? [];
  const get = (k: AutomationKind): AutomationSetting => ({ ...DEFAULTS[k], ...draft[platform]?.[k] });
  const set = (k: AutomationKind, patch: Partial<AutomationSetting>) => {
    setDraft({ ...draft, [platform]: { ...draft[platform], [k]: { ...get(k), ...patch } } });
    setSaved(false);
  };
  const stale = data.inventory.filter((i) => i.listings.some((l) => l.platform === platform && l.status === "active" && relistState(l) === "stale")).length;
  const anyOn = automationOn(draft);
  const [tab, setTab] = useState<"auto" | "messages">(() => (location.hash.includes("messages") ? "messages" : "auto"));

  return (
    <div>
      <PageHeader title="Automations" subtitle="Keep listings fresh on every marketplace, and keep in touch with shoppers and buyers">
        {tab === "auto" && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saved}
            className={`${primaryButton} disabled:opacity-50`}
            onClick={() => {
              data.saveSettings({ ...data.settings, automations: draft });
              setSaved(true);
            }}
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
        )}
      </PageHeader>
      <div className="px-4 md:px-8 pt-4 flex gap-1.5 overflow-x-auto" role="tablist">
        {([
          ["auto", "Relists and offers"],
          ["messages", "Comments and messages"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${tab === id ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "messages" ? (
        <div className="px-4 md:px-8 py-4">
          <MessagesPanel data={data} />
        </div>
      ) : (
      <div className="px-4 md:px-8 py-4 space-y-4">
        <p className="text-xs text-muted-foreground flex gap-2">
          <Puzzle className="w-4 h-4 shrink-0 text-accent" />
          <span>
            Automations run through the SellSync browser extension while you're signed in to each marketplace. {anyOn ? "Nothing runs until the extension is connected." : "Your choices save here, and the extension picks them up."}
          </span>
        </p>
        <div className="flex gap-1.5 overflow-x-auto max-w-full">
          {platforms.map((p) => {
            const on = AUTOMATION_KINDS.filter((k) => draft[p]?.[k]?.enabled).length;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                aria-pressed={platform === p}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs whitespace-nowrap ${platform === p ? "border-accent bg-rose-50/60 text-accent" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                <PlatformIcon platform={p} /> {p}
                {on > 0 && <span className="font-mono text-[11px]">{on} on</span>}
              </button>
            );
          })}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {kinds.map((k) => {
            const meta = KINDS.find((x) => x.kind === k)!;
            const s = get(k);
            return (
              <section key={k} className={`rounded-xl border bg-card p-4 space-y-3 ${s.enabled ? "border-accent/40" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-foreground">{meta.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.text}</p>
                  </div>
                  <Toggle label={`${meta.label} on ${platform}`} checked={s.enabled} onChange={() => set(k, { enabled: !s.enabled })} />
                </div>
                {!s.enabled && <p className="text-[12px] text-muted-foreground">{summaryOf(k, s)}. Turn it on to change these.</p>}
                {s.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Most a day" value={s.perDay} onChange={(v) => set(k, { perDay: v })} />
                  {k === "relists" && <NumberField label="Listed at least (days)" value={s.minAgeDays ?? 60} onChange={(v) => set(k, { minAgeDays: v })} />}
                  {k === "offers" && <NumberField label="Discount (%)" value={s.discountPct ?? 10} onChange={(v) => set(k, { discountPct: Math.min(80, v) })} />}
                  {k === "offers" && <NumberField label="Follow-up offers" value={s.followUps ?? 0} onChange={(v) => set(k, { followUps: Math.min(3, v) })} />}
                </div>
                )}
                {k === "relists" && (
                  <p className="text-[12px] text-muted-foreground">
                    {stale} item{stale !== 1 ? "s" : ""} on {platform} haven't been relisted in over 60 days.
                  </p>
                )}
                {k === "offers" && s.enabled && s.followUps ? (
                  <p className="text-[12px] text-muted-foreground">Each follow-up takes off another {s.discountPct ?? 10}%, a day apart.</p>
                ) : null}
              </section>
            );
          })}
        </div>
        <details className="group rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer list-none font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Info className="w-4 h-4" /> How automations work
            <span className="ml-auto text-[12px] font-sans font-normal text-muted-foreground group-open:hidden">Show</span>
          </summary>
          <div className="space-y-1.5 mt-2">
            <p>Each automation runs in small batches spread through the day, staying under the daily cap you set, so it looks like normal activity.</p>
            <p>Relists only touch items that have been listed at least as long as you choose, and never items that sold or are in drafts.</p>
            <p>Offers go to people who liked or watched an item, at the discount you set. Marketplaces may require a minimum discount.</p>
          </div>
        </details>
      </div>
      )}
    </div>
  );
}

// What an automation would do, in one line, while it's off.
function summaryOf(k: AutomationKind, s: AutomationSetting) {
  if (k === "relists") return `Up to ${s.perDay} a day, for items listed ${s.minAgeDays ?? 60}+ days`;
  return `Up to ${s.perDay} a day at ${s.discountPct ?? 10}% off`;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-[12px] text-muted-foreground space-y-1">
      <span>{label}</span>
      <input className={inputClass} inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
    </label>
  );
}
