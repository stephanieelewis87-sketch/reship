import type { Box, FrameSample } from "./videoListing";
import { MAX_VIDEO_SECONDS, padBox } from "./videoListing";

// Reads frames out of a video file in the browser, so the video itself never has to be uploaded.

export interface SampledVideo {
  duration: number;
  samples: FrameSample[];
  // Full-size frames (JPEG data URLs), one per sample, for snips and for the AI.
  images: string[];
  width: number;
  height: number;
}

const SIG_SIDE = 8; // 8x8 color thumbnail per frame for cut detection
const SHARP_SIDE = 64; // grayscale square for measuring sharpness

function loadVideo(file: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("This video can't be opened in the browser. Try an MP4 or MOV from your phone's camera."));
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

// Variance of a simple edge filter: blurry frames score low.
function sharpness(gray: Float32Array, side: number): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < side - 1; y++)
    for (let x = 1; x < side - 1; x++) {
      const i = y * side + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - side] - gray[i + side];
      sum += lap;
      sq += lap * lap;
      n++;
    }
  return sq / n - (sum / n) ** 2;
}

// Samples the video every so often (about 240 looks at most). maxSide limits the size of the kept frames.
// The frame's color thumbnail for cut detection: each cell is the average of a block of the 64x64
// image. Shrinking straight to 8x8 samples only a few pixels per cell, so a little camera shake
// changes the thumbnail a lot and handheld videos look like one long blur of change.
export function blockAverage(rgba: ArrayLike<number>, side: number, cells: number): number[] {
  const block = side / cells;
  const sig = new Array<number>(cells * cells * 3).fill(0);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const p = (y * side + x) * 4;
      const c = (Math.floor(y / block) * cells + Math.floor(x / block)) * 3;
      sig[c] += rgba[p];
      sig[c + 1] += rgba[p + 1];
      sig[c + 2] += rgba[p + 2];
    }
  return sig.map((v) => v / (block * block));
}

export async function sampleVideo(file: Blob, onProgress?: (done: number) => void, maxSide = 1024): Promise<SampledVideo> {
  const v = await loadVideo(file);
  try {
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("This video has no length we can read.");
    if (duration > MAX_VIDEO_SECONDS + 1) throw new Error(`Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes. This one is ${Math.round(duration / 60)} minutes.`);
    const step = Math.max(0.5, duration / 240);
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const width = Math.round(v.videoWidth * scale);
    const height = Math.round(v.videoHeight * scale);
    const full = Object.assign(document.createElement("canvas"), { width, height });
    const sharp = Object.assign(document.createElement("canvas"), { width: SHARP_SIDE, height: SHARP_SIDE });
    const fctx = full.getContext("2d")!;
    const pctx = sharp.getContext("2d", { willReadFrequently: true })!;
    pctx.imageSmoothingQuality = "high";
    const samples: FrameSample[] = [];
    const images: string[] = [];
    const times: number[] = [];
    for (let t = Math.min(0.2, duration / 2); t < duration; t += step) times.push(t);
    for (const [n, t] of times.entries()) {
      await seek(v, t);
      fctx.drawImage(v, 0, 0, width, height);
      pctx.drawImage(full, 0, 0, SHARP_SIDE, SHARP_SIDE);
      const g = pctx.getImageData(0, 0, SHARP_SIDE, SHARP_SIDE).data;
      const sig = blockAverage(g, SHARP_SIDE, SIG_SIDE);
      const gray = new Float32Array(SHARP_SIDE * SHARP_SIDE);
      for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * g[i * 4] + 0.587 * g[i * 4 + 1] + 0.114 * g[i * 4 + 2];
      samples.push({ t, sig, sharpness: sharpness(gray, SHARP_SIDE) });
      images.push(full.toDataURL("image/jpeg", 0.82));
      onProgress?.((n + 1) / times.length);
    }
    return { duration, samples, images, width, height };
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that photo."));
    img.src = src;
  });

// Cuts the item out of a frame (padded a little). Without a box, returns the frame resized.
export async function cropFrame(src: string, box?: Box, maxSide = 1024, opts: { touchUp?: boolean } = {}): Promise<string> {
  const img = await loadImage(src);
  const b = box ? padBox(box) : { x: 0, y: 0, w: 1, h: 1 };
  const sw = img.naturalWidth * b.w;
  const sh = img.naturalHeight * b.h;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(sw * scale), height: Math.round(sh * scale) });
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, img.naturalWidth * b.x, img.naturalHeight * b.y, sw, sh, 0, 0, c.width, c.height);
  if (opts.touchUp && c.width > 2 && c.height > 2) {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    data.data.set(touchUpPixels(data.data, c.width, c.height));
    ctx.putImageData(data, 0, 0);
  }
  return c.toDataURL("image/jpeg", 0.9);
}

