import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import type { Order } from "@/lib/types";
import { matchLabelToOrder } from "@/lib/labelMatch";
import { Modal, ModalHeader, primaryButton, secondaryButton, selectClass } from "./ui";

interface Pick {
  file: File;
  orderId: string; // Reship's order id, "" when not assigned
}

// Upload several marketplace label PDFs at once and pair each with its order.
export function UploadLabelsModal({
  orders,
  onClose,
  onAttach,
}: {
  orders: Order[];
  onClose: () => void;
  onAttach: (pairs: { order: Order; file: File }[]) => void;
}) {
  const pending = orders.filter((o) => o.status === "pending");
  const [picks, setPicks] = useState<Pick[]>([]);

  const addFiles = (files: FileList) => {
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    setPicks((prev) => {
      const taken = new Set(prev.map((p) => p.orderId).filter(Boolean));
      const next = [...prev];
      for (const file of pdfs) {
        const match = matchLabelToOrder(file.name, pending.filter((o) => !taken.has(o.id)));
        if (match) taken.add(match.id);
        next.push({ file, orderId: match?.id ?? "" });
      }
      return next;
    });
  };

  const assigned = picks.filter((p) => p.orderId);

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" label="Upload labels">
      <ModalHeader title="Upload Labels" subtitle="Label PDFs from your marketplaces" onClose={onClose} icon={<Upload className="w-5 h-5 text-[#B5607A]" />} />

      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
        <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B5607A]/50 bg-background py-6 cursor-pointer hover:bg-muted/50 text-center">
          <Upload className="w-5 h-5 text-[#B5607A]" />
          <span className="text-sm text-foreground">Choose label PDFs</span>
          <span className="text-[11px] text-muted-foreground px-6">Files with the order number in their name are matched automatically</span>
          <input type="file" multiple accept="application/pdf,.pdf" className="sr-only" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </label>

        {picks.length > 0 && (
          <div className="divide-y divide-border border border-border rounded-lg">
            {picks.map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-foreground truncate flex-1 min-w-0">{p.file.name}</p>
                <select
                  aria-label={`Order for ${p.file.name}`}
                  className={`${selectClass} w-44`}
                  value={p.orderId}
                  onChange={(e) => setPicks((prev) => prev.map((x, idx) => (idx === i ? { ...x, orderId: e.target.value } : x)))}
                >
                  <option value="">Pick an order…</option>
                  {pending.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderId} · {o.items[0]?.name}
                      {o.label ? " (has label)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-t border-border">
        <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={assigned.length === 0}
          onClick={() => {
            onAttach(assigned.map((p) => ({ order: pending.find((o) => o.id === p.orderId)!, file: p.file })));
            onClose();
          }}
          className={`flex-1 ${primaryButton}`}
        >
          Attach {assigned.length || ""} label{assigned.length !== 1 ? "s" : ""}
        </button>
      </div>
    </Modal>
  );
}
