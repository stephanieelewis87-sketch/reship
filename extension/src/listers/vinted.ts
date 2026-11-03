import type { Lister } from "./types";

const ORIGIN = "https://www.vinted.com";

export const vintedLister: Lister = {
  platform: "Vinted",
  sellUrl: `${ORIGIN}/items/new`,
  listingUrl: (id) => `${ORIGIN}/items/${id}`,
  listingIdFromUrl: (url) => url.match(/^https:\/\/(?:www\.)?vinted\.[a-z.]+\/items\/(\d{5,})(?:[-/?#]|$)/)?.[1] ?? null,
  isLoginPage: (url) => /vinted\.[a-z.]+\/(member\/signup|session|login)/.test(url),
  fields: [
    { key: "title", selectors: ['[data-testid="title--input"]', "#title", 'input[name="title"]'], labels: ["^title"] },
    { key: "description", selectors: ['[data-testid="description--input"]', "#description", 'textarea[name="description"]'], labels: ["^describe|^description"] },
    { key: "price", selectors: ['[data-testid="price-input--input"]', "#price", 'input[name="price"]'], labels: ["^price"] },
  ],
  photoSelectors: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
  // Hiding keeps the listing in the seller's wardrobe so it can be shown again.
  delist: {
    steps: ["^hide$", "^(hide|yes|confirm)$"],
    doneButton: "^(unhide|show)$",
    doneText: "(this )?item is hidden|hidden from (other )?members",
    goneText: "page (could not be |not )found|no longer available|has been (deleted|removed)|doesn.t exist",
  },
};
