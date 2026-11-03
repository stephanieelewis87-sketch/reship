import { type ComponentType, useEffect, useState } from "react";
import { AlertCircle, BarChart3, Gift, Home, MessageSquare, MoreHorizontal, Settings as SettingsIcon, Shirt, Truck, X, Zap } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { isPartiallyDelisted } from "@/lib/inventory";
import { OrdersPage } from "../Dashboard";
import { AnalyticsView } from "../analytics/AnalyticsView";
import { HomePage } from "../home/HomePage";
import { InventoryPage } from "../inventory/InventoryPage";
import { PendingBanner } from "../inventory/PendingBanner";
import { AutomationsPage } from "../automations/AutomationsPage";
import { SettingsPage } from "../settings/SettingsPage";
import { FeedbackPage } from "../feedback/FeedbackPage";
import { AffiliatesPage } from "../affiliates/AffiliatesPage";
import { type Section, go, useRoute } from "./route";
import { Logo } from "../brand/Logo";

type Data = ReturnType<typeof useReshipData>;

interface NavItem {
  section: Section;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// The sidebar in two groups: the everyday work first, then the tools that grow the shop.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Sell",
    items: [
      { section: "home", label: "Home", icon: Home },
      { section: "inventory", label: "Inventory", icon: Shirt },
      { section: "orders", label: "Orders", icon: Truck },
    ],
  },
  {
    title: "Grow",
    items: [
      { section: "automations", label: "Automations", icon: Zap },
      { section: "analytics", label: "Analytics", icon: BarChart3 },
      { section: "affiliates", label: "Affiliates", icon: Gift },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

// The phone's bottom bar keeps the most used sections and Affiliates; the rest sit under More.
const PHONE_TABS: Section[] = ["home", "inventory", "orders", "analytics", "affiliates"];
const MORE: NavItem[] = [
  ...NAV.filter((n) => !PHONE_TABS.includes(n.section)),
  { section: "settings", label: "Settings", icon: SettingsIcon },
  { section: "feedback", label: "Send feedback", icon: MessageSquare },
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
          <Logo />
        </button>
        <nav className="px-3 py-4 flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{group.title}</p>
              {group.items.map((item) => (
                <SideLink key={item.section} item={item} active={route.section === item.section} badge={badge[item.section]} />
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-3 pb-2 flex flex-col gap-0.5">
          <SideLink item={{ section: "settings", label: "Settings", icon: SettingsIcon }} active={route.section === "settings"} quiet />
          <SideLink item={{ section: "feedback", label: "Feedback", icon: MessageSquare }} active={route.section === "feedback"} quiet />
        </div>
        <a href="#/settings?tab=account" className=" border-t border-border px-4 py-3 flex items-center gap-2 hover:bg-muted">
          <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <span className="font-display text-[11px] font-semibold text-accent">{(data.settings.displayName || "S").charAt(0).toUpperCase()}</span>
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
        <PendingBanner data={data} />
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
              {route.section === "affiliates" && <AffiliatesPage key={route.params.get("tab") ?? ""} data={data} email={email} tab={route.params.get("tab")} />}
              {route.section === "feedback" && <FeedbackPage key={route.params.get("tab") ?? ""} data={data} tab={route.params.get("tab")} />}
              {route.section === "settings" && (
                <SettingsPage data={data} email={email} demoMode={demoMode} onSignOut={onSignOut} tab={route.params.get("tab")} />
              )}
            </>
          )}
        </div>
      </main>

      <PhoneNav route={route.section} badge={badge} />
    </div>
  );
}

function SideLink({ item, active, badge, quiet }: { item: NavItem; active: boolean; badge?: number; quiet?: boolean }) {
  const earn = item.section === "affiliates";
  const { section, label, icon: Icon } = item;
  return (
    <a
      href={`#/${section}`}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
        active ? "bg-accent/15 text-accent font-medium" : quiet ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="w-4 h-4" /> {label}
      </span>
      {earn && !active && <span className="px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium">Earn</span>}
      {!!badge && (
        <span
          className={`min-w-5 h-5 px-1.5 rounded-full font-mono text-[11px] tabular-nums flex items-center justify-center ${
            "bg-accent/15 text-accent"
          }`}
        >
          {badge}
        </span>
      )}
    </a>
  );
}

// Phones: four tabs and a More sheet with everything else.
function PhoneNav({ route, badge }: { route: Section; badge: Partial<Record<Section, number>> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  const moreActive = MORE.some((m) => m.section === route);
  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-label="More"
            className="absolute bottom-16 inset-x-3 rounded-xl bg-popover border border-border shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {MORE.map(({ section, label, icon: Icon }) => (
              <a
                key={section}
                href={`#/${section}`}
                onClick={() => setOpen(false)}
                aria-current={route === section ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm ${route === section ? "bg-accent/15 text-accent font-medium" : "text-foreground"}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </a>
            ))}
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border grid grid-cols-6">
        {NAV.filter((n) => PHONE_TABS.includes(n.section)).map(({ section, label, icon: Icon }) => {
          const active = route === section;
          return (
            <a
              key={section}
              href={`#/${section}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent font-medium" : "text-muted-foreground"}`}
            >
              <Icon className="w-5 h-5" />
              {label}
              {!!badge[section] && <span className="absolute top-1 right-[22%] w-1.5 h-1.5 rounded-full bg-accent" />}
            </a>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${moreActive || open ? "text-accent font-medium" : "text-muted-foreground"}`}
        >
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
      </nav>
    </>
  );
}
