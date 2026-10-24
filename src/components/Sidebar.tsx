import { Package, Settings as SettingsIcon, X } from "lucide-react";
import type { LabelStatus, Order, Platform } from "@/lib/types";
import { ALL_PLATFORMS } from "@/lib/types";
import { PlatformIcon, SectionLabel } from "./ui";

export function Sidebar({
  orders,
  activeStatus,
  activePlatforms,
  displayName,
  subtitle,
  open,
  onClose,
  onStatus,
  onTogglePlatform,
  onClearFilters,
  onOpenAccount,
  onOpenSettings,
}: {
  orders: Order[];
  activeStatus: LabelStatus | "all";
  activePlatforms: Set<Platform>;
  displayName: string;
  subtitle: string;
  open: boolean;
  onClose: () => void;
  onStatus: (s: LabelStatus | "all") => void;
  onTogglePlatform: (p: Platform) => void;
  onClearFilters: () => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}) {
  const counts: Record<LabelStatus | "all", number> = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    printed: orders.filter((o) => o.status === "printed").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
  };
  const platformCounts: Partial<Record<Platform, number>> = {};
  orders.forEach((o) => (platformCounts[o.platform] = (platformCounts[o.platform] || 0) + 1));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-60 md:w-52 shrink-0 bg-card border-r border-border flex flex-col transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#B5607A] flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display font-semibold text-foreground text-sm">Reship</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu" className="md:hidden p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <nav className="px-3 py-4 flex flex-col gap-0.5">
          <SectionLabel className="px-2 mb-2">Status</SectionLabel>
          {(["all", "pending", "printed", "shipped"] as const).map((s) => {
            const isActive = activeStatus === s;
            return (
              <button
                type="button"
                key={s}
                onClick={() => onStatus(s)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${isActive ? "bg-[#B5607A] text-white" : "text-foreground hover:bg-muted"}`}
              >
                <div className="flex items-center gap-2">
                  {s !== "all" && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${s === "pending" ? "bg-amber-400" : s === "printed" ? "bg-violet-400" : "bg-emerald-400"} ${isActive ? "opacity-80" : ""}`}
                    />
                  )}
                  <span className="capitalize">{s === "all" ? "All" : s === "pending" ? "To Print" : s}</span>
                </div>
                <span className={`font-mono text-[11px] tabular-nums ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{counts[s]}</span>
              </button>
            );
          })}
        </nav>

        {(activePlatforms.size > 0 || activeStatus !== "all") && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={onClearFilters}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 justify-center py-1.5"
            >
              <X className="w-3 h-3" />
              Clear filters
            </button>
          </div>
        )}

        <nav className="px-4 pb-4 mt-auto">
          <SectionLabel className="mb-3">Platforms</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {ALL_PLATFORMS.map((p) => {
              const isActive = activePlatforms.has(p);
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => onTogglePlatform(p)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left ${isActive ? "border-[#B5607A] bg-rose-50/60 shadow-sm" : "border-border hover:border-[#B5607A]/40 hover:bg-muted/60"}`}
                >
                  <PlatformIcon platform={p} className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate leading-tight ${isActive ? "text-[#B5607A]" : "text-foreground"}`}>{p}</p>
                    <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{platformCounts[p] || 0}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-border px-3 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[#B5607A]/15 flex items-center justify-center shrink-0">
              <span className="font-display text-[11px] font-semibold text-[#B5607A]">{(displayName || "R").charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0 text-left">
              <p className="text-xs font-medium text-foreground truncate leading-none">{displayName || "Your shop"}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    </>
  );
}
