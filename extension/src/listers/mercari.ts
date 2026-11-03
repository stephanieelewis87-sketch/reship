import type { Lister } from "./types";

const ORIGIN = "https://www.mercari.com";

export const mercariLister: Lister = {
  platform: "Mercari",
  sellUrl: `${ORIGIN}/sell/`,
  listingUrl: (id) => `${ORIGIN}/us/item/${id}/`,
  listingIdFromUrl: (url) => url.match(/^https:\/\/(?:www\.)?mercari\.com\/(?:us\/)?item\/(m\d{6,})/)?.[1] ?? null,
  isLoginPage: (url) => /mercari\.com\/(login|signup)/.test(url),
  fields: [
    { key: "title", selectors: ['[data-testid="Title"]', 'input[name="name"]', 'input[name="title"]'], labels: ["^title"] },
    { key: "description", selectors: ['[data-testid="Description"]', 'textarea[name="description"]'], labels: ["^description"] },
    { key: "price", selectors: ['[data-testid="Price"]', 'input[name="price"]'], labels: ["^(listing )?price"] },
  ],
  photoSelectors: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
  // Deactivating keeps the listing in the seller's account so it can be turned back on.
  delist: {
    steps: ["^edit( listing)?$", "^deactivate( listing)?$", "^(deactivate|yes|confirm)$"],
    doneButton: "^activate( listing)?$",
    doneText: "listing (is |has been )?deactivated|this item is inactive",
    goneText: "page (could not be |not )found|no longer available|has been (deleted|removed)|doesn.t exist",
  },
};
