// Cover photo extras: a brand tag at the bottom center and a sale banner.
//
// Brand tags are the brand's name set in SellSync's own fonts, styled like a sewn-in clothing
// label. They are never the brand's logo or artwork: copying official logos could infringe the
// brands' trademarks, while naming the brand an item is made by is ordinary, fair description.

// How a brand's name is set on its tag. Nothing here copies a brand's own lettering.
export type BrandType = "serif" | "bold" | "classic";

export interface BrandOption {
  name: string;
  type: BrandType;
}

const brands = (type: BrandType, names: string[]) => names.map((name) => ({ name, type }));

// About 100 of the brands resellers list most, grouped loosely so the tag's lettering suits them.
export const BRANDS: BrandOption[] = [
  // Designer and luxury
  ...brands("serif", [
    "Louis Vuitton", "Gucci", "Prada", "Chanel", "Hermès", "Burberry", "Fendi", "Dior", "Saint Laurent", "Givenchy",
    "Versace", "Valentino", "Bottega Veneta", "Celine", "Chloé", "Balenciaga", "Moncler", "Christian Louboutin", "Golden Goose",
    "Tiffany & Co.", "Coach", "Kate Spade", "Michael Kors", "Tory Burch", "Marc Jacobs", "Longchamp", "Stuart Weitzman",
    "Ralph Lauren", "Brooks Brothers", "Anthropologie", "Free People", "Reformation", "Eileen Fisher", "Johnny Was",
    "Lilly Pulitzer", "Barbour", "Pendleton", "Janie and Jack",
  ]),
  // Athletic, outdoor and streetwear
  ...brands("bold", [
    "Nike", "Jordan", "Adidas", "Under Armour", "Lululemon", "Athleta", "Alo Yoga", "Vuori", "Fabletics", "Gymshark",
    "New Balance", "Asics", "Hoka", "On", "Brooks", "Puma", "Reebok", "Converse", "Vans", "Champion",
    "The North Face", "Patagonia", "Columbia", "Arc'teryx", "Canada Goose", "Carhartt", "Dickies", "Supreme", "Stüssy",
    "Off-White", "Oakley", "Harley-Davidson", "Timberland", "Dr. Martens",
  ]),
  // Everyday, denim and mall favorites
  ...brands("classic", [
    "Levi's", "Wrangler", "Madewell", "J.Crew", "Banana Republic", "Gap", "Old Navy", "American Eagle", "Abercrombie & Fitch",
    "Hollister", "Aerie", "Zara", "H&M", "Aritzia", "Skims", "Spanx", "Good American", "Tommy Hilfiger", "Calvin Klein",
    "Lacoste", "Vineyard Vines", "Talbots", "Ann Taylor", "LOFT", "Torrid", "Steve Madden", "UGG", "Birkenstock",
  ]),
].sort((a, b) => a.name.localeCompare(b.name));

// A brand's tag lettering. A name that isn't in the list gets the classic look.
export const brandType = (name: string): BrandType => BRANDS.find((b) => b.name.toLowerCase() === name.trim().toLowerCase())?.type ?? "classic";

// Finds the list brand that matches an item's brand field, ignoring case and spacing.
export function matchBrand(text: string | undefined): BrandOption | undefined {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const k = key(text ?? "");
  return k ? BRANDS.find((b) => key(b.name) === k) : undefined;
}

export type TagColor = "white" | "black" | "cream" | "rose";
export const TAG_COLORS: Record<TagColor, { label: string; fill: string; text: string; stitch: string }> = {
  white: { label: "White", fill: "#ffffff", text: "#1c1917", stitch: "rgba(28,25,23,0.28)" },
  black: { label: "Black", fill: "#1c1917", text: "#ffffff", stitch: "rgba(255,255,255,0.35)" },
  cream: { label: "Cream", fill: "#f3ead8", text: "#3b2f24", stitch: "rgba(59,47,36,0.3)" },
  rose: { label: "Rose", fill: "#b5607a", text: "#ffffff", stitch: "rgba(255,255,255,0.4)" },
};

// Sale banners. FREE GIFT WITH ORDER is the one SellSync suggests for items under the minimum price.
export const BANNERS = [
  "BOGO",
  "BUY 2 GET 1 FREE",
  "50% OFF",
  "40% OFF",
  "30% OFF",
  "25% OFF",
  "20% OFF",
  "FREE GIFT WITH PURCHASE",
  "FREE GIFT WITH ORDER",
  "BUNDLE & SAVE",
  "SALE",
  "PRICE DROP",
  "FINAL SALE",
] as const;
export const FREE_GIFT_BANNER = "FREE GIFT WITH ORDER";

