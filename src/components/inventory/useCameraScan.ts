import { useEffect, useRef, useState } from "react";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (o: { formats: string[] }) => BarcodeDetectorLike;

export type CameraState = "off" | "starting" | "on" | "blocked" | "none";

export const cameraAvailable = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

// Reads QR codes (and, where the browser can, printed barcodes) from the back camera. Chrome and
// Android use the browser's own reader; iPhone and Firefox fall back to a QR reader that runs in
// the page, so stickers scan on every phone.
export function useCameraScan(active: boolean, onCode: (text: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>(active ? "starting" : "off");
  const handler = useRef(onCode);
  handler.current = onCode;

  useEffect(() => {
    if (!active) {
      setState("off");
      return;
    }
    if (!cameraAvailable()) {
      setState("none");
      return;
    }
    let stream: MediaStream | null = null;
    let stopped = false;
    let last = "";
    let lastAt = 0;
    setState("starting");

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch {
        if (!stopped) setState("blocked");
        return;
      }
      const v = video.current;
      if (stopped || !v) return;
      v.srcObject = stream;
      v.setAttribute("playsinline", "true");
      await v.play().catch(() => undefined);
      setState("on");

      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      let native: BarcodeDetectorLike | null = null;
      if (Native) {
        try {
          native = new Native({ formats: ["qr_code", "code_128", "ean_13", "upc_a", "code_39"] });
        } catch {
          native = null;
        }
      }
      const jsQR = native ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      while (!stopped) {
        let text = "";
        if (v.readyState >= 2 && v.videoWidth) {
          if (native) {
            const codes = await native.detect(v).catch(() => []);
            text = codes[0]?.rawValue ?? "";
          } else if (jsQR && ctx) {
            // A smaller frame reads just as well and keeps older phones quick.
            const scale = Math.min(1, 640 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? "";
          }
        }
        // The same sticker stays in view for a moment; count it once.
        if (text && (text !== last || Date.now() - lastAt > 2500)) {
          last = text;
          lastAt = Date.now();
          navigator.vibrate?.(60);
          handler.current(text);
        }
        await new Promise((r) => setTimeout(r, 180));
      }
    };
    void run();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { video, state };
}
