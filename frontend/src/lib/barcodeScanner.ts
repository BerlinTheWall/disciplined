// Camera barcode scanning through the browser's BarcodeDetector API. Chrome on
// Android (and ChromeOS/macOS) supports it; where it's missing the Scan button
// simply doesn't render and the barcode field accepts a typed code instead.

// BarcodeDetector is a draft spec, still absent from TypeScript's DOM lib.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

// Retail product formats only — keeps the scanner from locking onto QR codes.
const PRODUCT_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

const DETECT_INTERVAL_MS = 150;

export function canScanBarcodes(): boolean {
  return !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;
}

export interface BarcodeScanSession {
  stop: () => void;
}

// Streams the back camera into `video` and polls for a product barcode.
// Resolves through `onCode` exactly once, with the session already stopped.
// Throws (from the getUserMedia call) when the camera can't be opened.
export async function startBarcodeScan(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<BarcodeScanSession> {
  const Detector = window.BarcodeDetector;
  if (!Detector) throw new Error("Barcode scanning isn't supported in this browser.");

  const supported = await Detector.getSupportedFormats();
  const formats = PRODUCT_FORMATS.filter((f) => supported.includes(f));
  const detector = new Detector({ formats: formats.length > 0 ? formats : supported });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });

  let stopped = false;
  let timer: number | undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  video.srcObject = stream;
  await video.play().catch(() => {
    // Autoplay rejection (e.g. the sheet closed mid-open) — treated as stopped.
    stop();
  });

  async function poll() {
    if (stopped) return;
    // Detection failures on an odd frame are par for the course — keep polling.
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        const barcodes = await detector.detect(video);
        const code = barcodes.find((b) => b.rawValue)?.rawValue;
        if (code && !stopped) {
          stop();
          onCode(code);
          return;
        }
      } catch {
        // ignore and retry on the next frame
      }
    }
    timer = window.setTimeout(() => void poll(), DETECT_INTERVAL_MS);
  }

  void poll();
  return { stop };
}
