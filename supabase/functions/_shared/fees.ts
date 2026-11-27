// Same numbers as src/lib/sellsource.ts: 3% of the items, plus Stripe's card processing on
// everything the buyer pays. SellSource keeps this as the application fee.
const r = (n: number) => Math.round(n * 100) / 100;
export function sellSourceFees(items: number, shipping: number) {
  const sellsource = r(items * 0.03);
  const processing = r((items + shipping) * 0.029 + 0.3);
  return { sellsource, processing, total: r(sellsource + processing) };
}
export function packageShipping(first: number, extra: number, count: number, alreadyPaidFirst: boolean) {
  if (count <= 0) return 0;
  return r((alreadyPaidFirst ? 0 : first) + (alreadyPaidFirst ? count : count - 1) * extra);
}
