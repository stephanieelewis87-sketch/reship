import type { Address, Order } from "./types";
import { estimateRates } from "./rates";
import { supabase } from "./supabase";

export interface LabelRate {
  id?: string; // the shipping provider's rate id, only on live rates
  carrier: string;
  service: string;
  price: number;
  days: string;
}

// "live": real, buyable rates from Reship's shipping account (the `labels` edge function).
// "estimate": the shipping account isn't reachable, so prices are estimates and nothing can be bought.
// "demo": demo mode; buying makes a practice label so the whole flow can be tried.
export interface RateQuote {
  mode: "live" | "estimate" | "demo";
  rates: LabelRate[];
  shipmentId?: string;
  note?: string;
}

export interface BoughtLabel {
  tracking: string;
  carrier: string;
  service: string;
  price: number;
  pdf: Blob;
  demo?: boolean;
}

export const cheapest = (rates: LabelRate[]): LabelRate | null =>
  rates.reduce<LabelRate | null>((best, r) => (!best || r.price < best.price ? r : best), null);

async function errorMessage(error: unknown): Promise<string> {
  // supabase-js puts the function's response on `context`; its body says what went wrong.
  const res = (error as { context?: Response }).context;
  if (res && typeof res.json === "function") {
    const body = await res.json().catch(() => null);
    if (body?.error) return String(body.error);
  }
  return error instanceof Error ? error.message : String(error);
}

export async function quoteLabel(order: Order, shipFrom: Address | null): Promise<RateQuote> {
  const weight = order.parcel?.weightLbs ?? 0;
  const packageType = order.parcel?.packageType ?? "Soft Pack";
  const estimates = (): LabelRate[] => (weight > 0 ? estimateRates(weight, packageType) : []);
  if (!supabase) return { mode: "demo", rates: estimates() };

  const { data, error } = await supabase.functions.invoke("labels", {
    body: { action: "rates", to: order.shipTo, from: shipFrom, parcel: { weightLbs: weight, packageType } },
  });
  if (error) {
    return {
      mode: "estimate",
      rates: estimates(),
      note: `Live label prices aren't available (${await errorMessage(error)}), so these are estimates.`,
    };
  }
  return { mode: "live", rates: data.rates as LabelRate[], shipmentId: data.shipmentId as string };
}

export async function buyLabel(quote: RateQuote, rate: LabelRate, order: Order): Promise<BoughtLabel> {
  if (quote.mode === "demo") return practiceLabel(rate, order);
  if (quote.mode !== "live" || !supabase || !quote.shipmentId || !rate.id) throw new Error("Label buying isn't connected yet.");

  const { data, error } = await supabase.functions.invoke("labels", {
    body: { action: "buy", shipmentId: quote.shipmentId, rateId: rate.id },
  });
  if (error) throw new Error(await errorMessage(error));
  const bytes = Uint8Array.from(atob(data.labelPdfBase64 as string), (c) => c.charCodeAt(0));
  return {
    tracking: data.tracking as string,
    carrier: data.carrier as string,
    service: data.service as string,
    price: data.price as number,
    pdf: new Blob([bytes], { type: "application/pdf" }),
  };
}

// Demo mode only: a label that is plainly marked as practice, with a tracking number no carrier knows.
async function practiceLabel(rate: LabelRate, order: Order): Promise<BoughtLabel> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tracking = `DEMO${String(Date.now()).slice(-12)}`;
  const to = order.shipTo;

  page.drawRectangle({ x: 6, y: 6, width: 276, height: 420, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  page.drawRectangle({ x: 6, y: 380, width: 276, height: 46, color: rgb(0.71, 0.38, 0.48) });
  page.drawText("PRACTICE LABEL", { x: 16, y: 404, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Reship demo mode. Not valid for shipping.", { x: 16, y: 388, size: 8, font, color: rgb(1, 1, 1) });
  page.drawText(`${rate.carrier} ${rate.service}`.toUpperCase(), { x: 16, y: 350, size: 12, font: bold });
  page.drawText("SHIP TO:", { x: 16, y: 310, size: 8, font: bold });
  [to?.name, to?.street1, to ? `${to.city} ${to.state} ${to.zip}` : order.buyer]
    .filter((t): t is string => !!t)
    .forEach((t, i) => page.drawText(t.toUpperCase(), { x: 16, y: 294 - i * 15, size: 11, font: i === 0 ? bold : font }));
  page.drawText("TRACKING #", { x: 16, y: 90, size: 8, font: bold });
  page.drawText(tracking, { x: 16, y: 72, size: 14, font: bold });

  const bytes = await doc.save();
  return {
    tracking,
    carrier: rate.carrier,
    service: rate.service,
    price: rate.price,
    pdf: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    demo: true,
  };
}
