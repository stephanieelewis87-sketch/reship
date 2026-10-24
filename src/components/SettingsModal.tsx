import { useState } from "react";
import { Bell, MapPin, RefreshCw } from "lucide-react";
import type { LabelFormat, Settings } from "@/lib/types";
import { ALL_PLATFORMS, CARRIER_SERVICES, emptyAddress } from "@/lib/types";
import { AddressFields } from "./AddressFields";
import { Modal, PlatformIcon, SectionLabel, Toggle, inputClass, primaryButton, selectClass } from "./ui";

export type SettingsTab = "account" | "settings";

export function SettingsModal({
  defaultTab,
  settings,
  email,
  demoMode,
  sampleCount,
  onClose,
  onSave,
  onSignOut,
  onClearSamples,
}: {
  defaultTab: SettingsTab;
  settings: Settings;
  email: string | null;
  demoMode: boolean;
  sampleCount: number;
  onClose: () => void;
  onSave: (s: Settings) => void;
  onSignOut: () => void;
  onClearSamples: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  const [draft, setDraft] = useState<Settings>(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const done = () => {
    onSave(draft);
    onClose();
  };

  const initial = (draft.displayName || email || "R").charAt(0).toUpperCase();

  return (
    <Modal onClose={done} maxWidth="max-w-lg" label="Account and settings">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border shrink-0">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["account", "settings"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "account" && (
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#B5607A]/15 flex items-center justify-center shrink-0">
              <span className="font-display text-xl font-semibold text-[#B5607A]">{initial}</span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <input
                className={inputClass}
                value={draft.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="Your name or shop name"
                aria-label="Display name"
              />
              <p className="text-xs text-muted-foreground truncate">{email ?? "Demo mode · saved in this browser only"}</p>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-3">Connected Platforms</SectionLabel>
            <div className="space-y-2">
              {ALL_PLATFORMS.map((platform) => (
                <div key={platform} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5">
                    <PlatformIcon platform={platform} className="w-5 h-5" />
                    <p className="text-sm text-foreground leading-none">{platform}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{platform === "Etsy" || platform === "eBay" ? "Auto-sync coming soon" : "Import by CSV"}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">For now, add orders with Import CSV or Add order. Etsy and eBay will sync automatically in a later update.</p>
          </div>

          <div className="pt-2 border-t border-border flex flex-wrap gap-4">
            {sampleCount > 0 && (
              <button type="button" onClick={onClearSamples} className="text-xs text-foreground hover:underline">
                Remove {sampleCount} sample order{sampleCount !== 1 ? "s" : ""}
              </button>
            )}
            {!demoMode && (
              <button type="button" onClick={onSignOut} className="text-xs text-destructive hover:underline">
                Sign out
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          <div>
            <SectionLabel className="mb-3">Ship-from address</SectionLabel>
            {draft.shipFrom ? (
              <AddressFields value={draft.shipFrom} onChange={(a) => set("shipFrom", a)} />
            ) : (
              <button type="button" onClick={() => set("shipFrom", emptyAddress())} className="text-sm text-[#B5607A] hover:underline flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Add your ship-from address
              </button>
            )}
          </div>

          <div>
            <SectionLabel className="mb-3">Sync</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground leading-none">Auto-sync interval</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">How often to pull new orders (once sync is connected)</p>
                </div>
              </div>
              <select value={draft.syncInterval} onChange={(e) => set("syncInterval", e.target.value)} className={selectClass}>
                <option value="15">Every 15 min</option>
                <option value="30">Every 30 min</option>
                <option value="60">Every hour</option>
                <option value="0">Manual only</option>
              </select>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-3">Labels</SectionLabel>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Label format</p>
                <select value={draft.labelFormat} onChange={(e) => set("labelFormat", e.target.value as LabelFormat)} className={selectClass}>
                  <option value="4x6">4×6 (thermal)</option>
                  <option value="letter">Letter (8.5×11)</option>
                  <option value="a4">A4</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">Default carrier</p>
                <select value={draft.defaultCarrier} onChange={(e) => set("defaultCarrier", e.target.value)} className={selectClass}>
                  {CARRIER_SERVICES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground leading-none">Auto-print on sync</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Print new labels automatically</p>
                </div>
                <Toggle label="Auto-print on sync" checked={draft.autoPrint} onChange={() => set("autoPrint", !draft.autoPrint)} />
              </div>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-3">Notifications</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground leading-none">New order alerts</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Notify when orders are pulled</p>
                </div>
              </div>
              <Toggle label="New order alerts" checked={draft.notifications} onChange={() => set("notifications", !draft.notifications)} />
            </div>
          </div>
        </div>
      )}

      <div className="px-5 sm:px-6 py-3 border-t border-border flex justify-end shrink-0">
        <button type="button" onClick={done} className={primaryButton}>
          Done
        </button>
      </div>
    </Modal>
  );
}
