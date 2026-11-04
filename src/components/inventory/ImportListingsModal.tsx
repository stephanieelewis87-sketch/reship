import { useMemo, useState } from "react";
import { Download, Link2, Upload } from "lucide-react";
import type { InventoryItem, Platform, SkuFormat } from "@/lib/types";
import { ALL_PLATFORMS } from "@/lib/types";
import { MARKETPLACES } from "@/lib/marketplaces";
import { IMPORT_HOW, LISTING_CSV_FIELDS, guessListingMapping, linksToItems, parseCsv, rowsToItems, type ImportResult, type ListingCsvField, type ListingMapping } from "@/lib/listingImport";
import { Field, Modal, ModalHeader, SectionLabel, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";

// Brings listings a seller already has on their marketplaces into inventory: by pasting listing
// links (any marketplace) or by uploading a marketplace's listings spreadsheet.
export function ImportListingsModal({
  existing,
  skuFormat,
  onClose,
  onImport,
}: {
  existing: InventoryItem[];
  skuFormat?: SkuFormat;
  onClose: () => void;
  onImport: (items: InventoryItem[], summary: string) => void;
}) {
  const [mode, setMode] = useState<"links" | "sheet">("links");
  const [links, setLinks] = useState("");
  const [platform, setPlatform] = useState<Platform>("eBay");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ListingMapping>({});
  const [error, setError] = useState("");

  const onFile = async (file: File) => {
    setError("");
    const parsed = parseCsv(await file.text());
    if (!parsed.headers.length || !parsed.rows.length) {
      setError("That file has no rows SellSync can read. Is it a CSV export?");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessListingMapping(parsed.headers));
  };

  const result: ImportResult | null = useMemo(() => {
    if (mode === "links") return links.trim() ? linksToItems(links, existing, skuFormat) : null;
    return mapping.title && rows.length ? rowsToItems(rows, mapping, platform, existing, skuFormat) : null;
  }, [mode, links, rows, mapping, platform, existing, skuFormat]);

  const count = result ? result.added + result.linked : 0;
  const summary = (r: ImportResult) =>
    [
      r.added && `${r.added} new item${r.added !== 1 ? "s" : ""}`,
      r.linked && `${r.linked} linked to items you already had (same SKU)`,
      r.skipped && `${r.skipped} already in SellSync, skipped`,
    ]
      .filter(Boolean)
      .join(", ");

  const tab = (m: typeof mode, label: string, Icon: typeof Link2) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${mode === m ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" label="Import listings">
      <ModalHeader title="Import listings" subtitle="Bring in what you already have listed" onClose={onClose} icon={<Download className="w-5 h-5 text-accent" />} />

      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
        <div className="flex gap-1 p-1 rounded-lg bg-muted">
          {tab("links", "Paste links", Link2)}
          {tab("sheet", "Spreadsheet", Upload)}
        </div>

        {mode === "links" ? (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              One listing link per line, from any mix of marketplaces: {ALL_PLATFORMS.filter((p) => p !== "Shopify").map((p) => MARKETPLACES[p].name).join(", ")}. Each one comes in as an item listed there, ready for you to add its title, price and photos.
            </p>
            <textarea
              className={`${inputClass} font-mono text-xs h-40`}
              placeholder={"https://poshmark.com/listing/Levis-501-65a1b2c3d4\nhttps://offerup.com/item/detail/1234567890"}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              aria-label="Listing links, one per line"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marketplace">
                <select className={inputClass} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                  {[...ALL_PLATFORMS, "Other" as Platform].map((p) => (
                    <option key={p} value={p}>
                      {MARKETPLACES[p].name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CSV file">
                <label className="flex items-center gap-2 w-full text-sm px-2.5 py-1.5 rounded-md border border-dashed border-accent/50 bg-background cursor-pointer hover:bg-muted/50">
                  <Upload className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate text-foreground">{fileName || "Choose file"}</span>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                </label>
              </Field>
            </div>
            {IMPORT_HOW[platform] && <p className="text-[12px] text-muted-foreground">{IMPORT_HOW[platform]}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {headers.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Match columns</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {LISTING_CSV_FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-foreground">
                        {f.label}
                        {"required" in f && f.required && <span className="text-accent"> *</span>}
                      </span>
                      <select
                        className={`${selectClass} w-36`}
                        value={mapping[f.key as ListingCsvField] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                      >
                        <option value="">—</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground space-y-1">
            <p>{summary(result) || "Nothing new to import."}</p>
            {result.problems.length > 0 && (
              <ul className="text-destructive list-disc pl-4 space-y-0.5">
                {result.problems.slice(0, 8).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {result.problems.length > 8 && <li>and {result.problems.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}
        {mode === "sheet" && headers.length > 0 && !mapping.title && <p className="text-xs text-muted-foreground">Pick the title column to continue.</p>}
      </div>

      <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-t border-border">
        <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!count}
          onClick={() => result && (onImport(result.items, `Imported listings: ${summary(result)}.`), onClose())}
          className={`flex-1 ${primaryButton}`}
        >
          Import {count || ""} listing{count !== 1 ? "s" : ""}
        </button>
      </div>
    </Modal>
  );
}
