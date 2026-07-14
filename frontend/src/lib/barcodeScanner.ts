// Camera barcode scanning. Two decoders, same interface:
//
//   1. The browser's own BarcodeDetector, when it exists (Chrome on Android /
//      ChromeOS / macOS) — native speed, nothing to download.
//   2. ZXing otherwise (Chrome on Windows, Firefox, Safari…), loaded on demand
//      so its ~200 kB stays out of the main bundle until someone scans.
//
// So the Scan button shows wherever there's a camera. Note getUserMedia only
// exists in a secure context: https, or localhost during development. Over
// plain http on a LAN address the browser withholds the camera entirely, and
// the button hides — the typed-barcode field still works.

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
const DETECTOR_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

const DETECT_INTERVAL_MS = 150;

export function canScanBarcodes(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export interface BarcodeScanSession {
  stop: () => void;
}

// Streams the back camera into `video` and watches for a product barcode.
// Calls `onCode` at most once, with the camera already released. Throws when
// the camera can't be opened (no permission, no device).
export async function startBarcodeScan(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<BarcodeScanSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });

  return window.BarcodeDetector
    ? scanWithDetector(window.BarcodeDetector, stream, video, onCode)
    : scanWithZxing(stream, video, onCode);
}

async function scanWithDetector(
  Detector: BarcodeDetectorCtor,
  stream: MediaStream,
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<BarcodeScanSession> {
  const supported = await Detector.getSupportedFormats();
  const formats = DETECTOR_FORMATS.filter((f) => supported.includes(f));
  const detector = new Detector({ formats: formats.length > 0 ? formats : supported });

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
  await video.play().catch(stop); // autoplay rejected (sheet closed mid-open)

  async function poll() {
    if (stopped) return;
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
        // A bad frame is normal — keep watching.
      }
    }
    timer = window.setTimeout(() => void poll(), DETECT_INTERVAL_MS);
  }

  void poll();
  return { stop };
}

async function scanWithZxing(
  stream: MediaStream,
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<BarcodeScanSession> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);

  const hints = new Map([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
    ],
  ]);
  const reader = new BrowserMultiFormatReader(hints);

  let stopped = false;
  // Boxed so `stop` can reach the controls that only exist after the call below.
  const scanner: { controls?: { stop: () => void } } = {};

  const stop = () => {
    if (stopped) return;
    stopped = true;
    scanner.controls?.stop(); // releases the camera tracks too
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  // The callback fires on every frame — with a result only when one decodes.
  // Errors on undecodable frames are the normal case, so they're ignored.
  scanner.controls = await reader.decodeFromStream(stream, video, (result) => {
    const code = result?.getText();
    if (!code || stopped) return;
    stop();
    onCode(code);
  });

  if (stopped) scanner.controls.stop(); // closed while the decoder was loading
  return { stop };
}
