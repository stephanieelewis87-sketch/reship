import { Landmark } from "lucide-react";
import type { Platform } from "@/lib/types";

// Each marketplace's own withdraw page. Reship only links there; the seller does the transfer.
const WITHDRAW_PAGES: Partial<Record<Platform, string>> = {
  Mercari: "https://www.mercari.com/mypage/sales/bank_account/",
};

export function WithdrawShortcuts({ platforms }: { platforms: Platform[] }) {
  const links = platforms.filter((p) => WITHDRAW_PAGES[p]);
  if (!links.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
      <Landmark className="w-3.5 h-3.5" />
      <span>Withdraw earnings:</span>
      {links.map((p) => (
        <a
          key={p}
          href={WITHDRAW_PAGES[p]}
          target="_blank"
          rel="noreferrer"
          className="px-2 py-0.5 rounded-md border border-border bg-card text-foreground hover:border-[#B5607A]/50 hover:text-[#B5607A]"
        >
          {p}
        </a>
      ))}
    </div>
  );
}
