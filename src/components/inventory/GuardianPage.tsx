import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, History, Loader2, RotateCcw, ShieldCheck, ShieldOff } from "lucide-react";
import type { InventoryBackup, InventoryItem, ItemChange } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import { checkInventory, download, inventoryCsv, mergeItems, planRestore, type GuardianIssue, type RestorePlan } from "@/lib/guardian";
import { PageHeader } from "../shell/PageHeader";
import { go } from "../shell/route";
import { primaryButton, secondaryButton } from "../ui";

type Data = ReturnType<typeof useReshipData>;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const stamp = () => new Date().toISOString().slice(0, 10);

// Inventory Guardian: backups, recovery, listing checks and change history in one place.
export function GuardianPage({ data, onOpenItem }: { data: Data; onOpenItem: (item: InventoryItem) => void }) {
  const { inventory, orders, settings, store } = data;
  const issues = useMemo(() => checkInventory(inventory, orders), [inventory, orders]);
  const [backups, setBackups] = useState<InventoryBackup[] | null>(null);
  const [history, setHistory] = useState<ItemChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<InventoryBackup | null>(null);

  const reload = () => {
    store.listBackups().then(setBackups);
    store.listHistory().then((h) => setHistory(h.slice(0, 50)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [store, inventory]);

  const backUpNow = async () => {
    setBusy(true);
    try {
      await data.backUp("Backup");
      setMessage(`Backed up ${inventory.length} items.`);
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (b: InventoryBackup) => {
    const full = await store.getBackup(b.id);
    if (full?.items) download(`inventory-backup-${b.createdAt.slice(0, 10)}.csv`, inventoryCsv(full.items), "text/csv");
  };

  const g = settings.guardian;
  const last = backups?.[0];

  return (
    <div>
      <PageHeader title="Inventory Guardian" subtitle="Your master record of every item, backed up and watched.">
        <button type="button" onClick={() => go("inventory")} className={`${secondaryButton} flex items-center gap-1.5`}>
          <ArrowLeft className="w-4 h-4" /> Inventory
        </button>
      </PageHeader>

      <div className="px-4 md:px-8 py-5 space-y-6 max-w-4xl">
        {message && <p className="text-sm bg-sky-50 text-sky-900 border border-sky-200 rounded-md px-3 py-2">{message}</p>}

        <div className="grid sm:grid-cols-3 gap-3">
          <Stat
            icon={g.protect ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldOff className="w-4 h-4 text-amber-600" />}
            title={g.protect ? "Sync protection on" : "Sync protection off"}
            text={g.protect ? `Changes to ${g.threshold}+ items at once wait for your OK.` : "Big changes go through without asking."}
            link={{ label: "Change", href: "#/settings?tab=guardian" }}
          />
          <Stat
            icon={<History className="w-4 h-4 text-accent" />}
            title={last ? `Last backup ${when(last.createdAt)}` : backups ? "No backups yet" : "Loading backups…"}
            text={g.dailyBackup ? "A new one is made each day you open SellSync." : "Daily backups are off."}
          />
          <Stat
            icon={<AlertTriangle className={`w-4 h-4 ${issues.some((i) => i.severity === "high") ? "text-rose-600" : "text-muted-foreground"}`} />}
            title={issues.length ? `${issues.length} thing${issues.length > 1 ? "s" : ""} to check` : "Listings look healthy"}
            text="Duplicates, unlinked sales and listings that came apart from their item."
          />
        </div>

        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold">Listing checks</h2>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to fix. Every item has its own SKU and every open order matches an item.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((issue, n) => (
                <IssueRow key={issue.kind + n} issue={issue} data={data} onOpenItem={onOpenItem} onMessage={setMessage} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-base font-semibold">Backups</h2>
            <div className="flex gap-2">
              <button type="button" className={`${secondaryButton} flex items-center gap-1.5`} onClick={() => download(`inventory-${stamp()}.csv`, inventoryCsv(inventory), "text/csv")}>
                <Download className="w-4 h-4" /> Export spreadsheet
              </button>
              <button type="button" className={`${primaryButton} flex items-center gap-1.5`} disabled={busy || !inventory.length} onClick={() => void backUpNow()}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Back up now
              </button>
            </div>
          </div>
          {backups && backups.length === 0 && <p className="text-sm text-muted-foreground">No backups yet. Press Back up now, or open SellSync tomorrow for the first daily one.</p>}
          {backups && backups.length > 0 && (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {backups.slice(0, 15).map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{when(b.createdAt)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {b.reason} · {b.itemCount} items
                    </div>
                  </div>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => void downloadBackup(b)}>
                    CSV
                  </button>
                  <button type="button" className="text-xs text-accent hover:underline flex items-center gap-1" onClick={() => setRestoring(b)}>
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">Restoring puts SellSync's records back. It doesn't change, relist or delete anything on your marketplaces.</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold">Recent changes</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every change to an item shows up here, and in the item's own history.</p>
          ) : (
            <HistoryList entries={history} inventory={inventory} onOpenItem={onOpenItem} />
          )}
        </section>
      </div>

      {restoring && (
        <RestoreDialog
          backup={restoring}
          data={data}
          onClose={() => setRestoring(null)}
          onDone={(msg) => {
            setRestoring(null);
            setMessage(msg);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, title, text, link }: { icon: React.ReactNode; title: string; text: string; link?: { label: string; href: string } }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon} {title}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {text}{" "}
        {link && (
          <a href={link.href} className="text-accent hover:underline">
            {link.label}
          </a>
        )}
      </p>
    </div>
  );
}

const DOT = { high: "bg-rose-500", medium: "bg-amber-400", low: "bg-stone-300" };

function IssueRow({ issue, data, onOpenItem, onMessage }: { issue: GuardianIssue; data: Data; onOpenItem: (i: InventoryItem) => void; onMessage: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const items = issue.itemIds.map((id) => data.inventory.find((i) => i.id === id)).filter((i): i is InventoryItem => !!i);
  const byId = new Map(data.inventory.map((i) => [i.id, i]));
  const groups = (issue.groups ?? (issue.kind === "duplicate-listing" ? [issue.itemIds] : []))
    .map((g) => g.map((id) => byId.get(id)).filter((i): i is InventoryItem => !!i))
    .filter((g) => g.length > 1);

  // Keeps the oldest item (and its SKU), folds the others into it, and removes them.
  const merge = (items: InventoryItem[]) => {
    const sorted = [...items].sort((a, b) => (a.createdAt ?? a.purchasedAt ?? "").localeCompare(b.createdAt ?? b.purchasedAt ?? ""));
    const [keep, ...rest] = sorted;
    if (!window.confirm(`Merge ${items.length} items into ${keep.sku}? The others are removed from SellSync; their listings move to ${keep.sku}. A backup is made first.`)) return;
    void data
      .backUp(`Before merging into ${keep.sku}`)
      .then(() => {
        data.saveInventory([rest.reduce(mergeItems, keep)], "Merge");
        data.deleteInventory(
          rest.map((r) => r.id),
          "Merge",
        );
        onMessage(`Merged into ${keep.sku}.`);
      })
      .catch((e: Error) => onMessage(e.message));
  };

  return (
    <li className="bg-card border border-border rounded-xl px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[issue.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{issue.title}</div>
          <p className="text-xs text-muted-foreground">{issue.detail}</p>
        </div>
        {issue.orderIds ? (
          <a href="#/orders" className="text-xs text-accent hover:underline shrink-0">
            See orders
          </a>
        ) : (
          <button type="button" className="text-xs text-accent hover:underline shrink-0" onClick={() => setOpen(!open)}>
            {open ? "Hide" : `Show ${groups.length > 1 ? groups.length : items.length}`}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 pl-4 space-y-3">
          {(groups.length ? groups : [items]).slice(0, 20).map((g, n) => (
            <div key={n} className="space-y-0.5">
              {g.slice(0, 30).map((i) => (
                <button key={i.id} type="button" onClick={() => onOpenItem(i)} className="w-full flex items-center gap-2 text-left text-xs hover:bg-muted rounded px-1 py-0.5">
                  <span className="font-mono text-muted-foreground w-24 shrink-0 truncate">{i.sku || "no SKU"}</span>
                  <span className="truncate flex-1">{i.title || "Untitled"}</span>
                  <span className="text-muted-foreground">{i.listings.map((l) => l.platform).join(", ")}</span>
                </button>
              ))}
              {groups.length > 0 && (
                <button type="button" className="text-xs text-accent hover:underline px-1" onClick={() => merge(g)}>
                  Merge these {g.length} into one item
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function HistoryList({ entries, inventory, onOpenItem }: { entries: ItemChange[]; inventory?: InventoryItem[]; onOpenItem?: (i: InventoryItem) => void }) {
  return (
    <ul className="bg-card border border-border rounded-xl divide-y divide-border text-xs">
      {entries.map((e) => {
        const item = inventory?.find((i) => i.id === e.itemId);
        return (
          <li key={e.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{when(e.at)}</span>
              <span className="text-muted-foreground">·</span>
              <span>{e.source}</span>
              {inventory && (
                <button type="button" disabled={!item || !onOpenItem} onClick={() => item && onOpenItem?.(item)} className="ml-auto font-mono text-accent disabled:text-muted-foreground truncate">
                  {e.sku || "no SKU"}
                </button>
              )}
            </div>
            <div className="mt-0.5 text-foreground">
              {e.kind === "created" && (e.source === "Restore" ? "Added back from a backup" : "Added to inventory")}
              {e.kind === "deleted" && `Deleted ${e.changes[0]?.from ?? ""}`}
              {e.kind === "edited" &&
                e.changes.map((c) => (
                  <div key={c.field}>
                    <span className="text-muted-foreground">{c.field}: </span>
                    {c.from ? <span className="line-through text-muted-foreground">{c.from}</span> : <span className="text-muted-foreground">empty</span>} → {c.to || <span className="text-muted-foreground">empty</span>}
                  </div>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Shows what a restore would do, item by item, and restores only the ones you keep checked.
function RestoreDialog({ backup, data, onClose, onDone }: { backup: InventoryBackup; data: Data; onClose: () => void; onDone: (msg: string) => void }) {
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    data.store.getBackup(backup.id).then((full) => {
      if (!full?.items) return setErr("This backup couldn't be opened.");
      const p = planRestore(full.items, data.inventory);
      setPlan(p);
      setChosen(new Set([...p.missing.map((i) => i.id), ...p.changed.map((c) => c.backup.id)]));
    });
    // Planned once, against the inventory as it was when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backup.id]);

  const toggle = (id: string) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const restore = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const items = [...plan.missing, ...plan.changed.map((c) => c.backup)].filter((i) => chosen.has(i.id));
      await data.restoreItems(items);
      onDone(`Restored ${items.length} item${items.length !== 1 ? "s" : ""} from ${when(backup.createdAt)}. A backup of how things were just before is in the list, in case you change your mind.`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Restore from backup" className="bg-card w-full max-w-2xl h-fit sm:my-6 sm:rounded-xl border border-border shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-sm font-semibold">Restore from {when(backup.createdAt)}</h2>
          <p className="text-xs text-muted-foreground">Check what will change. Nothing happens until you press Restore.</p>
        </div>
        <div className="p-5 space-y-4 text-sm max-h-[60vh] overflow-y-auto">
          {err && <p className="text-destructive text-xs">{err}</p>}
          {!plan && !err && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {plan && plan.missing.length + plan.changed.length === 0 && <p className="text-muted-foreground">Your inventory already matches this backup. Nothing to restore.</p>}
          {plan && plan.missing.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-medium">Add back {plan.missing.length} deleted item{plan.missing.length > 1 ? "s" : ""}</h3>
              {plan.missing.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} />
                  <span className="font-mono text-muted-foreground w-24 truncate">{i.sku}</span>
                  <span className="truncate">{i.title}</span>
                </label>
              ))}
            </div>
          )}
          {plan && plan.changed.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium">Put back {plan.changed.length} changed item{plan.changed.length > 1 ? "s" : ""}</h3>
              {plan.changed.map((c) => (
                <label key={c.backup.id} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={chosen.has(c.backup.id)} onChange={() => toggle(c.backup.id)} />
                  <span className="min-w-0">
                    <span className="font-mono text-muted-foreground">{c.backup.sku}</span> {c.backup.title}
                    {c.changes.slice(0, 4).map((x) => (
                      <span key={x.field} className="block text-muted-foreground">
                        {x.field}: {x.from || "empty"} → <span className="text-foreground">{x.to || "empty"}</span>
                      </span>
                    ))}
                    {c.changes.length > 4 && <span className="block text-muted-foreground">and {c.changes.length - 4} more</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {plan && plan.added.length > 0 && <p className="text-xs text-muted-foreground">{plan.added.length} item{plan.added.length > 1 ? "s" : ""} added since this backup stay as they are.</p>}
          <p className="text-[12px] text-muted-foreground">This only changes SellSync's records. Your marketplace listings stay as they are; relist or edit them there if needed.</p>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${primaryButton} flex items-center gap-1.5`} disabled={!plan || !chosen.size || busy} onClick={() => void restore()}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Restore {chosen.size || ""}
          </button>
        </div>
      </div>
    </div>
  );
}
