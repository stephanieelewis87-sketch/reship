import { useCallback, useEffect, useState } from "react";
import type { Order, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import type { Store } from "./store";

// Loads orders and settings from the store and keeps the screen in step with every save.
export function useReshipData(store: Store) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([store.listOrders(), store.getSettings()])
      .then(([o, s]) => {
        if (cancelled) return;
        setOrders(o);
        setSettings(s);
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

  return { orders, settings, loading, error, clearError: () => setError(null), saveOrders, patchOrders, deleteOrders, saveSettings };
}
