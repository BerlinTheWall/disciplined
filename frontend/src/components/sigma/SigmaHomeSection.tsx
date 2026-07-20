import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings2, X } from "lucide-react";

import { useSigmaMediaUrl } from "@/hooks/useSigmaMediaUrl";
import { tap } from "@/lib/motion";
import { useSigmaStore, type SigmaMediaItem } from "@/store/sigmaStore";

// The Home page's Sigma Mode section — only rendered while Sigma is on (see
// HomePage.tsx). Shows whatever the user has uploaded via the Sigma manager:
// hype videos, motivational photos, and voice/song clips. Everything here is
// device-local; the section disappears with nothing to complain about when
// the library is empty (just a prompt to add fuel).

function VideoCard({ item }: { item: SigmaMediaItem }) {
  const url = useSigmaMediaUrl(item.id);
  if (!url) return null;
  return (
    <video
      src={url}
      controls
      playsInline
      className="w-full rounded-2xl border-2 mb-2.5 last:mb-0"
      style={{ borderColor: "#dc1414", maxHeight: 220 }}
    />
  );
}

function ImageThumb({ item, onOpen }: { item: SigmaMediaItem; onOpen: (url: string) => void }) {
  const url = useSigmaMediaUrl(item.id);
  if (!url) return null;
  return (
    <motion.button whileTap={tap} onClick={() => onOpen(url)} className="shrink-0">
      <img
        src={url}
        alt=""
        className="w-24 h-24 rounded-xl object-cover border-2"
        style={{ borderColor: "#dc1414" }}
      />
    </motion.button>
  );
}

function AudioRow({ item }: { item: SigmaMediaItem }) {
  const url = useSigmaMediaUrl(item.id);
  if (!url) return null;
  return (
    <div
      className="rounded-xl bg-surface-alt border px-3 py-2.5 mb-2 last:mb-0"
      style={{ borderColor: "#2a2a2a" }}
    >
      <p className="text-xs font-semibold text-fg mb-1 truncate">{item.name}</p>
      <audio src={url} controls className="w-full h-8" />
    </div>
  );
}

export default function SigmaHomeSection() {
  const media = useSigmaStore((s) => s.media);
  const openManager = useSigmaStore((s) => s.openManager);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const videos = media.filter((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");
  const audios = media.filter((m) => m.kind === "audio");
  const empty = media.length === 0;

  return (
    <div
      className="rounded-3xl border-2 p-4"
      style={{ borderColor: "#dc1414", backgroundColor: "#0a0a0a" }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black uppercase tracking-widest" style={{ color: "#dc1414" }}>
          🔥 Sigma Fuel
        </p>
        <motion.button
          onClick={openManager}
          whileTap={tap}
          aria-label="Manage Sigma content"
          className="p-1.5 -m-1"
        >
          <Settings2 size={17} color="#b0b0b0" />
        </motion.button>
      </div>

      {empty ? (
        <motion.button
          onClick={openManager}
          whileTap={tap}
          className="w-full rounded-2xl border border-dashed py-5 text-center"
          style={{ borderColor: "#3a3a3a" }}
        >
          <p className="text-sm" style={{ color: "#b0b0b0" }}>
            No fuel loaded — tap to add videos, photos or voices.
          </p>
        </motion.button>
      ) : (
        <div>
          {videos.length > 0 && (
            <div className="mb-3">
              {videos.map((v) => (
                <VideoCard key={v.id} item={v} />
              ))}
            </div>
          )}
          {images.length > 0 && (
            <div
              className="flex gap-2.5 overflow-x-auto pb-1 mb-3"
              style={{ scrollbarWidth: "none" }}
            >
              {images.map((img) => (
                <ImageThumb key={img.id} item={img} onOpen={setViewerUrl} />
              ))}
            </div>
          )}
          {audios.length > 0 && (
            <div>
              {audios.map((a) => (
                <AudioRow key={a.id} item={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full-screen image viewer */}
      <AnimatePresence>
        {viewerUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewerUrl(null)}
            className="fixed inset-0 z-[96] flex items-center justify-center bg-black/90 p-6"
          >
            <img
              src={viewerUrl}
              alt=""
              className="max-w-full max-h-full rounded-xl object-contain"
            />
            <button
              onClick={() => setViewerUrl(null)}
              aria-label="Close"
              className="absolute p-2 text-white"
              style={{ top: "calc(16px + env(safe-area-inset-top))", right: 16 }}
            >
              <X size={26} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
