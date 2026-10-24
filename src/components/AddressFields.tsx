import type { Address } from "@/lib/types";
import { Field, inputClass } from "./ui";

export function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (key: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid grid-cols-6 gap-2">
      <Field label="Full name" className="col-span-6">
        <input className={inputClass} value={value.name} onChange={set("name")} autoComplete="name" />
      </Field>
      <Field label="Address line 1" className="col-span-6">
        <input className={inputClass} value={value.street1} onChange={set("street1")} autoComplete="address-line1" />
      </Field>
      <Field label="Address line 2" className="col-span-6">
        <input className={inputClass} value={value.street2 ?? ""} onChange={set("street2")} autoComplete="address-line2" placeholder="Apt, suite (optional)" />
      </Field>
      <Field label="City" className="col-span-6 sm:col-span-3">
        <input className={inputClass} value={value.city} onChange={set("city")} autoComplete="address-level2" />
      </Field>
      <Field label="State" className="col-span-2 sm:col-span-1">
        <input className={inputClass} value={value.state} onChange={set("state")} autoComplete="address-level1" />
      </Field>
      <Field label="ZIP" className="col-span-2 sm:col-span-2">
        <input className={inputClass} value={value.zip} onChange={set("zip")} autoComplete="postal-code" />
      </Field>
      <Field label="Country" className="col-span-2 sm:col-span-2">
        <input className={inputClass} value={value.country} onChange={set("country")} autoComplete="country" />
      </Field>
      <Field label="Phone" className="col-span-6 sm:col-span-4">
        <input className={inputClass} value={value.phone ?? ""} onChange={set("phone")} autoComplete="tel" placeholder="Optional, some carriers ask for it" />
      </Field>
    </div>
  );
}

export function formatAddress(a: Address): string[] {
  return [a.name, a.street1, a.street2, `${a.city}, ${a.state} ${a.zip}`.trim(), a.country !== "US" ? a.country : ""].filter(
    (l): l is string => !!l && l.trim() !== ",",
  );
}
