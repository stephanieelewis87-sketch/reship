import { useState } from "react";
import { AlertCircle, Check, ShoppingCart } from "lucide-react";
import type { Order, PackageType, Parcel } from "@/lib/types";
import { PACKAGE_TYPES, isAddressComplete } from "@/lib/types";
import { estimateRates, type CarrierRate } from "@/lib/rates";
import { Modal, ModalHeader, PhotoCollage, PlatformIcon, isBundle, primaryButton, secondaryButton, selectClass } from "./ui";

interface Draft {
  order: Order;
  weight: string;
  packageType: PackageType;
  rate: CarrierRate | null;
}

// Rate shopping for orders where Reship buys the label (eBay, Etsy, manual orders).
// Prices are estimates until a shipping account is connected; package details are saved to each order.
export function BuyLabelsModal({
  orders,
  hasShipFrom,
  onClose,
  onSaveParcels,
}: {
  orders: Order[];
  hasShipFrom: boolean;
  onClose: () => void;
  onSaveParcels: (parcels: { id: string; parcel: Parcel; carrier: string }[]) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    orders.map((o) => ({
      order: o,
      weight: o.parcel?.weightLbs != null ? String(o.parcel.weightLbs) : "",
      packageType: o.parcel?.packageType ?? "Soft Pack",
      rate: null,
    })),
  );
  const [bulkWeight, setBulkWeight] = useState("");
  const [bulkPkg, setBulkPkg] = useState<PackageType>("Soft Pack");

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.order.id === id ? { ...d, ...patch } : d)));

  const applyToAll = () =>
    setDrafts((prev) => prev.map((d) => ({ ...d, weight: bulkWeight || d.weight, packageType: bulkPkg, rate: null })));

  const total = drafts.reduce((sum, d) => sum + (d.rate?.price ?? 0), 0);
  const readyCount = drafts.filter((d) => d.rate).length;
  const missingAddress = drafts.filter((d) => !isAddressComplete(d.order.shipTo)).length;

  const save = () => {
    onSaveParcels(
      drafts.map((d) => ({
        id: d.order.id,
        parcel: { weightLbs: parseFloat(d.weight) || null, packageType: d.packageType },
        carrier: d.rate ? `${d.rate.carrier} ${d.rate.service}` : d.order.carrier,
      })),
    );
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" label="Buy labels">
      <ModalHeader
        title="Buy Labels"
        subtitle={`${orders.length} order${orders.length !== 1 ? "s" : ""} · estimated rates`}
        onClose={onClose}
        icon={<ShoppingCart className="w-5 h-5 text-[#B5607A]" />}
      />

      <div className="px-5 sm:px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Apply to all:</span>
        <input
          value={bulkWeight}
          onChange={(e) => setBulkWeight(e.target.value)}
          placeholder="Weight (lbs)"
          inputMode="decimal"
          className="w-28 text-xs px-2.5 py-1.5 rounded-md border border-border bg-background focus:border-[#B5607A] focus:outline-none"
        />
        <select value={bulkPkg} onChange={(e) => setBulkPkg(e.target.value as PackageType)} className={selectClass}>
          {PACKAGE_TYPES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyToAll}
          className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          Apply to all
        </button>
        <span className="text-[11px] text-muted-foreground sm:ml-auto">
          {readyCount}/{drafts.length} rates selected
        </span>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-border">
        {drafts.map((d) => {
          const weight = parseFloat(d.weight);
          const rates = weight > 0 ? estimateRates(weight, d.packageType) : [];
          return (
            <div key={d.order.id} className="px-5 sm:px-6 py-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0">
                  <PhotoCollage photos={d.order.items.map((i) => i.photo)} size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {isBundle(d.order) ? `Bundle · ${d.order.items.length} items` : d.order.items[0]?.name}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <PlatformIcon platform={d.order.platform} />
                    {d.order.orderId} · @{d.order.buyer}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    value={d.weight}
                    onChange={(e) => update(d.order.id, { weight: e.target.value, rate: null })}
                    inputMode="decimal"
                    aria-label="Weight in pounds"
                    className="w-20 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:border-[#B5607A] focus:outline-none text-center"
                    placeholder="lbs"
                  />
                  <select
                    value={d.packageType}
                    aria-label="Package type"
                    onChange={(e) => update(d.order.id, { packageType: e.target.value as PackageType, rate: null })}
                    className={selectClass}
                  >
                    {PACKAGE_TYPES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {rates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Enter a weight to see rates.</p>
              ) : (
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
                  {rates.map((rate) => {
                    const on = d.rate?.carrier === rate.carrier && d.rate?.service === rate.service;
                    return (
                      <button
                        type="button"
                        key={`${rate.carrier}-${rate.service}`}
                        onClick={() => update(d.order.id, { rate })}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all ${
                          on ? "border-[#B5607A] bg-rose-50/50 shadow-sm" : "border-border hover:border-[#B5607A]/40 hover:bg-muted/40"
                        }`}
                      >
                        <div>
                          <p className={`text-xs font-medium leading-none ${on ? "text-[#B5607A]" : "text-foreground"}`}>
                            {rate.carrier} {rate.service}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{rate.days}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${on ? "text-[#B5607A]" : "text-foreground"}`}>~${rate.price.toFixed(2)}</p>
                          {on && <Check className="w-3 h-3 text-[#B5607A] ml-auto mt-0.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!isAddressComplete(d.order.shipTo) && (
                <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Needs the buyer's address before a label can be bought
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 sm:px-6 py-4 border-t border-border bg-muted/20 flex flex-col gap-3 shrink-0">
        <p className="text-[11px] text-muted-foreground">
          These are estimates. Real prices and label purchase arrive when a shipping account (EasyPost) is connected.
          {!hasShipFrom && " Add your ship-from address in Settings too."}
          {missingAddress > 0 && ` ${missingAddress} order${missingAddress !== 1 ? "s" : ""} still need${missingAddress === 1 ? "s" : ""} a buyer address.`}
        </p>
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Estimated total</p>
            <p className="font-display text-lg font-semibold text-foreground">${total.toFixed(2)}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" onClick={save} className={primaryButton}>
              Save package details
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
