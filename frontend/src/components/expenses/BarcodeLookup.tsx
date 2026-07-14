import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CircleCheck, LoaderCircle, ScanBarcode, Search, X } from "lucide-react";
import { createPortal } from "react-dom";

import { canScanBarcodes, startBarcodeScan, type BarcodeScanSession } from "@/lib/barcodeScanner";
import { tap } from "@/lib/motion";
import { lookupBarcode, type ScannedProduct } from "@/lib/openFoodFacts";
import Collapse from "../Collapse";

interface BarcodeLookupProps {
  // Fires with the mapped product after a successful lookup.
  onProduct: (product: ScannedProduct) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; name: string }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

// Barcode row for the grocery item sheet: scan with the camera (where the
// browser supports it) or type a code, and the product's name, category,
// package size and nutrition are fetched from Open Food Facts to prefill the
// form.
export default function BarcodeLookup({ onProduct }: BarcodeLookupProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [scanning, setScanning] = useState(false);

  async function lookup(rawCode: string) {
    const digits = rawCode.replace(/\D/g, "");
    if (!digits || status.kind === "loading") return;
    setStatus({ kind: "loading" });
    try {
      const product = await lookupBarcode(digits);
      if (product) {
        setStatus({ kind: "found", name: product.name || "product" });
        onProduct(product);
      } else {
        setStatus({ kind: "notFound" });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Couldn't reach the food database — check your connection.",
      });
    }
  }

  function handleScanned(scanned: string) {
    setScanning(false);
    setCode(scanned);
    void lookup(scanned);
  }

  return (
    <div className="mb-4">
      <label className="text-sm text-fg-muted mb-1 block">
        Barcode <span className="text-fg-faint">(fills in the details for you)</span>
      </label>
      <div className="flex gap-2">
        {canScanBarcodes() && (
          <motion.button
            onClick={() => setScanning(true)}
            whileTap={tap}
            className="flex items-center gap-1.5 px-3.5 rounded-xl bg-surface-inverse text-fg-inverse text-sm font-medium shrink-0"
          >
            <ScanBarcode size={18} />
            Scan
          </motion.button>
        )}
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup(code);
            }}
            placeholder="e.g. 3017624010701"
            className="w-full text-base border border-border-input rounded-xl pl-4 pr-11 py-3 focus:outline-none focus:border-border-focus"
          />
          <motion.button
            onClick={() => void lookup(code)}
            whileTap={tap}
            disabled={!code.trim()}
            aria-label="Look up barcode"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-fg-muted disabled:opacity-40"
          >
            <Search size={18} />
          </motion.button>
        </div>
      </div>

      <Collapse open={status.kind !== "idle"}>
        <div className="pt-2">
          {status.kind === "loading" && (
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <LoaderCircle size={14} className="animate-spin" />
              Looking up product…
            </p>
          )}
          {status.kind === "found" && (
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <CircleCheck size={14} className="text-[#34d399]" />
              Found <span className="font-medium text-fg">{status.name}</span> — details filled in
              below.
            </p>
          )}
          {status.kind === "notFound" && (
            <p className="text-sm text-fg-faint">
              No product found for this barcode — fill it in manually.
            </p>
          )}
          {status.kind === "error" && <p className="text-sm text-red-400">{status.message}</p>}
        </div>
      </Collapse>

      {scanning && <ScannerOverlay onCode={handleScanned} onClose={() => setScanning(false)} />}
    </div>
  );
}

// Full-screen camera view with a framing guide. Portaled to <body>: the bottom
// sheet is a transformed ancestor, which would hijack position:fixed.
function ScannerOverlay({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let session: BarcodeScanSession | undefined;
    let cancelled = false;
    startBarcodeScan(video, onCode)
      .then((s) => {
        if (cancelled) s.stop();
        else {
          session = s;
          setStarting(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // NotFoundError = no camera on this machine; NotAllowedError = blocked.
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotFoundError"
            ? "No camera found on this device — type the barcode instead."
            : "Couldn't open the camera — allow camera access and try again."
        );
        setStarting(false);
      });
    return () => {
      cancelled = true;
      session?.stop();
    };
    // Camera lifetime = overlay lifetime; a scan unmounts the overlay anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-80 bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-white/90">{error}</p>
          <motion.button
            onClick={onClose}
            whileTap={tap}
            className="px-4 py-2 rounded-full bg-white text-gray-900 text-sm font-medium"
          >
            Close
          </motion.button>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {/* The box's giant shadow dims everything outside the framing guide */}
          <div
            className="w-72 max-w-[80vw] h-40 rounded-2xl border-2 border-white/80"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
          />
          <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-white/85">
            {starting && <LoaderCircle size={14} className="animate-spin" />}
            {starting ? "Starting camera…" : "Point the camera at a barcode"}
          </p>
        </div>
      )}

      <motion.button
        onClick={onClose}
        whileTap={tap}
        aria-label="Close scanner"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"
        style={{ top: "calc(16px + env(safe-area-inset-top))" }}
      >
        <X size={20} />
      </motion.button>
    </motion.div>,
    document.body
  );
}
