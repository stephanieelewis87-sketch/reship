import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, MapPin, Printer, ScanLine, X } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import { SKU_LABEL_SIZES, barRects, canEncode, labelsFor, skuLabelsPdf, type SkuLabelSize } from "@/lib/sku";
import { download } from "@/lib/guardian";
import { inputClass, primaryButton, secondaryButton, selectClass } from "../ui";

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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

// Makes a PDF of SKU barcode labels to stick on items or bags.
export function SkuLabelsModal({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const [size, setSize] = useState<SkuLabelSize>("roll");
  const [perUnit, setPerUnit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labels = useMemo(() => labelsFor(items, perUnit), [items, perUnit]);
  const skipped = items.filter((i) => !canEncode(i.sku.trim())).length;
  const first = labels[0];

  const make = async () => {
    setBusy(true);
    setErr(null);
    try {
      const bytes = await skuLabelsPdf(labels, size);
      download(`sku-labels-${new Date().toISOString().slice(0, 10)}.pdf`, bytes, "application/pdf");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Print SKU labels" onClose={onClose}>
      {first && (
        <div className="mx-auto w-56 border border-border rounded-md bg-white text-black p-2 text-center">
          <Barcode value={first.sku.trim()} className="w-full h-10" />
          <div className="font-mono font-bold text-xs mt-1">{first.sku}</div>
          <div className="text-[10px] truncate">{first.title}</div>
        </div>
      )}
      <label className="block text-xs space-y-1">
        <span className="text-muted-foreground">Label size</span>
        <select className={`${selectClass} w-full`} value={size} onChange={(e) => setSize(e.target.value as SkuLabelSize)}>
          {SKU_LABEL_SIZES.map((s) => (
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
        {skipped ? `. ${skipped} item${skipped > 1 ? "s" : ""} skipped: no SKU, or characters a barcode can't hold.` : "."} Any barcode scanner, or a phone camera, can read them back in Scan.
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

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

// Scan a SKU barcode with a USB or Bluetooth scanner (they type the code and press Enter), or
// with the camera on browsers that can read barcodes. Shows the item, and lets you set where it's
// stored straight away, so putting items away is scan, type the bin, scan the next.
export function ScanModal({ inventory, onClose, onOpen, onMove }: { inventory: InventoryItem[]; onClose: () => void; onOpen: (item: InventoryItem) => void; onMove: (item: InventoryItem, location: string) => void }) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<InventoryItem | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [moved, setMoved] = useState<string | null>(null);
  const [camera, setCamera] = useState<"off" | "on" | "unsupported">("off");
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cameraSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const lookup = (raw: string) => {
    const item = findByCode(inventory, raw);
    setFound(item ?? null);
    setMiss(item ? null : raw.trim());
    setLocation(item?.location ?? "");
    setMoved(null);
    setCode("");
  };

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    const detector = new Detector({ formats: ["code_128", "qr_code", "ean_13", "upc_a", "code_39"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        while (!stop) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            lookup(codes[0].rawValue);
            setCamera("off");
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      })
      .catch(() => setCamera("unsupported"));
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // lookup only reads inventory, which doesn't change while the camera is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  return (
    <Modal title="Scan an item" onClose={onClose}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(code);
        }}
      >
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input ref={input} className={`${inputClass} pl-9 font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type a SKU or listing ID" aria-label="SKU or listing ID" />
        </div>
        {cameraSupported && (
          <button type="button" className={`${secondaryButton} flex items-center gap-1.5`} onClick={() => setCamera(camera === "on" ? "off" : "on")}>
            <Camera className="w-4 h-4" /> {camera === "on" ? "Stop" : "Camera"}
          </button>
        )}
      </form>
      {camera === "on" && <video ref={video} className="w-full rounded-lg bg-black aspect-video object-cover" muted playsInline />}
      {camera === "unsupported" && <p className="text-xs text-muted-foreground">The camera didn't open. Allow camera access, or use a barcode scanner.</p>}
      {!cameraSupported && <p className="text-[12px] text-muted-foreground">Plug in any USB or Bluetooth barcode scanner and scan; it types the code for you. Camera scanning works in Chrome on Android and desktop.</p>}

      {miss && <p className="text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2">Nothing in Inventory has the code {miss}.</p>}
      {found && (
        <div className="border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-3">
            {found.photo ? <img src={found.photo} alt="" className="w-14 h-14 rounded-md object-cover" /> : <div className="w-14 h-14 rounded-md bg-muted" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{found.title || "Untitled"}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{found.sku}</span> · {found.status}
                {found.listPrice != null ? ` · $${found.listPrice}` : ""}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {found.location || "No location yet"}
              </div>
            </div>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onMove(found, location.trim());
              setFound({ ...found, location: location.trim() || undefined });
              setMoved(location.trim() ? `Moved to ${location.trim()}.` : "Location cleared.");
              input.current?.focus();
            }}
          >
            <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bin or shelf, e.g. Bin 4" aria-label="Location" />
            <button type="submit" className={secondaryButton}>
              Set
            </button>
            <button type="button" className={primaryButton} onClick={() => onOpen(found)}>
              Open
            </button>
          </form>
          {moved && <p className="text-xs text-emerald-700">{moved} Scan the next item.</p>}
        </div>
      )}
    </Modal>
  );
}
