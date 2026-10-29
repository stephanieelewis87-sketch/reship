import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, FileText, Loader2, ShoppingCart, Tag } from "lucide-react";
import type { Address, Order, PackageType } from "@/lib/types";
import { PACKAGE_TYPES, isAddressComplete } from "@/lib/types";
import { buyLabel, cheapest, quoteLabel, type LabelRate, type RateQuote } from "@/lib/labelBuying";
import {
  PASTE_TRACKING_STEPS,
  PREPAID_LABEL_NOTE,
  compareLabels,
  labelPolicy,
  marketplaceOrderUrl,
  parsePrice,
} from "@/lib/labelPolicy";
import { Modal, ModalHeader, PlatformIcon, orderTitle, primaryButton, secondaryButton, selectClass } from "./ui";

export interface Purchase {
  order: Order; // the order with its new tracking number, carrier and ownLabel
  pdf: File;
}

// One order's label, decided by marketplace (see labelPolicy.ts): compare and buy for Mercari and
// Depop, buy for eBay, Etsy and direct sales, and point to the prepaid label everywhere else.
export function ShipLabelModal({
  order,
  shipFrom,
  onClose,
  onBought,
  onSave,
  onViewLabel,
  onEditOrder,
}: {
  order: Order;
  shipFrom: Address | null;
  onClose: () => void;
  onBought: (p: Purchase) => void;
  onSave: (o: Order) => void;
  onViewLabel: (o: Order) => void;
  onEditOrder: (o: Order) => void;
}) {
  const policy = labelPolicy(order);
  const platform = order.platform;
  const orderUrl = marketplaceOrderUrl(order);

  const [current, setCurrent] = useState(order);
  const [weight, setWeight] = useState(order.parcel?.weightLbs != null ? String(order.parcel.weightLbs) : "");
  const [packageType, setPackageType] = useState<PackageType>(order.parcel?.packageType ?? "Soft Pack");
  const [marketplaceText, setMarketplaceText] = useState(order.ownLabel?.marketplacePrice != null ? String(order.ownLabel.marketplacePrice) : "");
  const [quote, setQuote] = useState<RateQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [rate, setRate] = useState<LabelRate | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const weightLbs = parseFloat(weight) > 0 ? parseFloat(weight) : null;
  const hasAddress = isAddressComplete(current.shipTo);
  const draftOrder: Order = { ...current, parcel: { weightLbs, packageType } };

  // Fresh prices whenever the package changes; a short pause so typing a weight doesn't ask on every key.
  useEffect(() => {
    if (policy === "marketplace" || current.ownLabel || !weightLbs) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setQuoting(true);
      setError(null);
      quoteLabel({ ...current, parcel: { weightLbs, packageType } }, shipFrom)
        .then((q) => {
          if (cancelled) return;
          setQuote(q);
          setRate(cheapest(q.rates));
        })
        .catch((e: Error) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setQuoting(false));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [policy, current, weightLbs, packageType, shipFrom]);

  const marketplacePrice = parsePrice(marketplaceText);
  const comparison = compareLabels(marketplacePrice, rate?.price ?? null);
  const canBuy =
    !!quote && !!rate && quote.mode !== "estimate" && (quote.mode === "demo" || (hasAddress && isAddressComplete(shipFrom)));

  const buy = async () => {
    if (!quote || !rate) return;
    setBuying(true);
    setError(null);
    try {
      const label = await buyLabel(quote, rate, draftOrder);
      const updated: Order = {
        ...draftOrder,
        tracking: label.tracking,
        carrier: `${label.carrier} ${label.service}`,
        ownLabel: {
          carrier: label.carrier,
          service: label.service,
          price: label.price,
          marketplacePrice: policy === "compare" ? (marketplacePrice ?? undefined) : undefined,
          boughtAt: new Date().toISOString(),
          demo: label.demo,
        },
      };
      const file = new File([label.pdf], `${platform}-${order.orderId}-reship-label.pdf`, { type: "application/pdf" });
      onBought({ order: updated, pdf: file });
      setCurrent({ ...updated, label: { fileName: file.name, uploadedAt: new Date().toISOString() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  };

  const copyTracking = async () => {
    if (!current.tracking) return;
    try {
      await navigator.clipboard.writeText(current.tracking);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the tracking number and copy it by hand.");
    }
  };

  const markPosted = () => {
    const updated = { ...current, ownLabel: { ...current.ownLabel!, trackingPostedAt: new Date().toISOString() } };
    setCurrent(updated);
    onSave(updated);
  };

  const title = policy === "marketplace" ? `${platform} prepaid label` : policy === "compare" ? "Ship on your own" : "Buy a label";
  const steps = PASTE_TRACKING_STEPS[platform];

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" label={title}>
      <ModalHeader
        title={title}
        subtitle={
          <span className="flex items-center gap-1.5">
            <PlatformIcon platform={platform} />
            <span className="font-mono">{order.orderId}</span> · {orderTitle(order)}
          </span>
        }
        onClose={onClose}
        icon={<Tag className="w-5 h-5 text-[#B5607A]" />}
      />

      <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5 space-y-4">
        {policy === "marketplace" ? (
          <>
            <p className="text-sm text-foreground">{PREPAID_LABEL_NOTE[platform]}</p>
            <p className="text-xs text-muted-foreground">Reship doesn't buy a second label for {platform} orders.</p>
            <div className="flex flex-wrap gap-2">
              {current.label ? (
                <button type="button" onClick={() => onViewLabel(current)} className={primaryButton}>
                  <FileText className="w-4 h-4" /> View {platform}'s label
                </button>
              ) : (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> The label hasn't come in yet. Sync with the extension or upload it in the order.
                </p>
              )}
              {orderUrl && (
                <a href={orderUrl} target="_blank" rel="noreferrer" className={secondaryButton}>
                  Open on {platform} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </>
        ) : current.ownLabel ? (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <p className="text-sm font-medium text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {current.ownLabel.demo ? "Practice label made" : "Label bought"} · {current.ownLabel.carrier} {current.ownLabel.service} · $
                {current.ownLabel.price.toFixed(2)}
              </p>
              {current.ownLabel.marketplacePrice != null && current.ownLabel.marketplacePrice > current.ownLabel.price && (
                <p className="text-xs text-emerald-800 mt-1">
                  ${(current.ownLabel.marketplacePrice - current.ownLabel.price).toFixed(2)} less than {platform}'s label.
                </p>
              )}
              {current.ownLabel.demo && (
                <p className="text-xs text-amber-700 mt-1">Demo mode: this tracking number is made up. Don't paste it into a real order.</p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Tracking number</p>
              <div className="flex items-center gap-2">
                <input readOnly value={current.tracking ?? ""} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 font-mono text-sm px-2.5 py-1.5 rounded-md border border-border bg-muted/30" />
                <button type="button" onClick={copyTracking} className={secondaryButton}>
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {(steps || platform === "eBay" || platform === "Etsy") && (
              <div className="rounded-lg border border-border px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Paste it into {platform} so the sale shows as shipped</p>
                <ol className="list-decimal pl-4 space-y-1 text-xs text-muted-foreground">
                  {(steps ?? [`Open the order on ${platform}.`, "Choose Add tracking, paste the number, pick the carrier and confirm."]).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {orderUrl && (
                    <a href={orderUrl} target="_blank" rel="noreferrer" className="text-xs text-[#B5607A] hover:underline flex items-center gap-1">
                      Open the order on {platform} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {current.ownLabel.trackingPostedAt ? (
                    <span className="text-xs text-emerald-700 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Added on {platform}
                    </span>
                  ) : (
                    <button type="button" onClick={markPosted} className="text-xs text-foreground hover:underline flex items-center gap-1">
                      <Check className="w-3 h-3" /> I've added it on {platform}
                    </button>
                  )}
                </div>
              </div>
            )}

            {current.label && (
              <button type="button" onClick={() => onViewLabel(current)} className="text-xs text-[#B5607A] hover:underline flex items-center gap-1">
                <FileText className="w-3 h-3" /> View the label (it's also in your print queue)
              </button>
            )}
          </>
        ) : (
          <>
            {policy === "compare" && (
              <p className="text-xs text-muted-foreground">
                {platform} lets you ship on your own. Reship checks whether its label costs less than {platform}'s, and if it does you can buy it
                here and paste the tracking number into {platform}.
              </p>
            )}

            <div className="flex items-end gap-2 flex-wrap">
              <label className="block">
                <span className="block text-[11px] font-medium text-muted-foreground mb-1">Weight (lbs)</span>
                <input
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  inputMode="decimal"
                  placeholder="1.2"
                  className="w-24 text-sm px-2.5 py-1.5 rounded-md border border-border bg-background focus:border-[#B5607A] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-muted-foreground mb-1">Package</span>
                <select value={packageType} onChange={(e) => setPackageType(e.target.value as PackageType)} className={`${selectClass} py-2`}>
                  {PACKAGE_TYPES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {policy === "compare" && (
                <label className="block">
                  <span className="block text-[11px] font-medium text-muted-foreground mb-1">{platform}'s label price</span>
                  <input
                    value={marketplaceText}
                    onChange={(e) => setMarketplaceText(e.target.value)}
                    inputMode="decimal"
                    placeholder="$7.49"
                    className="w-28 text-sm px-2.5 py-1.5 rounded-md border border-border bg-background focus:border-[#B5607A] focus:outline-none"
                  />
                </label>
              )}
            </div>

            {!weightLbs ? (
              <p className="text-xs text-muted-foreground">Enter the package weight to see Reship's label prices.</p>
            ) : quoting && !quote ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking prices…
              </p>
            ) : quote && quote.rates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No carrier offered a price for this package.</p>
            ) : quote ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
                {quote.rates.map((r) => {
                  const on = rate?.carrier === r.carrier && rate?.service === r.service;
                  return (
                    <button
                      type="button"
                      key={r.id ?? `${r.carrier}-${r.service}`}
                      onClick={() => setRate(r)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${
                        on ? "border-[#B5607A] bg-rose-50/50 shadow-sm" : "border-border hover:border-[#B5607A]/40 hover:bg-muted/40"
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-medium leading-none ${on ? "text-[#B5607A]" : "text-foreground"}`}>
                          {r.carrier} {r.service}
                        </p>
                        {r.days && <p className="text-[10px] text-muted-foreground mt-0.5">{r.days}</p>}
                      </div>
                      <p className={`text-sm font-semibold ${on ? "text-[#B5607A]" : "text-foreground"}`}>
                        {quote.mode === "estimate" ? "~" : ""}${r.price.toFixed(2)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {policy === "compare" && rate && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  comparison.pick === "reship"
                    ? "bg-emerald-50/70 border border-emerald-200 text-emerald-900"
                    : comparison.pick === "marketplace"
                      ? "bg-muted/40 border border-border text-foreground"
                      : "bg-muted/30 border border-dashed border-border text-muted-foreground"
                }`}
              >
                {comparison.pick === "reship" ? (
                  <>
                    Reship's label saves you <strong>${comparison.savings.toFixed(2)}</strong>. Buy it below, then paste the tracking number into{" "}
                    {platform}.
                  </>
                ) : comparison.pick === "marketplace" ? (
                  <>
                    {platform}'s label is {comparison.savings === 0 ? "the same price" : <>${comparison.savings.toFixed(2)} cheaper</>}, so use{" "}
                    {platform}'s label for this one.
                    {orderUrl && (
                      <a href={orderUrl} target="_blank" rel="noreferrer" className="ml-1 text-[#B5607A] hover:underline inline-flex items-center gap-0.5">
                        Open on {platform} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </>
                ) : (
                  <>Type the label price {platform} shows you to see which is cheaper.</>
                )}
              </div>
            )}

            {quote?.note && <p className="text-[11px] text-amber-700">{quote.note}</p>}
            {quote?.mode === "demo" && (
              <p className="text-[11px] text-muted-foreground">Demo mode: prices are estimates and buying makes a practice label.</p>
            )}
            {quote?.mode === "live" && !hasAddress && (
              <p className="text-[11px] text-amber-700 flex items-center gap-1 flex-wrap">
                <AlertCircle className="w-3 h-3" /> Needs the buyer's full address
                {policy === "compare" ? ` (${platform} shows it once you choose to ship on your own)` : ""}.
                <button type="button" onClick={() => onEditOrder(current)} className="underline">
                  Add it
                </button>
              </p>
            )}
            {quote?.mode === "live" && !isAddressComplete(shipFrom) && (
              <p className="text-[11px] text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Add your ship-from address in Settings.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 border-t border-border bg-muted/20 flex items-center gap-2 shrink-0">
        <button type="button" onClick={onClose} className={`${secondaryButton} ml-auto`}>
          {policy === "marketplace" || current.ownLabel ? "Done" : "Cancel"}
        </button>
        {policy !== "marketplace" && !current.ownLabel && (
          <button
            type="button"
            onClick={buy}
            disabled={!canBuy || buying}
            className={comparison.pick === "marketplace" ? secondaryButton : primaryButton}
          >
            {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {quote?.mode === "demo" ? "Make practice label" : "Buy label"}
            {rate ? ` · $${rate.price.toFixed(2)}` : ""}
          </button>
        )}
      </div>
    </Modal>
  );
}
