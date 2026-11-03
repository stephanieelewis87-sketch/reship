import { useCallback, useEffect, useRef, useState } from "react";
import type { Expense, InventoryBackup, InventoryItem, Order, Settings } from "./types";
import { applySales } from "./inventory";
import { DAILY, backupsToPrune, changesForDelete, changesForSave, destructiveCount, needsDailyBackup } from "./guardian";
import { cleanPrefix, highestSkuNumber } from "./sku";
import { DEFAULT_SETTINGS } from "./types";
import type { Store } from "./store";

// Loads orders and settings from the store and keeps the screen in step with every save.
export function useReshipData(store: Store) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A big destructive change Inventory Guardian is holding until the owner says yes.
  const [pending, setPending] = useState<PendingChange | null>(null);
  const inventoryRef = useRef<InventoryItem[]>([]);
  inventoryRef.current = inventory;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([store.listOrders(), store.getSettings(), store.listInventory(), store.listExpenses()])
      .then(([o, s, inv, exp]) => {
        if (cancelled) return;
        setOrders(o);
        setSettings(s);
        setInventory(inv);
        setExpenses(exp);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [store]);

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const saveOrders = useCallback(
    (changed: Order[]) => {
      setOrders((prev) => {
        const ids = new Set(prev.map((o) => o.id));
        const byId = new Map(changed.map((o) => [o.id, o]));
        const fresh = changed.filter((o) => !ids.has(o.id));
        return [...fresh, ...prev.map((o) => byId.get(o.id) ?? o)];
      });
      store.saveOrders(changed).catch(report);
    },
    [store],
  );

  const patchOrders = useCallback(
    (ids: string[], patch: (o: Order) => Partial<Order>) => {
      const changed = orders.filter((o) => ids.includes(o.id)).map((o) => ({ ...o, ...patch(o) }));
      saveOrders(changed);
    },
    [orders, saveOrders],
  );

  const deleteOrders = useCallback(
    (ids: string[]) => {
      setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      store.deleteOrders(ids).catch(report);
    },
    [store],
  );

  const saveSettings = useCallback(
    (incoming: Settings) => {
      // SKU counters only go up, even when an older copy of the settings is saved.
      const known = settingsRef.current.skuFormat.counters ?? {};
      const counters = { ...known, ...incoming.skuFormat.counters };
      for (const k of Object.keys(known)) counters[k] = Math.max(known[k], counters[k] ?? 0);
      const s = { ...incoming, skuFormat: { ...incoming.skuFormat, counters } };
      setSettings(s);
      store.saveSettings(s).catch(report);
    },
    [store],
  );

  // Stores the marketplace label PDF, then records it on the order.
  const attachLabel = useCallback(
    async (order: Order, file: File) => {
      try {
        await store.saveLabelPdf(order.id, file);
        saveOrders([{ ...order, label: { fileName: file.name, uploadedAt: new Date().toISOString() } }]);
      } catch (e) {
        report(e);
      }
    },
    [store, saveOrders],
  );

  const removeLabel = useCallback(
    async (order: Order) => {
      saveOrders([{ ...order, label: undefined }]);
      await store.deleteLabelPdf(order.id).catch(report);
    },
    [store, saveOrders],
  );

  const loadLabels = useCallback(
    async (list: Order[]) => {
      const entries = await Promise.all(
        list.filter((o) => o.label).map(async (o) => [o.id, await store.getLabelPdf(o.id)] as const),
      );
      return new Map(entries.filter((e): e is readonly [string, Blob] => !!e[1]));
    },
    [store],
  );

  const deleteOrdersAndLabels = useCallback(
    (ids: string[]) => {
      const withLabels = orders.filter((o) => ids.includes(o.id) && o.label).map((o) => o.id);
      deleteOrders(ids);
      withLabels.forEach((id) => store.deleteLabelPdf(id).catch(report));
    },
    [orders, deleteOrders, store],
  );

  // Every save is written to each item's history. With sync protection on, a save or delete that
  // would delist, mark sold, delete or overwrite many items at once is held back for review.
  const saveInventory = useCallback(
    (changed: InventoryItem[], source = "You", opts: { confirmed?: boolean } = {}) => {
      if (!changed.length) return;
      const prev = inventoryRef.current;
      const g = settingsRef.current.guardian;
      const risky = destructiveCount(prev, changed);
      if (g.protect && !opts.confirmed && risky >= g.threshold) {
        setPending({ kind: "save", items: changed, source, count: risky, at: new Date().toISOString() });
        return;
      }
      setInventory((p) => {
        const byId = new Map(changed.map((i) => [i.id, i]));
        const fresh = changed.filter((i) => !p.some((x) => x.id === i.id));
        return [...fresh, ...p.map((x) => byId.get(x.id) ?? x)];
      });
      store.saveInventory(changed).catch(report);
      store.addHistory(changesForSave(prev, changed, source)).catch(() => {});
    },
    [store],
  );

  const deleteInventory = useCallback(
    (ids: string[], source = "You", opts: { confirmed?: boolean } = {}) => {
      const gone = inventoryRef.current.filter((i) => ids.includes(i.id));
      if (!gone.length) return;
      const g = settingsRef.current.guardian;
      if (g.protect && !opts.confirmed && gone.length >= g.threshold) {
        setPending({ kind: "delete", ids, source, count: gone.length, at: new Date().toISOString() });
        return;
      }
      setInventory((prev) => prev.filter((i) => !ids.includes(i.id)));
      store.deleteInventory(ids).catch(report);
      store.addHistory(changesForDelete(gone, source)).catch(() => {});
    },
    [store],
  );

  // A dated copy of the whole inventory as it is right now.
  const backUp = useCallback(
    async (reason: string) => {
      const items = inventoryRef.current;
      const backup: InventoryBackup = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), reason, itemCount: items.length, items };
      await store.saveBackup(backup);
      return backup;
    },
    [store],
  );

  // Applies a held change, after backing up what's there now.
  const applyPending = useCallback(async () => {
    if (!pending) return;
    setPending(null);
    try {
      await backUp(`Before ${pending.source.toLowerCase()} changed ${pending.count} items`);
    } catch (e) {
      report(e);
      return;
    }
    if (pending.kind === "save") saveInventory(pending.items, pending.source, { confirmed: true });
    else deleteInventory(pending.ids, pending.source, { confirmed: true });
  }, [pending, backUp, saveInventory, deleteInventory]);

  // Puts items back as a backup had them. Backs up first, so a restore can be undone too.
  const restoreItems = useCallback(
    async (items: InventoryItem[]) => {
      await backUp("Before restore");
      saveInventory(items, "Restore", { confirmed: true });
    },
    [backUp, saveInventory],
  );

  // A daily backup, kept for 30 days, the first time the app opens each day.
  useEffect(() => {
    if (loading || !inventory.length || !settings.guardian.dailyBackup) return;
    let cancelled = false;
    store
      .listBackups()
      .then(async (list) => {
        if (cancelled || !needsDailyBackup(list.find((b) => b.reason === DAILY)?.createdAt)) return;
        await backUp(DAILY);
        await store.deleteBackups(backupsToPrune(await store.listBackups()));
      })
      .catch(() => {
        // Without the backups table (migration 0010) there's nothing to do; the Guardian page says so.
      });
    return () => {
      cancelled = true;
    };
    // Once per load; later inventory changes don't need another daily backup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, store]);

  // Remembers the highest automatic SKU number ever used, so it's never handed out again.
  useEffect(() => {
    if (loading) return;
    const f = settings.skuFormat;
    const key = cleanPrefix(f.prefix);
    const high = highestSkuNumber(inventory, f);
    if (high > (f.counters?.[key] ?? 0)) {
      const next = { ...settings, skuFormat: { ...f, counters: { ...f.counters, [key]: high } } };
      setSettings(next);
      store.saveSettings(next).catch(report);
    }
  }, [loading, inventory, settings, store]);

  const saveExpenses = useCallback(
    (changed: Expense[]) => {
      setExpenses((prev) => {
        const byId = new Map(changed.map((e) => [e.id, e]));
        const fresh = changed.filter((e) => !prev.some((p) => p.id === e.id));
        return [...fresh, ...prev.map((p) => byId.get(p.id) ?? p)].sort((a, b) => b.date.localeCompare(a.date));
      });
      store.saveExpenses(changed).catch(report);
    },
    [store],
  );

  const deleteExpenses = useCallback(
    (ids: string[]) => {
      setExpenses((prev) => prev.filter((e) => !ids.includes(e.id)));
      store.deleteExpenses(ids).catch(report);
    },
    [store],
  );

  // Sale detection: an order for an item's SKU marks it sold and takes down its other listings.
  useEffect(() => {
    if (loading || !inventory.length) return;
    const changed = applySales(inventory, orders, settings);
    if (changed.length) saveInventory(changed, "Sale detected");
  }, [loading, orders, inventory, settings, saveInventory]);

  return {
    orders,
    inventory,
    saveInventory,
    deleteInventory,
    pending,
    applyPending,
    discardPending: () => setPending(null),
    backUp,
    restoreItems,
    expenses,
    saveExpenses,
    deleteExpenses,
    settings,
    loading,
    error,
    clearError: () => setError(null),
    store,
    saveOrders,
    patchOrders,
    deleteOrders: deleteOrdersAndLabels,
    saveSettings,
    attachLabel,
    removeLabel,
    loadLabels,
  };
}

export type PendingChange =
  | { kind: "save"; items: InventoryItem[]; source: string; count: number; at: string }
  | { kind: "delete"; ids: string[]; source: string; count: number; at: string };
