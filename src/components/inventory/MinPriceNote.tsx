import { Info } from "lucide-react";
import { MISSION_HREF, minPriceMessage, minPriceTip } from "@/lib/minPrice";

// Shown wherever a price is under SellSync's minimum, with a link to why.
export function MinPriceNote({ detail, className = "" }: { detail?: string; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-1.5 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 ${className}`}>
      <Info className="w-3.5 h-3.5 mt-px shrink-0" />
      <span>
        {detail ? `${detail} ` : ""}
        {minPriceMessage} {minPriceTip}{" "}
        <a href={MISSION_HREF} target="_blank" rel="noreferrer" className="underline hover:no-underline">
          Why we do this
        </a>
      </span>
    </p>
  );
}
