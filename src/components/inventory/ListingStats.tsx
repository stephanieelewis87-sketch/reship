import { useMemo, useState } from "react";
import { Eye, Heart, Upload } from "lucide-react";
import type { InventoryItem, Listing, Platform } from "@/lib/types";
import { STATS_SOURCE, applyStatsReport, compactCount, itemStats, parseEbayStatsReport, recordStats, watcherWord, WATCHER_WORD } from "@/lib/listingStats";
import { Modal, ModalHeader, PlatformIcon, inputClass, primaryButton, secondaryButton } from "../ui";

const name = (p: Platform) => (p === "WhatNot" ? "Whatnot" : p);
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const up = (n: number | undefined) => (n ? `${n > 0 ? "+" : ""}${n}` : "");

// The item's views and watchers across its marketplaces, as one small muted line. Nothing shows
// until some marketplace has numbers, so items without them stay as clean as before.
export function StatsChip({ item, onOpen }: { item: InventoryItem; onOpen: () => void }) {
  const s = itemStats(item);
  if (!s.rows.length) return null;
  const word = s.rows.length === 1 ? watcherWord(s.rows[0].listing.platform, s.watchers) : s.watchers === 1 ? "watcher" : "watchers";
  const title = s.rows
    .map((r) => `${name(r.listing.platform)}: ${[r.views != null ? `${r.views} views` : "", r.watchers != null ? `${r.watchers} ${watcherWord(r.listing.platform, r.watchers)}` : ""].filter(Boolean).join(", ")}`)
    .join("\n");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={`${s.views} views, ${s.watchers} ${word}. Open views and watchers`}
      className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground hover:text-foreground"
    >
      {s.hasViews && (
        <span className="inline-flex items-center gap-0.5">
          <Eye className="w-3 h-3" />
          {compactCount(s.views)}
        </span>
      )}
      {s.hasWatchers && (
        <span className="inline-flex items-center gap-0.5">
          <Heart className="w-3 h-3" />
          {compactCount(s.watchers)}
        </span>
      )}
    </button>
  );
}

const toNum = (v: string): number | undefined => {
  const t = v.replace(/[^0-9]/g, "");
  return t === "" ? undefined : Number(t);
};

