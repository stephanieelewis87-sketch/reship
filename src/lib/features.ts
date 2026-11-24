// What SellSync shows today. The rule: if it's on the screen, it works for real.
//
// Features that aren't finished yet are switched off here instead of deleted, so their code
// waits for its turn. Each one comes back by flipping its switch once it works end to end
// with real accounts and real data (not sample numbers).
export const FEATURES = {
  // Posting to marketplaces from SellSync. Today "Crosslist to all" and "List item" only record
  // a listing inside SellSync; nothing is posted to the marketplace yet.
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
  // Buying a new label inside SellSync (needs a shipping label account).
  buyLabels: false,
  // The Ask SellSync AI helper.
  assistant: false,
  community: false,
  affiliates: false,
  // Plans and plan limits. Off until payments work: everyone gets everything that's switched on.
  plans: false,
} as const;

export type FeatureSwitch = keyof typeof FEATURES;
export const isOn = (f: FeatureSwitch): boolean => FEATURES[f];
