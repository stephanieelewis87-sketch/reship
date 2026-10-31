import { X } from "lucide-react";
import type { Order, Platform } from "@/lib/types";
import { ALL_PLATFORMS } from "@/lib/types";
import { PlatformIcon } from "../ui";

// Marketplace chips that narrow a list; none picked means all of them.
export function PlatformFilter({
  orders,
  active,
  onToggle,
  onClear,
}: {
  orders: Order[];
  active: Set<Platform>;
  onToggle: (p: Platform) => void;
  onClear: () => void;
}) {
  const counts: Partial<Record<Platform, number>> = {};
  orders.forEach((o) => (counts[o.platform] = (counts[o.platform] || 0) + 1));
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
      {ALL_PLATFORMS.filter((p) => counts[p]).map((p) => (
        <button
          type="button"
          key={p}
          onClick={() => onToggle(p)}
          aria-pressed={active.has(p)}
          title={p}
          className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] whitespace-nowrap transition-colors ${active.has(p) ? "border-[#B5607A] bg-rose-50/60 text-[#B5607A]" : "border-border text-muted-foreground hover:bg-muted"}`}
        >
          <PlatformIcon platform={p} />
          <span className="tabular-nums">{counts[p]}</span>
        </button>
      ))}
      {active.size > 0 && (
        <button type="button" onClick={onClear} aria-label="Clear marketplace filter" className="p-1 text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