export type BannerStyle = "strip" | "corner" | "badge";
export const BANNER_STYLES: Record<BannerStyle, string> = { strip: "Strip across the top", corner: "Corner ribbon", badge: "Round badge" };

export type BannerColor = "red" | "black" | "rose" | "gold";
export const BANNER_COLORS: Record<BannerColor, { label: string; fill: string; text: string }> = {
  red: { label: "Red", fill: "#d6293e", text: "#ffffff" },
  black: { label: "Black", fill: "#1c1917", text: "#ffffff" },
  rose: { label: "Rose", fill: "#b5607a", text: "#ffffff" },
  gold: { label: "Gold", fill: "#e3b94a", text: "#1c1917" },
};

// What's added to a cover photo. Kept on the item with the untouched photo, so it can be changed
// or taken off later without stacking one edit on another.
export interface CoverDesign {
  brand?: string;
  tagColor?: TagColor;
  banner?: string;
  bannerStyle?: BannerStyle;
  bannerColor?: BannerColor;
}
export interface CoverEdit extends CoverDesign {
  original: string; // the photo before anything was added
  applied: string; // the finished cover; if the first photo is no longer this, the edit is stale
}

export const hasDesign = (d: CoverDesign) => !!(d.brand?.trim() || d.banner?.trim());

// Splits a banner's words into at most `lines` lines that are as even in length as possible.
export function wrapBalanced(text: string, lines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1 || lines <= 1) return [words.join(" ")];
  const n = Math.min(lines, words.length);
  let best: string[] = [words.join(" ")];
  let bestLongest = best[0].length;
  // Tries every way to cut the words into n or fewer lines; banners are short, so this is quick.
  const walk = (start: number, left: number, acc: string[]) => {
    if (start === words.length) {
      const longest = Math.max(...acc.map((l) => l.length));
      // Ties go to fewer lines, then to a longer first line ("FREE GIFT / WITH / PURCHASE").
      const tie = longest === bestLongest && (acc.length < best.length || (acc.length === best.length && acc[0].length > best[0].length));
      if (longest < bestLongest || tie) {
        best = acc;
        bestLongest = longest;
      }
      return;
    }
    if (left === 0) return;
    for (let end = start + 1; end <= words.length; end++) walk(end, left - 1, [...acc, words.slice(start, end).join(" ")]);
  };
  walk(0, n, []);
  return best;
}

// The brand tag's box, centered at the bottom: sizes are a share of the photo's shorter side.
export function tagBox(width: number, height: number, textWidth: number, fontSize: number) {
  const short = Math.min(width, height);
  const padX = fontSize * 1.1;
  const h = fontSize * 2.2;
  const w = Math.min(width * 0.86, textWidth + padX * 2);
  return { x: (width - w) / 2, y: height - short * 0.05 - h, w, h };
}

// ---- Drawing (browser only) ----

const FONT: Record<BrandType, { family: string; weight: number; upper: boolean; spacing: number }> = {
  serif: { family: "Fraunces, Georgia, serif", weight: 500, upper: false, spacing: 0.04 },
  bold: { family: "Montserrat, Arial, sans-serif", weight: 800, upper: true, spacing: 0.08 },
  classic: { family: "Montserrat, Arial, sans-serif", weight: 600, upper: true, spacing: 0.18 },
};
const BANNER_FONT = "Montserrat, Arial, sans-serif";

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

// Waits for the fonts the cover uses, so the first drawing isn't in a fallback font.
export async function loadCoverFonts() {
  if (!document.fonts?.load) return;
  await Promise.all(["500 40px Fraunces", "800 40px Montserrat", "600 40px Montserrat", "900 40px Montserrat"].map((f) => document.fonts.load(f).catch(() => null)));
}

