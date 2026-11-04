import { describe, expect, it } from "vitest";
import { checkDraft, conditionLabel, fitDraft, plainCoverOf, type ListingDraft } from "./crosslist";

const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
  title: "Vintage Levi's 501 high waisted mom jeans light wash denim size 28 made in USA button fly",
  description: "Great condition, no stains or holes.",
  price: 42.5,
  photos: Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.jpg`),
  sku: "DEN-501-28",
  condition: "like_new",
  ...over,
});

describe("crosslist rules", () => {
  it("trims a long title at a word break to fit Mercari", () => {
    const fitted = fitDraft("Mercari", draft());
    expect(fitted.title.length).toBeLessThanOrEqual(80);
    expect(fitted.title.endsWith("button")).toBe(false);
    expect(draft().title.startsWith(fitted.title)).toBe(true);
  });

  it("keeps the photos each marketplace allows", () => {
    expect(fitDraft("Mercari", draft()).photos).toHaveLength(12);
    expect(fitDraft("Vinted", draft()).photos).toHaveLength(15);
  });

  it("puts the SKU at the end of the description, inside the limit", () => {
    const fitted = fitDraft("Mercari", draft({ description: "word ".repeat(400) }));
    expect(fitted.description.length).toBeLessThanOrEqual(1000);
    expect(fitted.description.endsWith("SKU: DEN-501-28")).toBe(true);
  });

  it("explains what stops a draft from listing", () => {
    expect(checkDraft("Mercari", draft())).toEqual([]);
    expect(checkDraft("Mercari", draft({ price: 0.5, photos: [] }))).toEqual(["Add at least one photo.", "Mercari needs a price of at least $1."]);
    expect(checkDraft("Mercari", draft({ price: 2500 }))).toEqual(["Mercari doesn't allow prices over $2,000."]);
    expect(checkDraft("Poshmark", draft())).toEqual(["Reship can't list on Poshmark yet."]);
  });

  it("names conditions the way each marketplace does", () => {
    expect(conditionLabel("Mercari", "new_with_tags")).toBe("New");
    expect(conditionLabel("Vinted", "like_new")).toBe("Very good");
    expect(conditionLabel("Vinted", "fair")).toBe("Satisfactory");
    expect(conditionLabel("Vinted", undefined)).toBeUndefined();
  });
});

describe("customized cover photos", () => {
  it("sends Mercari the plain cover and Vinted the customized one", () => {
    const d = draft({ photos: ["https://x.test/banner.jpg", "https://x.test/2.jpg"], plainCover: "https://x.test/plain.jpg" });
    expect(fitDraft("Mercari", d).photos[0]).toBe("https://x.test/plain.jpg");
    expect(fitDraft("Vinted", d).photos[0]).toBe("https://x.test/banner.jpg");
  });
  it("finds the plain cover only while the edited cover is still first", () => {
    const coverEdit = { original: "plain.jpg", applied: "banner.jpg" };
    expect(plainCoverOf({ photos: ["banner.jpg"], coverEdit })).toBe("plain.jpg");
    expect(plainCoverOf({ photos: ["other.jpg"], coverEdit })).toBeUndefined();
  });
});
