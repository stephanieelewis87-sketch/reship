import { useState, type ReactNode } from "react";
import { MapPin, Plus, Puzzle, Trash2 } from "lucide-react";
import type { LabelFormat, PackageType, Platform, Settings } from "@/lib/types";
import { ALL_PLATFORMS, CARRIER_SERVICES, PACKAGE_TYPES, emptyAddress } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { AddressFields } from "../AddressFields";
import { Field, PlatformIcon, Toggle, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";
import { PageHeader } from "../shell/PageHeader";
import { go } from "../shell/route";

type Data = ReturnType<typeof useReshipData>;

export type SettingsTab = "connections" | "sale" | "labels" | "marketplaces" | "pricing" | "shipping" | "ai" | "subscription" | "account";
const TABS: { key: SettingsTab; label: string }[] = [
  { key: "connections", label: "Connections" },
  { key: "sale", label: "Sale detection" },
  { key: "labels", label: "Labels" },
  { key: "marketplaces", label: "Marketplaces" },
  { key: "pricing", label: "Pricing rules" },
  { key: "shipping", label: "Shipping" },
  { key: "ai", label: "AI generation" },
  { key: "subscription", label: "Subscription" },
  { key: "account", label: "Account" },
];

const LABEL_COLORS = ["#d03b3b", "#eda100", "#2a78d6", "#1f9d6b", "#7a4fd0", "#B5607A", "#5d6b7a"];

export function SettingsPage({
  data,
  email,
  demoMode,
  onSignOut,
  tab: initialTab,
}: {
  data: Data;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
  tab?: string | null;
}) {
  const tab: SettingsTab = TABS.some((t) => t.key === initialTab) ? (initialTab as SettingsTab) : "connections";
  const [draft, setDraft] = useState<Settings>(data.settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div>
      <PageHeader title="Settings">
        <div className="flex gap-2">
          {dirty && (
            <button type="button" className={secondaryButton} onClick={() => setDraft(data.settings)}>
              Discard
            </button>
          )}
          <button type="button" className={primaryButton} disabled={!dirty} onClick={() => data.saveSettings(draft)}>
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </PageHeader>
      <div className="md:flex">
        <nav className="md:w-48 shrink-0 md:border-r border-b md:border-b-0 border-border px-4 md:px-3 py-2 md:py-4 flex md:flex-col gap-1 overflow-x-auto" aria-label="Settings sections">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`#/settings?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={`px-2.5 py-1.5 rounded-md text-sm whitespace-nowrap ${tab === t.key ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </a>
          ))}
        </nav>
        <div className="flex-1 min-w-0 px-4 md:px-8 py-5 max-w-2xl space-y-6">
          {tab === "connections" && <Connections />}
          {tab === "sale" && (
            <Section title="Sale detection" text="When an item sells on one marketplace, Reship marks it sold and can take it down everywhere else.">
              <Row title="Adjust quantity on sale" text="For items with more than one in stock, take one off the count instead of marking the item sold.">
                <Toggle label="Adjust quantity on sale" checked={draft.autoAdjustQuantity} onChange={() => set("autoAdjustQuantity", !draft.autoAdjustQuantity)} />
              </Row>
              <p className="text-xs font-medium text-foreground pt-2">Delist from these marketplaces when an item sells elsewhere</p>
              {ALL_PLATFORMS.map((p) => (
                <Row key={p} title={<PlatformName p={p} />}>
                  <Toggle label={`Auto-delist on ${p}`} checked={!!draft.autoDelist[p]} onChange={() => set("autoDelist", { ...draft.autoDelist, [p]: !draft.autoDelist[p] })} />
                </Row>
              ))}
              <Note>Delisting runs through the browser extension. Until it does, items that sold show as "partially delisted" on Home and in Inventory so you can take them down yourself.</Note>
            </Section>
          )}
          {tab === "labels" && (
            <Section title="Labels" text="Tag inventory with your own labels, like a storage bin or a to-do. Filter by them in Inventory.">
              {draft.labels.map((l, i) => (
                <div key={l.id} className="flex items-center gap-2">
                  <select
                    aria-label={`Color for ${l.name}`}
                    value={l.color}
                    onChange={(e) => set("labels", draft.labels.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
                    className="w-8 h-8 rounded-md border border-border appearance-none cursor-pointer text-transparent"
                    style={{ background: l.color }}
                  >
                    {LABEL_COLORS.map((c) => (
                      <option key={c} value={c} style={{ background: c }}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input className={inputClass} aria-label="Label name" value={l.name} onChange={(e) => set("labels", draft.labels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" aria-label={`Delete ${l.name}`} onClick={() => set("labels", draft.labels.filter((_, j) => j !== i))} className="p-2 text-muted-foreground hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-[#B5607A] hover:underline flex items-center gap-1.5"
                onClick={() => set("labels", [...draft.labels, { id: `lbl-${crypto.randomUUID().slice(0, 8)}`, name: "New label", color: LABEL_COLORS[draft.labels.length % LABEL_COLORS.length] }])}
              >
                <Plus className="w-3.5 h-3.5" /> Add label
              </button>
            </Section>
          )}
          {tab === "marketplaces" && (
            <Section title="Marketplaces" text="Your primary marketplace is where new listings start, and the price other marketplaces adjust from.">
              <Row title="Primary marketplace">
                <select className={selectClass} value={draft.primaryMarketplace} onChange={(e) => set("primaryMarketplace", e.target.value as Platform)}>
                  {ALL_PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Row>
            </Section>
          )}
          {tab === "pricing" && (
            <Section title="Pricing rules" text="Raise or lower the price on each marketplace from your base price, for example to cover higher fees. Applied when you crosslist.">
              {ALL_PLATFORMS.map((p) => (
                <Row key={p} title={<PlatformName p={p} />}>
                  <div className="flex items-center gap-1.5">
                    <input
                      className={`${inputClass} w-20 text-right`}
                      inputMode="decimal"
                      aria-label={`Price change on ${p} in percent`}
                      value={draft.pricingRules[p] ?? ""}
                      placeholder="0"
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        const next = { ...draft.pricingRules };
                        if (Number.isFinite(n) && n !== 0) next[p] = n;
                        else delete next[p];
                        set("pricingRules", next);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </Row>
              ))}
            </Section>
          )}
          {tab === "shipping" && (
            <>
              <Section title="Ship-from address">
                {draft.shipFrom ? (
                  <AddressFields value={draft.shipFrom} onChange={(a) => set("shipFrom", a)} />
                ) : (
                  <button type="button" onClick={() => set("shipFrom", emptyAddress())} className="text-sm text-[#B5607A] hover:underline flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Add your ship-from address
                  </button>
                )}
              </Section>
              <Section title="Package presets" text="Common package sizes, so you don't type the weight on every order.">
                {draft.shippingPresets.map((s, i) => {
                  const upd = (patch: Partial<typeof s>) => set("shippingPresets", draft.shippingPresets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={s.id} className="grid grid-cols-[1fr_auto_5rem_auto] gap-2 items-center">
                      <input className={inputClass} aria-label="Preset name" value={s.name} onChange={(e) => upd({ name: e.target.value })} />
                      <select className={selectClass} aria-label="Package type" value={s.packageType} onChange={(e) => upd({ packageType: e.target.value as PackageType })}>
                        {PACKAGE_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input className={inputClass} aria-label="Weight in pounds" inputMode="decimal" value={s.weightLbs} onChange={(e) => upd({ weightLbs: parseFloat(e.target.value) || 0 })} />
                      <button type="button" aria-label={`Delete ${s.name}`} onClick={() => set("shippingPresets", draft.shippingPresets.filter((_, j) => j !== i))} className="p-2 text-muted-foreground hover:text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="text-sm text-[#B5607A] hover:underline flex items-center gap-1.5"
                  onClick={() => set("shippingPresets", [...draft.shippingPresets, { id: `sp-${crypto.randomUUID().slice(0, 8)}`, name: "New preset", packageType: "Soft Pack", weightLbs: 1 }])}
                >
                  <Plus className="w-3.5 h-3.5" /> Add preset
                </button>
              </Section>
              <Section title="Labels and sync">
                <Row title="Label format">
                  <select value={draft.labelFormat} onChange={(e) => set("labelFormat", e.target.value as LabelFormat)} className={selectClass}>
                    <option value="4x6">4×6 (thermal)</option>
                    <option value="letter">Letter (8.5×11)</option>
                    <option value="a4">A4</option>
                  </select>
                </Row>
                <Row title="Default carrier">
                  <select value={draft.defaultCarrier} onChange={(e) => set("defaultCarrier", e.target.value)} className={selectClass}>
                    {CARRIER_SERVICES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Row>
                <Row title="Print SKU on labels">
                  <Toggle label="Print SKU on labels" checked={draft.printSkuOnLabel} onChange={() => set("printSkuOnLabel", !draft.printSkuOnLabel)} />
                </Row>
                <Row title="Print packing slip">
                  <Toggle label="Print packing slip" checked={draft.printPackingSlip} onChange={() => set("printPackingSlip", !draft.printPackingSlip)} />
                </Row>
                <Row title="Auto-print on sync" text="Print new labels automatically">
                  <Toggle label="Auto-print on sync" checked={draft.autoPrint} onChange={() => set("autoPrint", !draft.autoPrint)} />
                </Row>
                <Row title="Auto-sync interval" text="How often to pull new orders, once sync is connected">
                  <select value={draft.syncInterval} onChange={(e) => set("syncInterval", e.target.value)} className={selectClass}>
                    <option value="15">Every 15 min</option>
                    <option value="30">Every 30 min</option>
                    <option value="60">Every hour</option>
                    <option value="0">Manual only</option>
                  </select>
                </Row>
                <Row title="New order alerts" text="Notify when orders are pulled">
                  <Toggle label="New order alerts" checked={draft.notifications} onChange={() => set("notifications", !draft.notifications)} />
                </Row>
              </Section>
            </>
          )}
          {tab === "ai" && (
            <Section title="AI generation" text="Tell the listing assistant how you like things written. It follows these every time it drafts a listing from your photos.">
              {(
                [
                  ["title", "Titles", "e.g. Brand, item, size, color. Under 80 characters."],
                  ["description", "Descriptions", "e.g. Friendly, short paragraphs, end with measurements."],
                  ["condition", "Condition notes", "e.g. Always mention flaws and where they are."],
                  ["sku", "SKUs", "e.g. Start with the bin letter, then a number."],
                ] as const
              ).map(([k, label, ph]) => (
                <Field key={k} label={label}>
                  <textarea className={`${inputClass} min-h-16`} placeholder={ph} value={draft.aiInstructions[k]} onChange={(e) => set("aiInstructions", { ...draft.aiInstructions, [k]: e.target.value })} />
                </Field>
              ))}
            </Section>
          )}
          {tab === "subscription" && (
            <Section title="Subscription">
              <div className="rounded-xl border border-border p-4">
                <p className="font-display text-base font-semibold text-foreground">Early access</p>
                <p className="text-xs text-muted-foreground mt-1">Every feature is free while Reship is in early access. Plans and pricing come later, and you'll hear about them before anything changes.</p>
              </div>
            </Section>
          )}
          {tab === "account" && <Account data={data} draft={draft} set={set} email={email} demoMode={demoMode} onSignOut={onSignOut} />}
        </div>
      </div>
    </div>
  );
}

function Connections() {
  return (
    <Section title="Connections" text="Reship works with your marketplace accounts through its browser extension, using the sign-ins you already have.">
      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs px-3 py-2.5 flex gap-2">
        <Puzzle className="w-4 h-4 shrink-0" />
        <p>The extension isn't connected yet. Until it is, add orders with Import CSV or Add order on the Orders page, and add inventory by hand.</p>
      </div>
      {ALL_PLATFORMS.map((p) => (
        <Row key={p} title={<PlatformName p={p} />}>
          <span className="text-[11px] text-muted-foreground">Not connected</span>
        </Row>
      ))}
    </Section>
  );
}

function Account({
  data,
  draft,
  set,
  email,
  demoMode,
  onSignOut,
}: {
  data: Data;
  draft: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
}) {
  const samples = data.orders.filter((o) => o.source === "sample");
  const [confirm, setConfirm] = useState("");
  return (
    <>
      <Section title="Account">
        <Field label="Display name">
          <input className={inputClass} value={draft.displayName} placeholder="Your name or shop name" onChange={(e) => set("displayName", e.target.value)} />
        </Field>
        <p className="text-xs text-muted-foreground">{email ?? "Demo mode: saved in this browser only"}</p>
        <div className="flex flex-wrap gap-4 pt-1">
          <button type="button" onClick={() => go("feedback")} className="text-xs text-foreground hover:underline">
            Send feedback
          </button>
          {!demoMode && (
            <button type="button" onClick={onSignOut} className="text-xs text-destructive hover:underline">
              Sign out
            </button>
          )}
        </div>
      </Section>
      <Section title="Danger zone">
        <div className="rounded-xl border border-rose-200 p-4 space-y-3">
          {samples.length > 0 && (
            <Row title={`Remove ${samples.length} sample order${samples.length !== 1 ? "s" : ""}`} text="Clears the examples Reship started you with.">
              <button type="button" className={secondaryButton} onClick={() => data.deleteOrders(samples.map((o) => o.id))}>
                Remove
              </button>
            </Row>
          )}
          <Row title="Delete all inventory" text={`Removes all ${data.inventory.length} items. Orders and expenses stay. This can't be undone.`}>
            <div className="flex gap-2">
              <input className={`${inputClass} w-28`} aria-label="Type DELETE to confirm" placeholder="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <button
                type="button"
                disabled={confirm !== "DELETE" || !data.inventory.length}
                onClick={() => {
                  data.deleteInventory(data.inventory.map((i) => i.id));
                  setConfirm("");
                }}
                className="px-3 py-1.5 rounded-md bg-rose-700 text-white text-xs font-medium disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </Row>
        </div>
      </Section>
    </>
  );
}

function Section({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {text && <p className="text-xs text-muted-foreground mt-0.5">{text}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ title, text, children }: { title: ReactNode; text?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{title}</div>
        {text && <p className="text-[11px] text-muted-foreground mt-0.5">{text}</p>}
      </div>
      {children}
    </div>
  );
}

function PlatformName({ p }: { p: Platform }) {
  return (
    <span className="flex items-center gap-2">
      <PlatformIcon platform={p} className="w-4 h-4" /> {p}
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