function setFont(ctx: Ctx, weight: number, size: number, family: string, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(size * spacing).toFixed(1)}px`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The largest font size up to `max` at which every line fits in `maxWidth`.
function fitSize(ctx: Ctx, lines: string[], maxWidth: number, max: number, weight: number, family: string, spacing = 0) {
  let size = max;
  for (; size > 8; size -= 1) {
    setFont(ctx, weight, size, family, spacing);
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxWidth) break;
  }
  return size;
}

function drawTag(ctx: Ctx, w: number, h: number, brand: string, color: TagColor) {
  const type = FONT[brandType(brand)];
  const text = type.upper ? brand.toUpperCase() : brand;
  const short = Math.min(w, h);
  const size = fitSize(ctx, [text], w * 0.86 - short * 0.08, Math.round(short * 0.045), type.weight, type.family, type.spacing);
  setFont(ctx, type.weight, size, type.family, type.spacing);
  const box = tagBox(w, h, ctx.measureText(text).width, size);
  const c = TAG_COLORS[color];
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = short * 0.02;
  ctx.shadowOffsetY = short * 0.006;
  ctx.fillStyle = c.fill;
  roundRect(ctx, box.x, box.y, box.w, box.h, box.h * 0.12);
  ctx.fill();
  ctx.restore();
  // A stitched edge, like a sewn-in label.
  const inset = box.h * 0.13;
  ctx.save();
  ctx.strokeStyle = c.stitch;
  ctx.lineWidth = Math.max(1, short * 0.0025);
  ctx.setLineDash([short * 0.008, short * 0.006]);
  roundRect(ctx, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, box.h * 0.08);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = c.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(ctx, type.weight, size, type.family, type.spacing);
  // Letter spacing adds space after the last letter too; nudge back so the name sits centered.
  ctx.fillText(text, w / 2 + (size * type.spacing) / 2, box.y + box.h / 2 + size * 0.04);
}

function drawLines(ctx: Ctx, lines: string[], cx: number, cy: number, size: number) {
  const lh = size * 1.08;
  lines.forEach((l, i) => ctx.fillText(l, cx + (size * 0.04) / 2, cy + (i - (lines.length - 1) / 2) * lh + size * 0.04));
}

function drawBanner(ctx: Ctx, w: number, h: number, banner: string, style: BannerStyle, color: BannerColor) {
  const c = BANNER_COLORS[color];
  const short = Math.min(w, h);
  const text = banner.toUpperCase();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = short * 0.018;
  ctx.shadowOffsetY = short * 0.005;
  ctx.fillStyle = c.fill;
  if (style === "strip") {
    const lines = text.length > 18 ? wrapBalanced(text, 2) : [text];
    const bh = short * (lines.length > 1 ? 0.15 : 0.11);
    ctx.fillRect(0, 0, w, bh);
    ctx.restore();
    const size = fitSize(ctx, lines, w * 0.88, Math.round((bh / lines.length) * 0.62), 900, BANNER_FONT, 0.04);
    ctx.fillStyle = c.text;
    setFont(ctx, 900, size, BANNER_FONT, 0.04);
    drawLines(ctx, lines, w / 2, bh / 2, size);
  } else if (style === "corner") {
    const d = short * 0.2;
    const band = short * 0.085;
    const lines = [text];
    ctx.translate(d, d);
    ctx.rotate(-Math.PI / 4);
    ctx.fillRect(-d * 2.4, -band / 2, d * 4.8, band);
    ctx.restore();
    ctx.save();
    ctx.translate(d, d);
    ctx.rotate(-Math.PI / 4);
    const size = fitSize(ctx, lines, d * 2.4, Math.round(band * 0.6), 900, BANNER_FONT, 0.04);
    ctx.fillStyle = c.text;
    setFont(ctx, 900, size, BANNER_FONT, 0.04);
    drawLines(ctx, lines, 0, 0, size);
    ctx.restore();
  } else {
    const r = short * 0.16;
    const cx = w - r - short * 0.04;
    const cy = r + short * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const lines = wrapBalanced(text, 3);
    const size = fitSize(ctx, lines, r * 1.5, Math.round((r * 1.3) / Math.max(1.6, lines.length * 1.1)), 900, BANNER_FONT, 0.02);
    ctx.fillStyle = c.text;
    setFont(ctx, 900, size, BANNER_FONT, 0.02);
    drawLines(ctx, lines, cx, cy, size);
  }
}

// Draws the photo with its brand tag and banner onto a canvas, at most `maxSide` pixels across.
export function drawCover(canvas: HTMLCanvasElement, img: HTMLImageElement, design: CoverDesign, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d") as Ctx;
  const { width: w, height: h } = canvas;
  ctx.drawImage(img, 0, 0, w, h);
  if (design.banner?.trim()) drawBanner(ctx, w, h, design.banner.trim(), design.bannerStyle ?? "strip", design.bannerColor ?? "red");
  if (design.brand?.trim()) drawTag(ctx, w, h, design.brand.trim(), design.tagColor ?? "white");
}
