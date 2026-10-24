import { useMemo, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import type { Order, Platform } from "@/lib/types";
import { ALL_PLATFORMS } from "@/lib/types";
import { CSV_FIELDS, guessMapping, parseCsv, rowsToOrders, type ColumnMapping, type CsvField } from "@/lib/csvImport";
import { Field, Modal, ModalHeader, SectionLabel, inputClass, primaryButton, secondaryButton, selectClass } from "./ui";

// Import sold orders from a marketplace's CSV export (Etsy, eBay, Mercari, Poshmark and others).
export function ImportCsvModal({
  existing,
  defaultCarrier,
  onClose,
  onImport,
}: {
  existing: Order[];
  defaultCarrier: string;
  onClose: () => void;
  onImport: (orders: Order[]) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("Etsy");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [error, setError] = useState("");

  const onFile = async (file: File) => {
    setError("");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length || !parsed.rows.length) {
      setError("That file has no rows we can read. Is it a CSV export?");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
  };

  const { fresh, duplicates } = useMemo(() => {
    if (!mapping.orderId || !mapping.itemName) return { fresh: [] as Order[], duplicates: 0 };
    const all = rowsToOrders(rows, mapping, platform, defaultCarrier);
    const seen = new Set(existing.map((o) => `${o.platform}|${o.orderId}`));
    const fresh = all.filter((o) => !seen.has(`${o.platform}|${o.orderId}`));
    return { fresh, duplicates: all.length - fresh.length };
  }, [rows, mapping, platform, defaultCarrier, existing]);

  const withAddress = fresh.filter((o) => o.shipTo).length;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" label="Import orders">
      <ModalHeader title="Import Orders" subtitle="From a marketplace CSV export" onClose={onClose} icon={<FileUp className="w-5 h-5 text-[#B5607A]" />} />

      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marketplace">
            <select className={inputClass} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              {[...ALL_PLATFORMS, "Other" as Platform].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="CSV file">
            <label className="flex items-center gap-2 w-full text-sm px-2.5 py-1.5 rounded-md border border-dashed border-[#B5607A]/50 bg-background cursor-pointer hover:bg-muted/50">
              <Upload className="w-3.5 h-3.5 text-[#B5607A] shrink-0" />
              <span className="truncate text-foreground">{fileName || "Choose file"}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </Field>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {headers.length > 0 && (
          <div className="space-y-3">
            <div>
              <SectionLabel>Match columns</SectionLabel>
              <p className="text-[11px] text-muted-foreground mt-1">We matched what we could. Rows with the same order number become one bundle.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {CSV_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground">
                    {f.label}
                    {"required" in f && f.required && <span className="text-[#B5607A]"> *</span>}
                  </span>
                  <select
                    className={`${selectClass} w-36`}
                    value={mapping[f.key as CsvField] ?? ""}
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
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
              {!mapping.orderId || !mapping.itemName ? (
                "Pick the order number and item name columns to continue."
              ) : (
                <>
                  {fresh.length} new order{fresh.length !== 1 ? "s" : ""} from {rows.length} row{rows.length !== 1 ? "s" : ""}, {withAddress} with an address.
                  {duplicates > 0 && ` ${duplicates} already in Reship will be skipped.`}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-t border-border">
        <button type="button" onClick={onClose} className={`flex-1 ${secondaryButton}`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={fresh.length === 0}
          onClick={() => {
            onImport(fresh);
            onClose();
          }}
          className={`flex-1 ${primaryButton}`}
        >
          Import {fresh.length || ""} order{fresh.length !== 1 ? "s" : ""}
        </button>
      </div>
    </Modal>
  );
}
