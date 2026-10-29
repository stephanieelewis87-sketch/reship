import type { Feedback, FeedbackSummary } from "./types";

// Demo-mode feedback and one example summary, so the owner view has something to show.
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const SAMPLE_FEEDBACK: Feedback[] = [
  { id: "fb-1", kind: "bug", area: "Orders and shipping", message: "The label printed sideways on my Rollo when I picked 4x6.", rating: 3, status: "new", createdAt: daysAgo(1) },
  { id: "fb-2", kind: "idea", area: "Analytics", message: "Would love to see profit per hour of sourcing, not just per item.", rating: 5, status: "planned", createdAt: daysAgo(2) },
  { id: "fb-3", kind: "confusing", area: "Inventory", message: "What does partially delisted mean? I thought it delisted everywhere when it sold.", rating: 4, status: "new", createdAt: daysAgo(3) },
  { id: "fb-4", kind: "praise", area: "Analytics", message: "The stale inventory page paid for itself. Dropped prices on 30 items and sold 9 this week.", rating: 5, status: "new", createdAt: daysAgo(4) },
  { id: "fb-5", kind: "idea", area: "Listing form", message: "Let me paste measurements once and reuse them for every listing of the same size.", rating: 4, status: "new", createdAt: daysAgo(5) },
  { id: "fb-6", kind: "confusing", area: "Inventory", message: "Sold on Mercari but it still showed active on Poshmark for a day.", rating: 2, status: "new", createdAt: daysAgo(6) },
];

export const SAMPLE_SUMMARY: FeedbackSummary = {
  id: "fs-sample",
  sample: true,
  periodStart: daysAgo(7),
  periodEnd: daysAgo(1),
  count: 6,
  createdAt: daysAgo(0),
  summary: {
    headline: "Sellers love the analytics, but sale detection is confusing them",
    sentiment: "mixed",
    themes: [
      {
        title: "Delisting after a sale isn't clear",
        summary: "Two sellers expected an item to come down everywhere the moment it sold, and were surprised to see it still active elsewhere.",
        kind: "confusing",
        mentions: 2,
        priority: "high",
        quotes: ["What does partially delisted mean?", "Sold on Mercari but it still showed active on Poshmark for a day."],
        suggestion: "Explain partially delisted right in the grid, and show one Delist everywhere button on those rows.",
      },
      {
        title: "Analytics is the reason people stay",
        summary: "Stale inventory and profit views are driving real price changes and sales.",
        kind: "praise",
        mentions: 2,
        priority: "medium",
        quotes: ["The stale inventory page paid for itself."],
        suggestion: "Add profit per sourcing hour, which one seller asked for.",
      },
    ],
    bugs: ["4x6 labels print sideways on Rollo printers."],
    quickWins: ["Saved measurement templates in the listing form."],
    decisions: [
      {
        question: "Should delisting after a sale wait for your OK, or happen right away?",
        options: ["Right away", "Ask me first", "Let each seller choose"],
        recommendation: "Let each seller choose, defaulting to right away.",
      },
    ],
  },
};
