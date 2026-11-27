// What Hubby shows today. The rule: if it's on the screen, it works for real.
//
// Features that aren't finished yet are switched off here instead of deleted, so their code
// waits for its turn. Each one comes back by flipping its switch once it works end to end
// with real accounts and real data (not sample numbers).
export const FEATURES = {
  // Posting to marketplaces from Hubby. Today "Crosslist to all" and "List item" only record
  // a listing inside Hubby; nothing is posted to the marketplace yet.
  crosslisting: false,
  // AI listing: List with a video, List from photos and Generate listing.
  aiListing: false,
  // Brand tag and sale banner on the cover photo.
  coverPhoto: false,
  // Item views and watchers (needs a real feed from each marketplace).
  listingStats: false,
  // Research tab with price comps.
  research: false,
  // Automations: relists, offers, bundle comments and buyer messages.
  automations: false,
  // Buying a new label inside Hubby (needs a shipping label account).
  buyLabels: false,
  // The Ask Hubby AI helper.
  assistant: false,
  // The Hubby group: feed, comments, reactions and meetups. Needs migrations 0014 and 0016, so
  // it's on for real accounts when VITE_COMMUNITY=on. Demo mode always shows it.
  community: import.meta.env.VITE_COMMUNITY === "on",
  affiliates: false,
  // Plans and plan limits. Off until payments work: everyone gets everything that's switched on.
  plans: false,
  // Shop: search for things to buy across marketplaces. eBay and Etsy results show in Hubby
  // once their app keys are set on the shop-search function; every other marketplace opens its own
  // search, which works today.
  shop: true,
  // SellSource, Hubby's own marketplace. Needs Stripe Connect set up (see the README), so it's
  // on for real accounts only when VITE_SELLSOURCE=on. Demo mode always shows it, with practice
  // checkouts that charge nothing.
  sellsource: import.meta.env.VITE_SELLSOURCE === "on",
  // Live shows. Needs SellSource (for checkout) and a LiveKit video server: VITE_LIVE_SHOWS=on.
  liveShows: import.meta.env.VITE_LIVE_SHOWS === "on" && import.meta.env.VITE_SELLSOURCE === "on",
} as const;

// Switches that demo mode turns on even when real accounts don't have them yet, because the demo
// can run them end to end without the outside services (practice checkouts, your own camera).
const DEMO_ON: FeatureSwitch[] = ["sellsource", "liveShows", "community"];
// The same test App.tsx uses for demo mode: no Supabase project, or ?demo in the address.
const demo =
  !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"));

export type FeatureSwitch = keyof typeof FEATURES;
export const isOn = (f: FeatureSwitch): boolean => FEATURES[f] || (demo && DEMO_ON.includes(f));
