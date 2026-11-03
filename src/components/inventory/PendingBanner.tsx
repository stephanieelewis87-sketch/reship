import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import { diffItem } from "@/lib/guardian";

type Data = ReturnType<typeof useReshipData>;

// Sync protection: shows a big change Inventory Guardian is holding, until the owner applies or drops it.
export function PendingBanner({ data }: { data: Data }) {
  const [review, setReview] = useState(false);
  const p = data.pending;
  if (!p) return null;
  const byId = new Map(data.inventory.map((i) => [i.id, i]));
  const rows =
    p.kind === "delete"
      ? p.ids.map((id) => ({ id, sku: byId.get(id)?.sku ?? "", title: byId.get(id)?.title ?? "", what: "Delete from SellSync" }))
      : p.items.map((i) => {
          const before = byId.get(i.id);
          const changes = before ? diffItem(before, i) : [];
          return { id: i.id, sku: i.sku, title: i.title, what: before ? changes.map((c) => `${c.field}: ${c.from || "empty"} → ${c.to || "empty"}`).join("; ") : "New item" };
        });
  const verb = p.kind === "delete" ? "delete" : "change";
  return (
    <div className="px-4 md:px-8 py-3 border-b bg-amber-50 border-amber-300 text-amber-900 text-sm">
      <div className="flex items-start gap-2 flex-wrap">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="flex-1 min-w-[200px]">
          <strong>Inventory Guardian paused a big change.</strong> {p.source} would {verb} {p.count} items at once. Nothing has changed yet.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setReview(!review)} className="px-2.5 py-1 rounded-md border ring-2 ring-amber-400 text-xs hover:bg-amber-100">
            {review ? "Hide" : "Review"}
          </button>
          <button type="button" onClick={data.discardPending} className="px-2.5 py-1 rounded-md border ring-2 ring-amber-400 text-xs hover:bg-amber-100">
            Don't do it
          </button>
          <button type="button" onClick={() => void data.applyPending()} className="px-2.5 py-1 rounded-md bg-accent text-accent-foreground text-xs font-medium hover:opacity-90">
            Back up and apply
          </button>
        </div>
      </div>
      {review && (
        <ul className="mt-2 ml-6 max-h-60 overflow-y-auto text-xs space-y-1">
          {rows.slice(0, 100).map((r) => (
            <li key={r.id}>
              <span className="font-mono">{r.sku}</span> {r.title} <span className="text-amber-800">· {r.what || "no visible change"}</span>
            </li>
          ))}
          {rows.length > 100 && <li>and {rows.length - 100} more</li>}
        </ul>
      )}
    </div>
  );
}
