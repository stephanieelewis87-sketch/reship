import { useCallback, useEffect, useState } from "react";
import type { Expense, InventoryItem, Order, Settings } from "./types";
import { applySales } from "./inventory";
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
    (s: Settings) => {
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

  const saveInventory = useCallback(
    (changed: InventoryItem[]) => {
      setInventory((prev) => {
        const byId = new Map(changed.map((i) => [i.id, i]));
        const fresh = changed.filter((i) => !prev.some((p) => p.id === i.id));
        return [...fresh, ...prev.map((p) => byId.get(p.id) ?? p)];
      });
      store.saveInventory(changed).catch(report);
    },
    [store],
  );

  const deleteInventory = useCallback(
    (ids: string[]) => {
      setInventory((prev) => prev.filter((i) => !ids.includes(i.id)));
      store.deleteInventory(ids).catch(report);
    },
    [store],
  );

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
    if (changed.length) saveInventory(changed);
  }, [loading, orders, inventory, settings, saveInventory]);

  return {
    orders,
    inventory,
    saveInventory,
    deleteInventory,
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
