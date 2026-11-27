import { useMemo, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import { SKU_LABEL_SIZES, barRects, canEncode, labelsFor, skuLabelsPdf, type SkuLabelSize } from "@/lib/sku";
import { download } from "@/lib/guardian";
import { STICKER_SIZES, itemSticker, qrMatrix, stickersPdf, type StickerSize } from "@/lib/stickers";
import { primaryButton, secondaryButton, selectClass } from "../ui";

// A Code 128 barcode for a SKU, drawn as SVG.
export function Barcode({ value, height = 40, className = "" }: { value: string; height?: number; className?: string }) {
  if (!canEncode(value)) return null;
  const { bars, modules } = barRects(value);
  return (
    <svg viewBox={`-8 0 ${modules + 16} ${height}`} preserveAspectRatio="none" className={className} role="img" aria-label={`Barcode for ${value}`} style={{ background: "#fff" }}>
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={height} fill="#000" />
      ))}
    </svg>
  );
}

// A QR code drawn as SVG.
export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const n = m.length;
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className={className} role="img" aria-label="QR code" style={{ background: "#fff" }} shapeRendering="crispEdges">
      {m.flatMap((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000" /> : null)))}
    </svg>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-card w-full max-w-md rounded-t-xl sm:rounded-xl border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// Makes a PDF of labels to stick on items or bags: QR stickers any phone can scan, or Code 128
// barcodes for USB scanners.
export function SkuLabelsModal({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const [style, setStyle] = useState<"qr" | "barcode">("qr");
  const [size, setSize] = useState<SkuLabelSize | StickerSize>("sheet");
  const [perUnit, setPerUnit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labels = useMemo(() => labelsFor(items, perUnit), [items, perUnit]);
  const skipped = items.filter((i) => !canEncode(i.sku.trim())).length;
  const first = labels[0];
  const sizes = style === "qr" ? STICKER_SIZES : SKU_LABEL_SIZES;

  const make = async () => {
    setBusy(true);
    setErr(null);
    try {
      const bytes = style === "qr" ? await stickersPdf(labels.map((i) => itemSticker(i)), size) : await skuLabelsPdf(labels, size);
      download(`${style === "qr" ? "qr-stickers" : "sku-labels"}-${new Date().toISOString().slice(0, 10)}.pdf`, bytes, "application/pdf");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Print item stickers" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sticker style">
        {(
          [
            ["qr", "QR sticker", "Any phone camera can scan it"],
            ["barcode", "Barcode", "For a USB or Bluetooth scanner"],
          ] as const
        ).map(([k, t, hint]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={style === k}
            onClick={() => setStyle(k)}
            className={`text-left rounded-lg border px-3 py-2 ${style === k ? "border-accent bg-accent/5" : "border-border"}`}
          >
            <span className="block text-sm font-medium">{t}</span>
            <span className="block text-[12px] text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      {first &&
        (style === "qr" ? (
          <div className="mx-auto w-60 border border-border rounded-md bg-white text-black p-2 flex items-center gap-2">
            <QrCode value={itemSticker(first).link} className="w-16 h-16 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono font-bold text-sm">{first.sku}</div>
              <div className="text-[10px] truncate">{first.title}</div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-56 border border-border rounded-md bg-white text-black p-2 text-center">
            <Barcode value={first.sku.trim()} className="w-full h-10" />
            <div className="font-mono font-bold text-xs mt-1">{first.sku}</div>
            <div className="text-[10px] truncate">{first.title}</div>
          </div>
        ))}
      <label className="block text-xs space-y-1">
        <span className="text-muted-foreground">Label paper</span>
        <select className={`${selectClass} w-full`} value={size} onChange={(e) => setSize(e.target.value as SkuLabelSize)}>
          {sizes.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={perUnit} onChange={(e) => setPerUnit(e.target.checked)} />
        One label for each one in stock
      </label>
      <p className="text-[12px] text-muted-foreground">
        {labels.length} label{labels.length !== 1 ? "s" : ""}
        {skipped ? `. ${skipped} item${skipped > 1 ? "s" : ""} skipped: no SKU, or characters a label can't hold.` : "."} Scan them back with Scan in Inventory.
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={`${primaryButton} flex items-center gap-1.5`} disabled={!labels.length || busy} onClick={() => void make()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Make PDF
        </button>
      </div>
    </Modal>
  );
}

// Finds an item by SKU or marketplace listing ID.
export function findByCode(inventory: InventoryItem[], code: string): InventoryItem | undefined {
  const c = code.trim().toLowerCase();
  if (!c) return undefined;
  return inventory.find((i) => i.sku.trim().toLowerCase() === c) ?? inventory.find((i) => i.listings.some((l) => l.listingId?.trim().toLowerCase() === c));
}
