import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Camera, Car, Download, Loader2, Paperclip, Plus, Receipt, Trash2, X } from "lucide-react";
import type { Expense, Settings } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { type DateRange, type SaleLine, shortDate } from "@/lib/analytics";
import { DEFAULT_MILEAGE_RATE, mileageRateOf, scheduleC, scheduleCRows, taxYears } from "@/lib/money";
import { shrinkImage } from "@/lib/videoFrames";
import { inputClass, primaryButton, secondaryButton } from "../ui";
import { InlineBar, fmtMoney } from "./charts";
import { Card, Kpi, SortTable } from "./parts";

export interface ReceiptStore {
  save: (dataUrl: string) => Promise<string>;
  url: (ref: string) => Promise<string>;
}

export interface MoneyCtx {
  today: string;
  range: DateRange;
  expenses: Expense[]; // in the chosen period
  allExpenses: Expense[];
  everyLine: SaleLine[]; // every sale, with no filters, for taxes
  settings: Settings;
  saveSettings: (s: Settings) => void;
  saveExpenses: (items: Expense[]) => void;
  deleteExpenses: (ids: string[]) => void;
  receipts: ReceiptStore;
}

const sumExpenses = (list: Expense[]) => list.reduce((a, e) => a + e.amount, 0);
const rangeText = (r: DateRange) => `${shortDate(r.start)} – ${shortDate(r.end)}`;

// Takes a photo (or picks an image), shrinks it to a readable receipt size and stores it.
async function storeReceipt(file: File, receipts: ReceiptStore): Promise<string> {
  const local = URL.createObjectURL(file);
  try {
    return await receipts.save(await shrinkImage(local, 1400));
  } finally {
    URL.revokeObjectURL(local);
  }
}

