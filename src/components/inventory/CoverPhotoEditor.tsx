import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gift, Loader2, Tag, X } from "lucide-react";
import {
  BANNERS,
  BANNER_COLORS,
  BANNER_STYLES,
  BRANDS,
  FREE_GIFT_BANNER,
  TAG_COLORS,
  type BannerColor,
  type BannerStyle,
  type CoverDesign,
  type CoverEdit,
  type TagColor,
  drawCover,
  hasDesign,
  loadCoverFonts,
  matchBrand,
} from "@/lib/coverPhoto";
import { loadImage } from "@/lib/videoFrames";
import { minPriceLabel } from "@/lib/minPrice";
import { SectionLabel, inputClass, primaryButton, secondaryButton } from "../ui";

const chip = (on: boolean) =>
  `px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors ${on ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground hover:bg-muted"}`;

function Swatch({ fill, label, on, onClick }: { fill: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onClick}
      className={`w-7 h-7 rounded-full border flex items-center justify-center ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""} border-border`}
      style={{ background: fill }}
    >
      {on && <Check className="w-3.5 h-3.5" style={{ color: fill === "#ffffff" || fill === "#f3ead8" || fill === "#e3b94a" ? "#1c1917" : "#fff" }} />}
    </button>
  );
}

// Adds a brand tag at the bottom center and a sale banner to an item's cover photo.
export function CoverPhotoEditor({
  photo,
  edit,
  brandHint,
  savePhoto,
  onApply,
  onClose,
}: {
  photo: string; // the first photo as it is now
  edit?: CoverEdit; // what was added before, if this photo is still that finished cover
  brandHint?: string; // the item's Brand field
  savePhoto: (dataUrl: string) => Promise<string>;
  onApply: (photo: string, edit?: CoverEdit) => void;
  onClose: () => void;
}) {
  const original = edit?.original ?? photo;
  const hinted = matchBrand(brandHint)?.name ?? brandHint?.trim();
  const [design, setDesign] = useState<CoverDesign>(() =>
    edit ? { ...edit } : { brand: hinted || undefined, tagColor: "white", bannerStyle: "strip", bannerColor: "red" },
  );
  const [customBanner, setCustomBanner] = useState(() => (edit?.banner && !(BANNERS as readonly string[]).includes(edit.banner) ? edit.banner : ""));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const set = (patch: Partial<CoverDesign>) => setDesign((d) => ({ ...d, ...patch }));

  useEffect(() => {
    let live = true;
    Promise.all([loadImage(original), loadCoverFonts()])
      .then(([i]) => live && setImg(i))
      .catch(() => live && setProblem("This photo's link doesn't allow editing. Upload the photo from your device instead, then customize it."));
    return () => {
      live = false;
    };
  }, [original]);

  useEffect(() => {
    if (img && canvas.current) drawCover(canvas.current, img, design);
  }, [img, design]);

  const brandOptions = useMemo(() => BRANDS.map((b) => b.name), []);

  const apply = async () => {
    if (!canvas.current || !img) return;
    if (!hasDesign(design)) return onApply(original, undefined);
    setSaving(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = canvas.current.toDataURL("image/jpeg", 0.9);
      } catch {
        throw new Error("This photo's link doesn't allow editing. Upload the photo from your device instead.");
      }
      const url = await savePhoto(dataUrl);
      onApply(url, { ...design, brand: design.brand?.trim() || undefined, banner: design.banner?.trim() || undefined, original, applied: url });
    } catch (e) {
      setProblem((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 backdrop-blur-sm overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Customize cover photo" className="bg-card w-full max-w-4xl sm:my-6 sm:rounded-xl border border-border shadow-2xl flex flex-col min-h-full sm:min-h-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">Customize cover photo</h2>
            <p className="text-xs text-muted-foreground">Add a brand tag and a sale banner. Your original photo is kept, so you can change this any time.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 grid md:grid-cols-[1fr_20rem] gap-6">
          <div className="rounded-lg border border-border bg-muted/40 flex items-center justify-center min-h-64 overflow-hidden">
            {problem && !img ? (
              <p className="p-6 text-sm text-muted-foreground text-center">{problem}</p>
            ) : !img ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : null}
            <canvas ref={canvas} aria-label="Cover photo preview" className={`max-w-full max-h-[70vh] object-contain ${img ? "" : "hidden"}`} />
          </div>

          <div className="space-y-6">
            <section className="space-y-2.5">
              <SectionLabel className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Brand tag
              </SectionLabel>
              <input
                className={inputClass}
                list="cover-brands"
                placeholder="Search 100 brands, or type your own"
                aria-label="Brand on the tag"
                value={design.brand ?? ""}
                onChange={(e) => set({ brand: e.target.value })}
              />
              <datalist id="cover-brands">
                {brandOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <div className="flex items-center gap-2">
                {(Object.keys(TAG_COLORS) as TagColor[]).map((k) => (
                  <Swatch key={k} fill={TAG_COLORS[k].fill} label={`${TAG_COLORS[k].label} tag`} on={(design.tagColor ?? "white") === k} onClick={() => set({ tagColor: k })} />
                ))}
                {design.brand && (
                  <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => set({ brand: "" })}>
                    No tag
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Tags show the brand's name in SellSync's own lettering, not the brand's logo. Only tag the brand the item really is.
              </p>
            </section>

            <section className="space-y-2.5">
              <SectionLabel>Sale banner</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={chip(!design.banner)} onClick={() => (set({ banner: "" }), setCustomBanner(""))}>
                  None
                </button>
                {BANNERS.map((b) => (
                  <button key={b} type="button" aria-pressed={design.banner === b} className={chip(design.banner === b)} onClick={() => (set({ banner: b }), setCustomBanner(""))}>
                    {b === FREE_GIFT_BANNER && <Gift className="inline w-3 h-3 mr-1 -mt-0.5" />}
                    {b}
                  </button>
                ))}
              </div>
              <input
                className={inputClass}
                placeholder="Or write your own, like 3 FOR $25"
                aria-label="Custom banner"
                maxLength={32}
                value={customBanner}
                onChange={(e) => {
                  setCustomBanner(e.target.value);
                  set({ banner: e.target.value });
                }}
              />
              {design.banner?.trim() && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(BANNER_STYLES) as BannerStyle[]).map((k) => (
                      <button key={k} type="button" aria-pressed={(design.bannerStyle ?? "strip") === k} className={chip((design.bannerStyle ?? "strip") === k)} onClick={() => set({ bannerStyle: k })}>
                        {BANNER_STYLES[k]}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {(Object.keys(BANNER_COLORS) as BannerColor[]).map((k) => (
                      <Swatch key={k} fill={BANNER_COLORS[k].fill} label={`${BANNER_COLORS[k].label} banner`} on={(design.bannerColor ?? "red") === k} onClick={() => set({ bannerColor: k })} />
                    ))}
                  </div>
                </>
              )}
              {design.banner === FREE_GIFT_BANNER && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Tip: put this on an item that sells well, and include a small item from your closet as the gift. It's a great home for anything you'd want to price under {minPriceLabel}.
                </p>
              )}
            </section>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          {edit && (
            <button type="button" onClick={() => onApply(original, undefined)} className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">
              Back to original photo
            </button>
          )}
          {problem && img && <p className="text-[12px] text-destructive">{problem}</p>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" disabled={!img || saving} onClick={() => void apply()} className={primaryButton}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Use as cover
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
