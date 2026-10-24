import type { Order } from "./types";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Guess which order a label PDF belongs to from its file name (e.g. "label_PM-44821.pdf").
// Only orders still waiting to print are considered; the longest order number found wins.
export function matchLabelToOrder(fileName: string, orders: Order[]): Order | undefined {
  const name = squash(fileName.replace(/\.pdf$/i, ""));
  let best: Order | undefined;
  for (const o of orders) {
    if (o.status !== "pending") continue;
    const id = squash(o.orderId);
    if (id.length < 4 || !name.includes(id)) continue;
    if (!best || id.length > squash(best.orderId).length) best = o;
  }
  return best;
}