// Each marketplace's views and watchers for one item, with the change since the last reading,
// where the numbers come from, and boxes to type them in.
export function StatsModal({
  item,
  today,
  onSave,
  onImport,
  onClose,
}: {
  item: InventoryItem;
  today: string;
  onSave: (item: InventoryItem) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const listings = item.listings;
  const [draft, setDraft] = useState(() => Object.fromEntries(listings.map((l) => [l.platform, { views: l.views?.toString() ?? "", watchers: l.watchers?.toString() ?? "" }])));
  const s = itemStats(item);
  const rowFor = (p: Platform) => s.rows.find((r) => r.listing.platform === p);
  const save = () => {
    const next: Listing[] = listings.map((l) => {
      const d = draft[l.platform];
      const views = toNum(d.views);
      const watchers = toNum(d.watchers);
      if (views === l.views && watchers === l.watchers) return l;
      // Clearing a box clears that number; the earlier reading stays in the history.
      const recorded = recordStats(l, { views, watchers }, today);
      return { ...recorded, views, watchers };
    });
    onSave({ ...item, listings: next, updatedAt: new Date().toISOString() });
  };

  return (
    <Modal label="Views and watchers" onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader title="Views and watchers" subtitle={item.title || "Untitled"} onClose={onClose} />
      <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto">
        {s.rows.length > 0 && (
          <p className="text-sm text-foreground">
            {s.hasViews && (
              <>
                <b className="tabular-nums">{s.views.toLocaleString()}</b> views
              </>
            )}
            {s.hasViews && s.hasWatchers && " · "}
            {s.hasWatchers && (
              <>
                <b className="tabular-nums">{s.watchers.toLocaleString()}</b> watching
              </>
            )}
            {s.since && (s.viewsUp !== 0 || s.watchersUp !== 0) && (
              <span className="text-muted-foreground">
                {" "}
                ({[s.viewsUp ? `${up(s.viewsUp)} views` : "", s.watchersUp ? `${up(s.watchersUp)} watching` : ""].filter(Boolean).join(", ")} since {shortDate(s.since)})
              </span>
            )}
          </p>
        )}
        {listings.length === 0 && <p className="text-sm text-muted-foreground">List this item on a marketplace first, then its views and watchers show here.</p>}
        <ul className="divide-y divide-border/60">
          {listings.map((l) => {
            const r = rowFor(l.platform);
            const d = draft[l.platform];
            return (
              <li key={l.platform} className="py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <PlatformIcon platform={l.platform} className="w-4 h-4" />
                  <span className="font-medium text-foreground flex-1">{name(l.platform)}</span>
                  {l.statsAt && <span className="text-[12px] text-muted-foreground">as of {shortDate(l.statsAt)}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[12px] text-muted-foreground space-y-0.5">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Views {r?.viewsUp ? <span className="text-emerald-700 dark:text-emerald-400">{up(r.viewsUp)}</span> : null}
                    </span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={d.views}
                      aria-label={`${name(l.platform)} views`}
                      onChange={(e) => setDraft({ ...draft, [l.platform]: { ...d, views: e.target.value } })}
                    />
                  </label>
                  <label className="text-[12px] text-muted-foreground space-y-0.5">
                    <span className="flex items-center gap-1 capitalize">
                      <Heart className="w-3 h-3" /> {WATCHER_WORD[l.platform].many}{" "}
                      {r?.watchersUp ? <span className="text-emerald-700 dark:text-emerald-400 normal-case">{up(r.watchersUp)}</span> : null}
                    </span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={d.watchers}
                      aria-label={`${name(l.platform)} ${WATCHER_WORD[l.platform].many}`}
                      onChange={(e) => setDraft({ ...draft, [l.platform]: { ...d, watchers: e.target.value } })}
                    />
                  </label>
                </div>
                <p className="text-[12px] text-muted-foreground">{STATS_SOURCE[l.platform]}</p>
                {l.platform === "eBay" && (
                  <button type="button" onClick={onImport} className="text-[12px] text-accent hover:underline inline-flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Import an eBay report for all items
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex justify-end gap-2 px-5 sm:px-6 py-3 border-t border-border">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={primaryButton} disabled={!listings.length} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}

// Brings in eBay's Seller Hub downloads and puts the views and watchers on the matching listings.
export function StatsImportModal({
  inventory,
  today,
  onApply,
  onClose,
}: {
  inventory: InventoryItem[];
  today: string;
  onApply: (changed: InventoryItem[], message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const parsed = useMemo(() => (text == null ? null : parseEbayStatsReport(text)), [text]);
  const result = useMemo(() => (parsed ? applyStatsReport(inventory, "eBay", parsed.rows, today) : null), [parsed, inventory, today]);
  const read = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
  };
  const what = parsed ? [parsed.hasViews ? "views" : "", parsed.hasWatchers ? "watchers" : ""].filter(Boolean).join(" and ") : "";

  return (
    <Modal label="Import eBay views and watchers" onClose={onClose}>
      <ModalHeader title="Import eBay views and watchers" subtitle="From eBay's own Seller Hub downloads" onClose={onClose} />
      <div className="px-5 sm:px-6 py-4 space-y-3 text-sm">
        <ol className="list-decimal pl-5 space-y-1 text-[13px] text-muted-foreground">
          <li>
            For views: in Seller Hub, open <b className="text-foreground">Performance, then Traffic</b>, and download the listings traffic report.
          </li>
          <li>
            For watchers: open <b className="text-foreground">Listings, then Active</b>, and download the list with the Watchers column.
          </li>
          <li>Pick either file here. Import the other one after to get both.</li>
        </ol>
        <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-border hover:border-accent cursor-pointer text-foreground">
          <Upload className="w-4 h-4" /> {fileName || "Choose a CSV file"}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void read(e.target.files?.[0])} />
        </label>
        {parsed && result && (
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-[13px] space-y-1">
            {parsed.rows.length === 0 ? (
              <p className="text-destructive">This file has no eBay item IDs with views or watchers. Check it's one of the two downloads above.</p>
            ) : (
              <>
                <p className="text-foreground">
                  {parsed.rows.length} eBay listings with {what}. {result.matched} match items in SellSync.
                </p>
                {result.unmatched.length > 0 && (
                  <p className="text-muted-foreground">
                    {result.unmatched.length} aren't linked to an item yet. Add the eBay item ID to the item's eBay listing (or open Guardian), then import again.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 sm:px-6 py-3 border-t border-border">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={!result?.changed.length}
          onClick={() => result && onApply(result.changed, `Updated eBay ${what} on ${result.matched} item${result.matched === 1 ? "" : "s"}.`)}
        >
          Import
        </button>
      </div>
    </Modal>
  );
}
