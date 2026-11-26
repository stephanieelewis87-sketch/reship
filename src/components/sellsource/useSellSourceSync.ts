import { useEffect, useRef } from "react";
import type { useReshipData } from "@/lib/useReshipData";
import { withSellSource } from "./SellSourcePage";

type Data = ReturnType<typeof useReshipData>;

// SellSource is the one marketplace SellSync can take a listing down on by itself. When an item
// sells somewhere else (or is deleted), its SellSource listing comes down right away, so nobody
// can buy something that's already gone.
export function useSellSourceSync(data: Data, on: boolean) {
  const { inventory, loading, store, saveInventory } = data;
  const running = useRef(false);
  // Only items marked active on SellSource but no longer for sale need a look.
  const stale = inventory.filter((i) => i.status === "sold" && i.listings.some((l) => l.platform === "SellSource" && l.status === "active"));
  const key = stale.map((i) => i.id).join(",");

  useEffect(() => {
    if (!on || loading || !stale.length || running.current) return;
    running.current = true;
    store.sellsource
      .unpublish(stale.map((i) => i.id))
      .then(() => saveInventory(stale.map((i) => withSellSource(i, null)), "Sold elsewhere", { confirmed: true }))
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, loading, key]);
}
