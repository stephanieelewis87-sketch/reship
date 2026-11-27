import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Link2, Loader2, Unlink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ebayListingsToItems, ebayOrdersToOrders, type EbayImport } from "@/lib/ebay";
import { mergeById } from "@/lib/store";
import type { useReshipData } from "@/lib/useReshipData";
import { PlatformIcon, primaryButton, secondaryButton } from "../ui";

type Data = ReturnType<typeof useReshipData>;

interface Status {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
  lastImportAt: string | null;
  sandbox?: boolean;
}

// What eBay's sign-in page sent back, from ?ebay= in the address.
const RETURN_TEXT: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "eBay is connected. Press Import from eBay to bring in your listings and orders.", ok: true },
  declined: { text: "eBay wasn't connected because the sign-in was cancelled on eBay.", ok: false },
  expired: { text: "That eBay sign-in took too long. Press Connect eBay to try again.", ok: false },
  error: { text: "eBay approved Hubby, but saving the connection failed. Try Connect eBay again.", ok: false },
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Sign in with a Hubby account to connect eBay.");
  const { data, error } = await supabase.functions.invoke("ebay", { body });
  if (error) {
    // The function sends a readable message in its JSON body.
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    if (detail?.error) throw new Error(detail.error);
    if (/Failed to send|not found|404/i.test(error.message)) throw new Error("The eBay connection isn't set up on the server yet. Follow the eBay setup steps in the README.");
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);

export function EbayConnection({ data, demoMode }: { data: Data; demoMode: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"connect" | "import" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(() => {
    const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    return RETURN_TEXT[q.get("ebay") ?? ""] ?? null;
  });

  const refresh = useCallback(() => {
    if (demoMode) return;
    call<Status>({ action: "status" })
      .then(setStatus)
      .catch((e: Error) => {
        setStatus({ connected: false, username: null, connectedAt: null, lastImportAt: null });
        setMessage((m) => m ?? { text: e.message, ok: false });
      });
  }, [demoMode]);
  useEffect(refresh, [refresh]);

  const connect = async () => {
    setBusy("connect");
    setMessage(null);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}#/settings?tab=connections`;
      const { url } = await call<{ url: string }>({ action: "connect", returnUrl });
      window.location.href = url;
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy("import");
    setMessage(null);
    try {
      const got = await call<EbayImport>({ action: "import", days: 90 });
      // Listings first, so orders can be matched to the items they came from.
      const listings = ebayListingsToItems(got.listings, data.inventory, data.settings.skuFormat);
      if (listings.items.length) data.saveInventory(listings.items, "eBay import");
      const inventory = mergeById(data.inventory, listings.items);
      const orders = ebayOrdersToOrders(got.orders, data.orders, inventory);
      const changed = [...orders.fresh, ...orders.updated];
      if (changed.length) data.saveOrders(changed);
      const parts = [
        `${listings.added} new item${listings.added !== 1 ? "s" : ""}`,
        listings.linked ? `${listings.linked} linked to items you had` : "",
        `${orders.fresh.length} new order${orders.fresh.length !== 1 ? "s" : ""}`,
        orders.updated.length ? `${orders.updated.length} marked shipped` : "",
      ].filter(Boolean);
      setMessage({
        text: `From ${got.listings.length} active listing${got.listings.length !== 1 ? "s" : ""} and ${got.orders.length} order${got.orders.length !== 1 ? "s" : ""} in the last 90 days: ${parts.join(", ")}. Anything already in Hubby was skipped.`,
        ok: true,
      });
      refresh();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await call({ action: "disconnect" });
      setMessage({ text: "eBay is disconnected. Items and orders already imported stay in Hubby.", ok: true });
      refresh();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <PlatformIcon platform="eBay" className="w-5 h-5 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">eBay</p>
            <p className="text-xs text-muted-foreground">
              {demoMode
                ? "Sign in with a Hubby account to connect eBay."
                : !status
                  ? "Checking…"
                  : status.connected
                    ? `Connected${status.username ? ` as ${status.username}` : ""}${status.sandbox ? " (eBay test site)" : ""}.${status.lastImportAt ? ` Last import ${when(status.lastImportAt)}.` : ""}`
                    : "Sign in on eBay's own page to bring in your active listings and orders. Hubby only reads; it never changes anything on eBay or sees your password."}
            </p>
          </div>
        </div>
        {status?.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Connected" />}
      </div>

      {message && (
        <p role="status" className={`text-xs rounded-md px-3 py-2 ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {message.text}
        </p>
      )}

      {!demoMode && status && (
        <div className="flex flex-wrap gap-2">
          {status.connected ? (
            <>
              <button type="button" className={primaryButton} onClick={runImport} disabled={!!busy}>
                {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Import from eBay
              </button>
              <button type="button" className={secondaryButton} onClick={disconnect} disabled={!!busy}>
                <Unlink className="w-4 h-4" /> Disconnect
              </button>
            </>
          ) : (
            <button type="button" className={primaryButton} onClick={connect} disabled={!!busy}>
              {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Connect eBay
            </button>
          )}
        </div>
      )}
    </div>
  );
}
