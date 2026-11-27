import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, MapPin, Package, Printer, ScanLine, Tag } from "lucide-react";
import type { InventoryItem, SkuFormat } from "@/lib/types";
import { STICKER_SIZES, binSticker, binsOf, blankSticker, markOneSold, readScan, reserveSkus, stickersPdf, type StickerSize } from "@/lib/stickers";
import { download } from "@/lib/guardian";
import { newId } from "@/lib/ids";
import { shrinkImage } from "@/lib/videoFrames";
import { Modal, QrCode, findByCode } from "./SkuTools";
import { cameraAvailable, useCameraScan } from "./useCameraScan";
import { inputClass, primaryButton, secondaryButton, selectClass } from "../ui";

const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;

function ItemSummary({ item }: { item: InventoryItem }) {
  return (
    <div className="flex items-center gap-3">
      {item.photo ? <img src={item.photo} alt="" className="w-14 h-14 rounded-md object-cover" /> : <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{item.title || "Untitled"}</div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{item.sku}</span>
          {item.size ? ` · Size ${item.size}` : ""}
          {item.cost != null ? ` · paid ${money(item.cost)}` : ""}
          {(item.quantity ?? 1) > 1 ? ` · ${item.quantity} in stock` : ""}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {item.location || "No bin yet"}
        </div>
      </div>
    </div>
  );
}

// Scan a QR sticker or barcode with the phone camera, a USB scanner or by typing it.
//  - A sticker that isn't on an item yet: add the item there and then (photo, cost, size, bin).
//  - An item's sticker: see it, move it to a bin, mark it sold, or open it.
//  - A bin sticker while an item is showing: moves the item into that bin. With no item showing,
//    it opens the list of what's in the bin.
export function ScanModal({
  inventory,
  today,
  initialCode,
  onClose,
  onOpen,
  onSave,
  onShowBin,
  savePhoto,
}: {
  inventory: InventoryItem[];
  today: string;
  initialCode?: string;
  onClose: () => void;
  onOpen: (item: InventoryItem) => void;
  onSave: (items: InventoryItem[]) => void;
  onShowBin: (bin: string) => void;
  savePhoto: (dataUrl: string) => Promise<string>;
}) {
  const [code, setCode] = useState("");
  // The item on screen is looked up by id, so it shows each change as soon as it's saved.
  const [foundId, setFoundId] = useState<string | null>(null);
  const found = inventory.find((i) => i.id === foundId) ?? null;
  const [newCode, setNewCode] = useState<string | null>(null);
  const [bin, setBin] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [lastBin, setLastBin] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const live = useRef({ found, newCode });
  live.current = { found, newCode };

  const show = (item: InventoryItem | null, fresh: string | null, msg: string | null = null) => {
    setFoundId(item?.id ?? null);
    setNewCode(fresh);
    setBin(item?.location ?? "");
    setNote(msg);
    setCode("");
  };

  const moveTo = (item: InventoryItem, where: string) => {
    onSave([{ ...item, location: where || undefined, updatedAt: new Date().toISOString() }]);
    setBin(where);
    if (where) setLastBin(where);
    setNote(where ? `Moved to ${where}.` : "Bin cleared.");
  };

  const handle = (raw: string) => {
    const s = readScan(raw);
    if (!s) return;
    const { found: current, newCode: adding } = live.current;
    if (s.kind === "bin") {
      if (current) moveTo(current, s.bin);
      else if (adding) {
        setLastBin(s.bin);
        setNote(`Bin set to ${s.bin}.`);
      } else {
        onShowBin(s.bin);
        onClose();
      }
      return;
    }
    const item = findByCode(inventory, s.code);
    if (item) show(item, null);
    else show(null, s.code);
  };

  useEffect(() => {
    if (initialCode) handle(initialCode);
    else input.current?.focus();
    // Runs once, for the sticker link the modal was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { video, state } = useCameraScan(camera, handle);
  const sold = found?.status === "sold";

  return (
    <Modal title="Scan" onClose={onClose}>
      {cameraAvailable() && (
        <div className="space-y-2">
          {camera ? (
            <div className="relative">
              <video ref={video} className="w-full rounded-lg bg-black aspect-[4/3] object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-1/2 aspect-square rounded-xl border-2 border-white/80" />
              </div>
              {state === "starting" && <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white">Opening the camera…</p>}
            </div>
          ) : (
            <button type="button" className={`${primaryButton} w-full flex items-center justify-center gap-2 py-3`} onClick={() => setCamera(true)}>
              <Camera className="w-4 h-4" /> Scan with camera
            </button>
          )}
          {state === "blocked" && <p className="text-xs text-amber-800">The camera didn't open. Allow camera access for this site in your browser settings, then try again.</p>}
          {camera && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setCamera(false)}>
              Turn camera off
            </button>
          )}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handle(code);
        }}
      >
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input ref={input} className={`${inputClass} pl-9 font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or type a SKU, or use a USB scanner" aria-label="SKU or listing ID" />
        </div>
        <button type="submit" className={secondaryButton} disabled={!code.trim()}>
          Find
        </button>
      </form>

      {newCode && (
        <QuickAdd
          key={newCode}
          code={newCode}
          today={today}
          defaultBin={lastBin}
          savePhoto={savePhoto}
          onAdd={(item) => {
            onSave([item]);
            if (item.location) setLastBin(item.location);
            show(item, null, `Added ${item.title || item.sku}${item.location ? ` to ${item.location}` : ""}. Scan the next sticker.`);
          }}
        />
      )}

      {found && (
        <div className="border border-border rounded-lg p-3 space-y-3">
          <ItemSummary item={found} />
          {sold ? (
            <p className="text-sm text-emerald-700 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Sold{found.soldAt ? ` on ${found.soldAt}` : ""}.
            </p>
          ) : (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  moveTo(found, bin.trim());
                }}
              >
                <input className={inputClass} value={bin} onChange={(e) => setBin(e.target.value)} placeholder="Bin or shelf, e.g. Bin 4" aria-label="Bin" />
                <button type="submit" className={secondaryButton}>
                  Move
                </button>
              </form>
              <p className="text-[12px] text-muted-foreground">Or scan a bin sticker to move it there.</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!sold && (
              <button
                type="button"
                className={`${primaryButton} flex items-center gap-1.5`}
                onClick={() => {
                  const next = markOneSold(found, today);
                  onSave([next]);
                  setNote(next.status === "sold" ? "Marked sold." : `One marked sold. ${next.quantity} left.`);
                }}
              >
                <Tag className="w-4 h-4" /> Mark sold
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => onOpen(found)}>
              Open item
            </button>
            {found.location && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  onShowBin(found.location!);
                  onClose();
                }}
              >
                See {found.location}
              </button>
            )}
          </div>
        </div>
      )}
      {note && <p className="text-xs text-emerald-700">{note}</p>}
      {!newCode && !found && (
        <p className="text-[12px] text-muted-foreground">Scan a sticker to add a new item, find one you have, move it to a bin, or mark it sold. Your phone's camera app can scan stickers too.</p>
      )}
    </Modal>
  );
}

// The quick form for a sticker that isn't on an item yet.
function QuickAdd({ code, today, defaultBin, savePhoto, onAdd }: { code: string; today: string; defaultBin: string; savePhoto: (d: string) => Promise<string>; onAdd: (item: InventoryItem) => void }) {
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [size, setSize] = useState("");
  const [bin, setBin] = useState(defaultBin);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setBin((b) => b || defaultBin), [defaultBin]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const local = URL.createObjectURL(file);
    try {
      setPhoto(await savePhoto(await shrinkImage(local, 1600)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      URL.revokeObjectURL(local);
      setBusy(false);
    }
  };

  const costNum = cost.trim() ? Number(cost.replace(/[$,]/g, "")) : undefined;
  const costBad = costNum != null && (!Number.isFinite(costNum) || costNum < 0);

  return (
    <form
      className="border border-accent/40 bg-accent/5 rounded-lg p-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (costBad || busy) return;
        const now = new Date().toISOString();
        onAdd({
          id: newId(),
          sku: code.trim(),
          title: title.trim(),
          size: size.trim() || undefined,
          cost: costNum,
          location: bin.trim() || undefined,
          photo: photo ?? undefined,
          photos: photo ? [photo] : undefined,
          status: "draft",
          listings: [],
          quantity: 1,
          labels: [],
          purchasedAt: today,
          createdAt: now,
          updatedAt: now,
        });
      }}
    >
      <div>
        <p className="text-sm font-medium">New sticker: add this item</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{code}</span> isn't on an item yet.
        </p>
      </div>
      <div className="flex gap-3">
        <label className="w-20 h-20 shrink-0 rounded-md border border-dashed border-border bg-card flex items-center justify-center cursor-pointer overflow-hidden" aria-label="Add a photo">
          {busy ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <div className="flex-1 space-y-2">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? e.g. Levi's denim jacket" aria-label="What is it" autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="You paid $" inputMode="decimal" aria-label="What you paid" />
            <input className={inputClass} value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" aria-label="Size" />
          </div>
        </div>
      </div>
      <input className={inputClass} value={bin} onChange={(e) => setBin(e.target.value)} placeholder="Bin or shelf, e.g. Bin 4" aria-label="Bin" />
      {costBad && <p className="text-xs text-destructive">Enter what you paid as a number, like 8 or 8.50.</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button type="submit" className={`${primaryButton} w-full`} disabled={busy || costBad}>
        Add item
      </button>
    </form>
  );
}

// A sheet of blank QR stickers, each holding a new SKU saved for it. Stick one on, scan it, add the item.
export function BlankStickersModal({ inventory, skuFormat, onReserve, onClose }: { inventory: InventoryItem[]; skuFormat: SkuFormat; onReserve: (f: SkuFormat) => void; onClose: () => void }) {
  const [size, setSize] = useState<StickerSize>("sheet");
  const [count, setCount] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const preview = useMemo(() => reserveSkus(inventory, skuFormat, Math.max(1, count)), [inventory, skuFormat, count]);
  const first = preview.skus[0];
  const lastSku = preview.skus[preview.skus.length - 1];

  const make = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { skus, skuFormat: next } = reserveSkus(inventory, skuFormat, count);
      const bytes = await stickersPdf(skus.map((s) => blankSticker(s)), size);
      // Saved before the download, so these numbers are never given to another item.
      onReserve(next);
      download(`blank-stickers-${skus[0]}-to-${skus[skus.length - 1]}.pdf`, bytes, "application/pdf");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Print blank QR stickers" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Print a sheet of stickers before you have the items. Stick one on each new find, scan it, and add the photo, cost, size and bin right there.
      </p>
      {first && (
        <div className="mx-auto w-60 border border-border rounded-md bg-white text-black p-2 flex items-center gap-2">
          <QrCode value={blankSticker(first).link} className="w-16 h-16 shrink-0" />
          <div className="min-w-0">
            <div className="font-mono font-bold text-sm">{first}</div>
            <div className="text-[10px]">Scan to add this item</div>
          </div>
        </div>
      )}
      <label className="block text-xs space-y-1">
        <span className="text-muted-foreground">Label paper</span>
        <select
          className={`${selectClass} w-full`}
          value={size}
          onChange={(e) => {
            const s = e.target.value as StickerSize;
            setSize(s);
            if (s === "sheet") setCount((c) => Math.max(30, Math.ceil(c / 30) * 30));
          }}
        >
          {STICKER_SIZES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs space-y-1">
        <span className="text-muted-foreground">How many</span>
        <select className={`${selectClass} w-full`} value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {(size === "sheet" ? [30, 60, 90, 120] : [10, 25, 50, 100]).map((n) => (
            <option key={n} value={n}>
              {n} stickers{size === "sheet" ? ` (${n / 30} sheet${n > 30 ? "s" : ""})` : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[12px] text-muted-foreground">
        These will be {first} to {lastSku}. Hubby saves those numbers so no other item gets them. Print at 100% size ("Actual size"), not "Fit to page".
      </p>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={`${primaryButton} flex items-center gap-1.5`} disabled={busy} onClick={() => void make()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Make PDF
        </button>
      </div>
    </Modal>
  );
}

// Every bin with what's in it. Tap one to see its items; print stickers for the bins themselves.
export function BinsModal({ inventory, onShowBin, onRename, onClose }: { inventory: InventoryItem[]; onShowBin: (bin: string) => void; onRename: (from: string, to: string) => void; onClose: () => void }) {
  const bins = useMemo(() => binsOf(inventory), [inventory]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBin, setNewBin] = useState("");

  const printBins = async (names: string[]) => {
    setBusy(true);
    try {
      const bytes = await stickersPdf(names.map((b) => binSticker(b)), "sheet");
      download(`bin-stickers-${new Date().toISOString().slice(0, 10)}.pdf`, bytes, "application/pdf");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Bins" onClose={onClose}>
      {bins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bins yet. Give an item a bin when you add it or scan it, and it shows up here.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg max-h-[45vh] overflow-y-auto">
          {bins.map(({ bin, count }) => (
            <li key={bin} className="px-3 py-2">
              {renaming === bin ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (to.trim() && to.trim() !== bin) onRename(bin, to.trim());
                    setRenaming(null);
                  }}
                >
                  <input className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label={`New name for ${bin}`} autoFocus />
                  <button type="submit" className={secondaryButton}>
                    Save
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      onShowBin(bin);
                      onClose();
                    }}
                  >
                    <span className="block text-sm font-medium truncate">{bin}</span>
                    <span className="block text-xs text-muted-foreground">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setRenaming(bin);
                      setTo(bin);
                    }}
                  >
                    Rename or move all
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Bin stickers: scan one to see what's inside, or scan an item and then a bin to move the item there.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const names = newBin
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (names.length) void printBins(names);
          }}
        >
          <input className={inputClass} value={newBin} onChange={(e) => setNewBin(e.target.value)} placeholder="New bins, e.g. Bin 7, Bin 8" aria-label="New bin names" />
          <button type="submit" className={secondaryButton} disabled={busy || !newBin.trim()}>
            Print
          </button>
        </form>
        {bins.length > 0 && (
          <button type="button" className={`${secondaryButton} w-full flex items-center justify-center gap-1.5`} disabled={busy} onClick={() => void printBins(bins.map((b) => b.bin))}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Print stickers for all {bins.length} bins
          </button>
        )}
      </div>
    </Modal>
  );
}
