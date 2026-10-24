// Public tracking page for a carrier, picked from the carrier text on the order.
export function trackingUrl(carrier: string, tracking: string): string {
  const c = carrier.toLowerCase();
  const t = encodeURIComponent(tracking);
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${t}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`;
  if (c.includes("royal mail")) return `https://www.royalmail.com/track-your-item#/tracking-results/${t}`;
  if (c.includes("evri")) return `https://www.evri.com/track/parcel/${t}`;
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
  return `https://parcelsapp.com/en/tracking/${t}`;
}
