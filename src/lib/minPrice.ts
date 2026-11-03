// SellSync's price floor. Nothing priced under this can be listed, crosslisted or imported.
// It is one value, so changing it later is a one-line change.
export const MIN_PRICE = 5;

export const minPriceLabel = `$${MIN_PRICE}`;

// True when a price is set and is under the floor. A blank price is left to the other checks.
export const underMinimum = (price: number | null | undefined) => price != null && Number.isFinite(price) && price < MIN_PRICE;

// The short, friendly lines shown wherever a price is too low.
export const minPriceMessage = `SellSync lists items priced ${minPriceLabel} and up.`;
export const minPriceTip = "Bundling a few small items into one listing is a great way to sell them.";

// Raises an AI-suggested price to the floor, so a suggestion never starts below it.
export const atLeastMinimum = (price: number) => Math.max(MIN_PRICE, price);

// The public page with SellSync's mission and pricing philosophy.
export const MISSION_HREF = "/?mission";