// Makes a video snip look like a good phone photo of the item, without changing the item:
// brightens a dim frame, stretches flat contrast, takes out most of a yellow or blue light cast,
// and sharpens a little. No AI and nothing added or removed, so wrinkles, wear and flaws stay
// exactly as they are. Each step is capped so a well-lit frame comes out nearly unchanged.
export function touchUpPixels(src: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const n = w * h;
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  let sr = 0, sg = 0, sb = 0, mids = 0;
  for (let i = 0; i < n; i++) {
    const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    hist[Math.min(255, Math.round(l))]++;
    // Mid-tones only for the color cast, so a black or white item doesn't skew it.
    if (l > 40 && l < 220) (sr += r), (sg += g), (sb += b), mids++;
  }
  const at = (q: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) if ((seen += hist[v]) >= q * n) return v;
    return 255;
  };
  // Black point never moves past 25 and the white point stays at or above 160, so dark items stay
  // dark and a frame with no true white isn't blown out.
  const lo = Math.min(at(0.01), 25);
  const hi = Math.max(at(0.99), 160);
  const gain = Math.min(1.6, 255 / Math.max(1, hi - lo));
  // Halfway toward neutral gray, never more than 12% per channel.
  const avg = mids ? (sr + sg + sb) / (3 * mids) : 0;
  const cast = (s: number) => (mids && s ? Math.min(1.12, Math.max(0.88, 1 + 0.5 * (avg / (s / mids) - 1))) : 1);
  const wb = [cast(sr), cast(sg), cast(sb)];
  // A gentle lift for dim frames (indoor video is usually underexposed).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += lum[i];
  mean /= n * 255;
  const gamma = mean < 0.45 ? Math.max(0.72, 0.5 + mean) : 1;
  const curve = new Float32Array(256);
  for (let v = 0; v < 256; v++) curve[v] = 255 * Math.pow(Math.min(1, Math.max(0, ((v - lo) * gain) / 255)), gamma);
  const tone = new Float32Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) tone[i * 3 + c] = curve[Math.min(255, Math.max(0, Math.round(src[i * 4 + c] * wb[c])))];
  // Light sharpening: push each pixel 35% away from the average of its four neighbors.
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let c = 0; c < 3; c++) {
        const v = tone[i * 3 + c];
        const edge = x > 0 && y > 0 && x < w - 1 && y < h - 1;
        const nb = edge ? (tone[(i - 1) * 3 + c] + tone[(i + 1) * 3 + c] + tone[(i - w) * 3 + c] + tone[(i + w) * 3 + c]) / 4 : v;
        out[i * 4 + c] = v + 0.35 * (v - nb);
      }
      out[i * 4 + 3] = 255;
    }
  return out;
}

// Shrinks any image to fit maxSide, as a JPEG. Used for frames sent to the AI and photos kept in demo mode.
export const shrinkImage = (src: string, maxSide: number) => cropFrame(src, undefined, maxSide);

// "data:image/jpeg;base64,AAAA" -> { media_type, data } for the AI service.
export function splitDataUrl(url: string): { media_type: string; data: string } {
  const m = url.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("Not an image data URL.");
  return { media_type: m[1], data: m[2] };
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

// Reads one photo the seller picked: a copy up to maxSide as a JPEG, and a tiny color thumbnail
// for telling items apart when AI is off. The original file never leaves the device.
export async function readPhoto(file: File, maxSide = 1600): Promise<{ image: string; sig: number[] }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new Error(`${file.name} can't be opened in this browser.`);
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const small = Object.assign(document.createElement("canvas"), { width: SIG_SIDE, height: SIG_SIDE });
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(c, 0, 0, SIG_SIDE, SIG_SIDE);
    const px = sctx.getImageData(0, 0, SIG_SIDE, SIG_SIDE).data;
    const sig: number[] = [];
    for (let i = 0; i < px.length; i += 4) sig.push(px[i], px[i + 1], px[i + 2]);
    return { image: c.toDataURL("image/jpeg", 0.85), sig };
  } finally {
    URL.revokeObjectURL(url);
  }
}
