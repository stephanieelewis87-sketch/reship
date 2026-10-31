import { useState } from "react";
import type { Order, PrintOptions } from "./types";
import type { useReshipData } from "./useReshipData";
import { buildPrintJob } from "./printJob";

export type PrintNotice = { text: string; ok: boolean };

// Combines the orders' label PDFs (and packing slips) into one file and opens it to print.
// First prints move orders from To Print to Printed; reprints leave the status alone.
export function usePrintLabels(data: ReturnType<typeof useReshipData>, onNotice: (n: PrintNotice) => void) {
  const { settings, loadLabels, patchOrders } = data;
  const [printing, setPrinting] = useState(false);
  const defaults: PrintOptions = { skuOnLabel: settings.printSkuOnLabel, packingSlip: settings.printPackingSlip };

  const print = async (chosen: Order[], opts: PrintOptions = defaults): Promise<boolean> => {
    if (!chosen.length) return false;
    // Open the tab right away, while the click still counts, so pop-up blockers allow it.
    const win = window.open("", "_blank");
    setPrinting(true);
    try {
      const labels = await loadLabels(chosen);
      const job = await buildPrintJob({ orders: chosen, labels, skuOnLabel: opts.skuOnLabel, packingSlip: opts.packingSlip, settings });
      if (job.pageCount === 0) {
        win?.close();
        onNotice({ text: "None of those orders has a label yet.", ok: false });
        return false;
      }
      const url = URL.createObjectURL(new Blob([job.pdf], { type: "application/pdf" }));
      if (win) win.location.href = url;
      else window.location.assign(url);
      const now = new Date().toISOString();
      if (job.printedOrderIds.length)
        patchOrders(job.printedOrderIds, (o) => ({ status: o.status === "pending" ? "printed" : o.status, printedAt: now }));
      const skipped = job.missingLabelIds.length + job.unreadableLabelIds.length;
      const verb = chosen.every((o) => o.status !== "pending") ? "Reprinting" : "Opened";
      onNotice(
        job.unreadableLabelIds.length
          ? { text: `${job.unreadableLabelIds.length} label file${job.unreadableLabelIds.length !== 1 ? "s" : ""} couldn't be read. Try uploading ${job.unreadableLabelIds.length !== 1 ? "them" : "it"} again.`, ok: false }
          : { text: `${verb} ${job.printedOrderIds.length} label${job.printedOrderIds.length !== 1 ? "s" : ""}${skipped ? `; ${skipped} order${skipped !== 1 ? "s" : ""} without a label stayed in To Print` : ""}.`, ok: true },
      );
      return true;
    } catch (e) {
      win?.close();
      onNotice({ text: `Couldn't prepare the labels: ${e instanceof Error ? e.message : e}`, ok: false });
      return false;
    } finally {
      setPrinting(false);
    }
  };

  return { print, printing, defaults };
}
