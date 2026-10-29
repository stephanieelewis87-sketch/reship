import type { ComponentType } from "react";
import { AlertCircle, BarChart3, Home, MessageSquare, Package, Settings as SettingsIcon, Shirt, Truck, X, Zap } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { isPartiallyDelisted } from "@/lib/inventory";
import { OrdersPage } from "../Dashboard";
import { AnalyticsView } from "../analytics/AnalyticsView";
import { HomePage } from "../home/HomePage";
import { InventoryPage } from "../inventory/InventoryPage";
import { AutomationsPage } from "../automations/AutomationsPage";
import { SettingsPage } from "../settings/SettingsPage";
import { FeedbackPage } from "../feedback/FeedbackPage";
import { type Section, go, useRoute } from "./route";

type Data = ReturnType<typeof useReshipData>;

const NAV: { section: Section; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { section: "home", label: "Home", icon: Home },
  { section: "inventory", label: "Inventory", icon: Shirt },
  { section: "automations", label: "Automations", icon: Zap },
  { section: "orders", label: "Orders", icon: Truck },
  { section: "analytics", label: "Analytics", icon: BarChart3 },
  { section: "settings", label: "Settings", icon: SettingsIcon },
];

// The frame around every section: a sidebar on computers and a bottom bar on phones.
export function AppShell({
  data,
  email,
  demoMode,
  onSignOut,
  onResetDemo,
}: {
  data: Data;
  email: string | null;
  demoMode: boolean;
  onSignOut: () => void;
  onResetDemo?: () => void;
}) {
  const route = useRoute();
  const toPrint = data.orders.filter((o) => o.status === "pending").length;
  const issues = data.inventory.filter(isPartiallyDelisted).length;
  const badge: Partial<Record<Section, number>> = { orders: toPrint, inventory: issues };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <aside className="hidden md:flex w-52 shrink-0 bg-card border-r border-border flex-col">
        <button type="button" onClick={() => go("home")} className="px-5 py-5 border-b border-border flex items-center gap-2.5 text-left">
          <div className="w-7 h-7 rounded-lg bg-[#B5607A] flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display font-semibold text-foreground text-sm">Reship</span>
        </button>
        <nav className="px-3 py-4 flex flex-col gap-0.5">
          {NAV.map(({ section, label, icon: Icon }) => {
            const active = route.section === section;
            return (
              <a
                key={section}
                href={`#/${section}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${active ? "bg-[#B5607A] text-white" : "text-foreground hover:bg-muted"}`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" /> {label}
                </span>
                {!!badge[section] && (
                  <span className={`font-mono text-[11px] tabular-nums ${active ? "text-white/80" : "text-muted-foreground"}`}>{badge[section]}</span>
                )}
              </a>
            );
          })}
        </nav>
        <a
          href="#/feedback"
          aria-current={route.section === "feedback" ? "page" : undefined}
          className={`mt-auto mx-3 mb-2 flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm ${route.section === "feedback" ? "bg-[#B5607A] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          <MessageSquare className="w-4 h-4" /> Feedback
        </a>
        <a href="#/settings?tab=account" className=" border-t border-border px-4 py-3 flex items-center gap-2 hover:bg-muted">
          <div className="w-6 h-6 rounded-full bg-[#B5607A]/15 flex items-center justify-center shrink-0">
            <span className="font-display text-[11px] font-semibold text-[#B5607A]">{(data.settings.displayName || "R").charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate leading-none">{data.settings.displayName || "Your shop"}</p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{demoMode ? "Demo mode" : (email ?? "")}</p>
          </div>
        </a>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {demoMode && (
          <div className="px-4 md:px-8 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-3">
            <span className="flex-1">Demo mode: sample data, saved in this browser only.</span>
            {onResetDemo && (
              <button type="button" onClick={onResetDemo} className="underline hover:no-underline">
                Reset demo
              </button>
            )}
          </div>
        )}
        {data.error && (
          <div className="px-4 md:px-8 py-2 border-b text-xs flex items-center gap-2 bg-rose-50 border-rose-200 text-rose-900">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">Couldn't save: {data.error}</span>
            <button type="button" aria-label="Dismiss" onClick={data.clearError}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {data.loading ? (
            <p className="text-sm text-muted-foreground text-center py-20">Loading…</p>
          ) : (
            <>
              {route.section === "home" && <HomePage data={data} />}
              {route.section === "inventory" && <InventoryPage data={data} route={route} />}
              {route.section === "automations" && <AutomationsPage data={data} />}
              {route.section === "orders" && <OrdersPage key={route.params.get("open") ?? ""} data={data} openOrderId={route.params.get("open")} />}
              {route.section === "analytics" && (
                <AnalyticsView
                  key={route.params.get("tab") ?? ""}
                  orders={data.orders}
                  inventory={data.inventory}
                  expenses={data.expenses}
                  settings={data.settings}
                  onOpenOrder={(o) => go("orders", { open: o.id })}
                  saveSettings={data.saveSettings}
                  saveInventory={data.saveInventory}
                  saveExpenses={data.saveExpenses}
                  deleteExpenses={data.deleteExpenses}
                  initialTab={route.params.get("tab")}
                />
              )}
              {route.section === "feedback" && <FeedbackPage key={route.params.get("tab") ?? ""} data={data} tab={route.params.get("tab")} />}
              {route.section === "settings" && (
                <SettingsPage data={data} email={email} demoMode={demoMode} onSignOut={onSignOut} tab={route.params.get("tab")} />
              )}
            </>
          )}
        </div>
      </main>

      <a href="#/feedback" aria-label="Send feedback" className="md:hidden fixed right-3 bottom-[4.5rem] z-30 w-10 h-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-[#B5607A]">
        <MessageSquare className="w-4 h-4" />
      </a>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-6">
        {NAV.map(({ section, label, icon: Icon }) => {
          const active = route.section === section;
          return (
            <a
              key={section}
              href={`#/${section}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-[#B5607A] font-medium" : "text-muted-foreground"}`}
            >
              <Icon className="w-5 h-5" />
              {label === "Automations" ? "Auto" : label}
              {!!badge[section] && <span className="absolute top-1 right-[22%] w-1.5 h-1.5 rounded-full bg-[#B5607A]" />}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