function ReceiptButton({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <label className={`${secondaryButton} inline-flex items-center justify-center gap-1.5 cursor-pointer`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function ReceiptViewer({ refValue, receipts, onClose }: { refValue: string; receipts: ReceiptStore; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    receipts.url(refValue).then(setSrc, (e: Error) => setErr(e.message));
  }, [refValue, receipts]);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Receipt" className="relative bg-card rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto p-3">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2 right-2 p-1.5 rounded-md bg-card/90 hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
        {err ? <p className="text-sm text-destructive p-4">{err}</p> : src ? <img src={src} alt="Receipt" className="w-full rounded-md" /> : <Loader2 className="w-5 h-5 animate-spin m-8 mx-auto" />}
      </div>
    </div>
  );
}

export function ExpensesPage({ ctx }: { ctx: MoneyCtx }) {
  const [kind, setKind] = useState<"expense" | "trip">("expense");
  const [date, setDate] = useState(ctx.today);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[1]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [miles, setMiles] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // "new" or an expense id
  const [err, setErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editRate, setEditRate] = useState(false);
  const rate = mileageRateOf(ctx.settings);
  const [rateText, setRateText] = useState(rate.toFixed(2));

  const total = sumExpenses(ctx.expenses);
  const cats = EXPENSE_CATEGORIES.map((c) => ({ c, v: sumExpenses(ctx.expenses.filter((e) => e.category === c)) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...cats.map((c) => c.v));
  const tripMiles = (parseFloat(miles) || 0) * (roundTrip ? 2 : 1);
  const tripAmount = Math.round(tripMiles * rate * 100) / 100;
  const missingReceipts = ctx.expenses.filter((e) => e.category !== "Mileage" && !e.receipt).length;

  const attach = async (file: File, to: string) => {
    setBusy(to);
    setErr(null);
    try {
      const ref = await storeReceipt(file, ctx.receipts);
      if (to === "new") setReceipt(ref);
      else {
        const e = ctx.allExpenses.find((x) => x.id === to);
        if (e) ctx.saveExpenses([{ ...e, receipt: ref }]);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addExpense = () => {
    const value = parseFloat(amount.replace(/[$,]/g, "")) || 0;
    if (value <= 0) return setErr("Enter how much it cost, like 12.50.");
    ctx.saveExpenses([{ id: crypto.randomUUID(), date, category, amount: value, note: note.trim() || undefined, receipt: receipt ?? undefined }]);
    setAmount("");
    setNote("");
    setReceipt(null);
    setErr(null);
  };

  const addTrip = () => {
    if (tripMiles <= 0) return setErr("Enter the miles you drove, like 14.");
    const n = [where.trim(), roundTrip ? "round trip" : ""].filter(Boolean).join(", ");
    ctx.saveExpenses([{ id: crypto.randomUUID(), date, category: "Mileage", amount: tripAmount, miles: tripMiles, note: n || undefined }]);
    setMiles("");
    setWhere("");
    setErr(null);
  };

  const saveRate = () => {
    const r = parseFloat(rateText);
    if (!(r > 0 && r < 5)) return setErr("Enter the rate in dollars a mile, like 0.70.");
    ctx.saveSettings({ ...ctx.settings, mileageRate: Math.round(r * 1000) / 1000 });
    setEditRate(false);
    setErr(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Add an expense or a trip" subtitle="Costs that aren't tied to one item, and the miles you drive to source">
          <div className="flex gap-2 mb-3" role="radiogroup" aria-label="What to add">
            {(
              [
                ["expense", "Expense", Receipt],
                ["trip", "Sourcing trip", Car],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setErr(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${kind === k ? "border-accent bg-accent/5 text-accent font-medium" : "border-border text-muted-foreground"}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          {kind === "expense" ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                addExpense();
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="date" aria-label="Date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                <select aria-label="Category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.filter((c) => c !== "Mileage").map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input aria-label="Amount in dollars" className={inputClass} inputMode="decimal" placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <input aria-label="Note" className={inputClass} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {receipt ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                    <Paperclip className="w-3.5 h-3.5" /> Receipt attached
                    <button type="button" className="underline text-muted-foreground" onClick={() => setReceipt(null)}>
                      Remove
                    </button>
                  </span>
                ) : (
                  <ReceiptButton label="Snap receipt" busy={busy === "new"} onFile={(f) => void attach(f, "new")} />
                )}
                <button type="submit" className={`${primaryButton} ml-auto flex items-center justify-center gap-1.5`} disabled={busy === "new"}>
                  <Plus className="w-3.5 h-3.5" /> Add expense
                </button>
              </div>
            </form>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTrip();
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="date" aria-label="Date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                <input aria-label="Miles one way" className={inputClass} inputMode="decimal" placeholder={roundTrip ? "Miles one way" : "Miles"} value={miles} onChange={(e) => setMiles(e.target.value)} />
                <input aria-label="Where you went" className={`${inputClass} col-span-2`} placeholder="Where and why, e.g. Goodwill on Main, sourcing" value={where} onChange={(e) => setWhere(e.target.value)} />
              </div>
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} /> Round trip
                </label>
                <span className="text-muted-foreground text-xs">
                  {tripMiles > 0 ? `${tripMiles} mi × $${rate.toFixed(2)} = ${fmtMoney(tripAmount, true)}` : `$${rate.toFixed(2)} a mile`}
                </span>
                <button type="submit" className={`${primaryButton} ml-auto flex items-center justify-center gap-1.5`}>
                  <Plus className="w-3.5 h-3.5" /> Add trip
                </button>
              </div>
              {editRate ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Rate per mile $</span>
                  <input aria-label="Rate per mile" className={`${inputClass} w-24`} inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} />
                  <button type="button" className={secondaryButton} onClick={saveRate}>
                    Save
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  Counted at ${rate.toFixed(2)} a mile{rate === DEFAULT_MILEAGE_RATE ? ", the IRS standard rate for 2025" : ""}. The IRS sets a new rate each year.{" "}
                  <button type="button" className="text-accent underline" onClick={() => setEditRate(true)}>
                    Change the rate
                  </button>
                </p>
              )}
            </form>
          )}
          {err && <p className="text-xs text-destructive mt-2">{err}</p>}
        </Card>
        <Card title="By category" subtitle={`${fmtMoney(total)} total, ${rangeText(ctx.range)}`}>
          {cats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {cats.map((r) => (
                <li key={r.c} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span>{r.c}</span>
                    <span className="tabular-nums font-medium">{fmtMoney(r.v)}</span>
                  </div>
                  <InlineBar value={r.v} max={max} />
                </li>
              ))}
            </ul>
          )}
          {missingReceipts > 0 && <p className="mt-3 text-[12px] text-amber-800">{missingReceipts} expense{missingReceipts !== 1 ? "s have" : " has"} no receipt yet. Tap the camera in the log to add one.</p>}
        </Card>
      </div>
      <Card title="Expense log" subtitle={`${ctx.expenses.length} expenses, ${rangeText(ctx.range)}`}>
        <SortTable
          rows={ctx.expenses}
          rowKey={(e) => e.id}
          initialSort={{ key: "date", desc: true }}
          limit={25}
          columns={[
            { key: "date", label: "Date", render: (e) => shortDate(e.date), sort: (e) => e.date },
            { key: "cat", label: "Category", render: (e) => e.category, sort: (e) => e.category },
            { key: "note", label: "Note", className: "hidden sm:table-cell", render: (e) => <span className="text-muted-foreground">{e.miles ? `${e.miles} mi${e.note ? ` · ${e.note}` : ""}` : (e.note ?? "")}</span> },
            { key: "amount", label: "Amount", align: "right", render: (e) => fmtMoney(e.amount, true), sort: (e) => e.amount },
            {
              key: "receipt",
              label: "Receipt",
              align: "right",
              render: (e) =>
                e.category === "Mileage" ? (
                  <span className="text-[11px] text-muted-foreground">mileage</span>
                ) : e.receipt ? (
                  <button type="button" aria-label={`See receipt for ${e.category} on ${e.date}`} onClick={() => setViewing(e.receipt!)} className="p-1 text-emerald-700 hover:text-emerald-900">
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <label className="inline-flex p-1 text-muted-foreground hover:text-accent cursor-pointer" aria-label={`Add a receipt to ${e.category} on ${e.date}`}>
                    {busy === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = "";
                        if (f) void attach(f, e.id);
                      }}
                    />
                  </label>
                ),
            },
            {
              key: "del",
              label: "",
              align: "right",
              render: (e) => (
                <button type="button" aria-label={`Delete ${e.category} expense`} onClick={() => ctx.deleteExpenses([e.id])} className="p-1 text-muted-foreground hover:text-rose-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ),
            },
          ]}
        />
      </Card>
      {viewing && <ReceiptViewer refValue={viewing} receipts={ctx.receipts} onClose={() => setViewing(null)} />}
    </div>
  );
}

// The year's numbers grouped the way Schedule C asks for them, with a CSV for a tax preparer.
export function TaxesPage({ ctx }: { ctx: MoneyCtx }) {
  const years = useMemo(() => taxYears(ctx.everyLine, ctx.allExpenses, ctx.today), [ctx.everyLine, ctx.allExpenses, ctx.today]);
  const lastYear = String(Number(ctx.today.slice(0, 4)) - 1);
  const [year, setYear] = useState(years.includes(lastYear) && ctx.today.slice(5, 7) <= "04" ? lastYear : years[0]);
  const s = useMemo(() => scheduleC(ctx.everyLine, ctx.allExpenses, year), [ctx.everyLine, ctx.allExpenses, year]);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([Papa.unparse(scheduleCRows(s))], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hubby-schedule-c-${year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">Tax year</span>
          <select aria-label="Tax year" className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={downloadCsv} className={`${primaryButton} ml-auto flex items-center gap-1.5`}>
          <Download className="w-3.5 h-3.5" /> Download Schedule C worksheet
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Gross sales" value={fmtMoney(s.income)} hint={`${s.sales} items sold`} />
        <Kpi label="Cost of goods sold" value={fmtMoney(s.cogs)} hint="what you paid for them" />
        <Kpi label="Expenses" value={fmtMoney(s.expenses)} hint={`${s.miles} business miles`} />
        <Kpi label="Net profit" value={fmtMoney(s.net)} hint="Schedule C, line 31" />
      </div>
      <Card title={`Schedule C worksheet, ${year}`} subtitle="Your year's numbers on the lines of Schedule C (Form 1040), the form most resellers file">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Line</th>
                <th className="py-2 pr-3 font-medium">What it is</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">Hubby added up</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.line} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-mono text-xs">{r.line}</td>
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground hidden sm:table-cell">{r.from}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(r.amount, true)}</td>
                </tr>
              ))}
              {(
                [
                  ["7", "Gross income", s.grossProfit],
                  ["28", "Total expenses", s.expenses],
                  ["31", "Net profit or (loss)", s.net],
                ] as const
              ).map(([line, label, v]) => (
                <tr key={line} className="border-b border-border/60 font-medium">
                  <td className="py-2 pr-3 font-mono text-xs">{line}</td>
                  <td className="py-2 pr-3">{label}</td>
                  <td className="hidden sm:table-cell" />
                  <td className={`py-2 text-right tabular-nums ${v < 0 ? "text-rose-700" : ""}`}>{fmtMoney(v, true)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-mono text-xs">44a</td>
                <td className="py-2 pr-3">Business miles driven</td>
                <td className="hidden sm:table-cell" />
                <td className="py-2 text-right tabular-nums">{s.miles} mi</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1.5 text-[12px]">
          {s.missingCost > 0 && (
            <p className="text-amber-800 bg-amber-50 rounded-md px-2.5 py-2">
              {s.missingCost} sale{s.missingCost !== 1 ? "s have" : " has"} no item cost, so cost of goods sold is lower than it should be. Add what you paid in Inventory.
            </p>
          )}
          {s.estimatedFees > 0 && <p className="text-muted-foreground">Fees on {s.estimatedFees} sale{s.estimatedFees !== 1 ? "s are" : " is"} estimated from each marketplace's fee schedule.</p>}
          {s.receipts.total > 0 && (
            <p className="text-muted-foreground">
              {s.receipts.with} of {s.receipts.total} expenses have a receipt photo.
            </p>
          )}
          <p className="text-muted-foreground">
            This is a worksheet to help you or your tax preparer, not tax advice. Where a cost goes (for example equipment, or shipping) can depend on your situation, so check with a tax professional before you file.
          </p>
        </div>
      </Card>
    </div>
  );
}
