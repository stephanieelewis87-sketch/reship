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
    const small = Object.assign(document.createElement("canvas"), { width: SIG_SIDE, height: SIG_SIDE });
    const sharp = Object.assign(document.createElement("canvas"), { width: SHARP_SIDE, height: SHARP_SIDE });
    const fctx = full.getContext("2d")!;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const pctx = sharp.getContext("2d", { willReadFrequently: true })!;
    const samples: FrameSample[] = [];
    const images: string[] = [];
    const times: number[] = [];
    for (let t = Math.min(0.2, duration / 2); t < duration; t += step) times.push(t);
    for (const [n, t] of times.entries()) {
      await seek(v, t);
      fctx.drawImage(v, 0, 0, width, height);
      sctx.drawImage(full, 0, 0, SIG_SIDE, SIG_SIDE);
      const px = sctx.getImageData(0, 0, SIG_SIDE, SIG_SIDE).data;
      const sig: number[] = [];
      for (let i = 0; i < px.length; i += 4) sig.push(px[i], px[i + 1], px[i + 2]);
      pctx.drawImage(full, 0, 0, SHARP_SIDE, SHARP_SIDE);
      const g = pctx.getImageData(0, 0, SHARP_SIDE, SHARP_SIDE).data;
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

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that photo."));
    img.src = src;
  });

// Cuts the item out of a frame (padded a little). Without a box, returns the frame resized.
export async function cropFrame(src: string, box?: Box, maxSide = 1024): Promise<string> {
  const img = await loadImage(src);
  const b = box ? padBox(box) : { x: 0, y: 0, w: 1, h: 1 };
  const sw = img.naturalWidth * b.w;
  const sh = img.naturalHeight * b.h;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(sw * scale), height: Math.round(sh * scale) });
  c.getContext("2d")!.drawImage(img, img.naturalWidth * b.x, img.naturalHeight * b.y, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
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
