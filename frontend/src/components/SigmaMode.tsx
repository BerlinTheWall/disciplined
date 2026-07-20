import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Skull } from "lucide-react";

import { tap } from "@/lib/motion";
import { SIGMA_LINES, speakHard, synthesizeSigmaLine } from "@/lib/sigma";
import { getSigmaBlob } from "@/lib/sigmaMedia";
import { useSigmaStore } from "@/store/sigmaStore";

// Personal-use-only hype layer for Sigma Mode. Mounted once at the app root
// (see App.tsx) and renders nothing while off. While on:
//   - a rising edge (off -> on) plays a full-screen "activated" splash
//   - a recurring timer fires a random hype action as a flashing banner
//   - a floating flame button fires one on demand, for when you're slacking
//     and need it *right now*
// A "fire" either speaks a line (custom, editable in the Sigma manager, or
// the built-in defaults) — read by Gemini's deep, intense "sigma" voice
// preset, falling back to the device's local voice if that's unreachable —
// or plays a random uploaded voice/song clip; see pickAction. Nothing here
// touches the shared reminder/notification systems — it's fully separate so
// it can never leak into the normal app experience.

const MIN_INTERVAL_MS = 3 * 60_000;
const MAX_INTERVAL_MS = 8 * 60_000;
const BANNER_MS = 4_500;
// When at least one audio clip is uploaded, this fraction of fires play a
// clip instead of speaking a line — audio gets real presence regardless of
// how many text lines exist.
const AUDIO_CHANCE = 0.5;

type SigmaAction = { kind: "text"; text: string } | { kind: "audio"; id: string; name: string };

function pickAction(): SigmaAction {
  const { lines, media } = useSigmaStore.getState();
  const audios = media.filter((m) => m.kind === "audio");
  if (audios.length > 0 && Math.random() < AUDIO_CHANCE) {
    const a = audios[Math.floor(Math.random() * audios.length)];
    return { kind: "audio", id: a.id, name: a.name };
  }
  const pool = lines.length > 0 ? lines : SIGMA_LINES;
  return { kind: "text", text: pool[Math.floor(Math.random() * pool.length)] };
}

export default function SigmaMode() {
  const on = useSigmaStore((s) => s.on);
  const wasOn = useRef(false);
  const [activating, setActivating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The currently-playing clip (uploaded or Gemini-synthesized), so a new
  // fire cuts off the last one instead of piling up overlapping audio.
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  function stopCurrentAudio() {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
  }

  // Plays a blob (object URL revoked once done), replacing whatever's
  // currently playing. Rejects if playback couldn't start (blocked, etc.).
  function playBlob(blob: Blob): Promise<void> {
    stopCurrentAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio.current = audio;
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    return audio.play().catch((e) => {
      URL.revokeObjectURL(url);
      throw e;
    });
  }

  // Gemini's deep "sigma" voice for a line; false (not thrown) on any
  // failure so callers fall back to the device voice.
  async function speakGemini(text: string): Promise<boolean> {
    try {
      const blob = await synthesizeSigmaLine(text);
      await playBlob(blob);
      return true;
    } catch (e) {
      console.warn("[sigma] Gemini voice unavailable, using device voice", e);
      return false;
    }
  }

  async function fire() {
    const action = pickAction();
    clearTimeout(bannerTimer.current);

    if (action.kind === "audio") {
      const blob = await getSigmaBlob(action.id);
      if (blob) {
        try {
          await playBlob(blob);
          setBanner(`🔊 ${action.name}`);
          bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
          return;
        } catch {
          // Playback blocked/failed — fall through to a spoken line instead.
        }
      }
    }

    const text =
      action.kind === "text"
        ? action.text
        : SIGMA_LINES[Math.floor(Math.random() * SIGMA_LINES.length)];
    setBanner(text);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
    const ok = await speakGemini(text);
    if (!ok) speakHard(text);
  }

  // Rising edge: off -> on plays the activation splash.
  useEffect(() => {
    if (on && !wasOn.current) {
      setActivating(true);
      const line = "Sigma mode activated. No more slacking.";
      void speakGemini(line).then((ok) => {
        if (!ok) speakHard(line);
      });
      const id = setTimeout(() => setActivating(false), 2200);
      wasOn.current = true;
      return () => clearTimeout(id);
    }
    wasOn.current = on;
    // speakGemini only closes over refs (stable) — re-running this on every
    // render would just be redundant, not different behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // Recurring, randomly-timed hype while on.
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      timer = setTimeout(() => {
        void fire();
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
    // fire() only reads live state via getState() and closes over refs — it
    // doesn't change in any way that should restart the timer loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  useEffect(
    () => () => {
      clearTimeout(bannerTimer.current);
      stopCurrentAudio();
    },
    []
  );

  if (!on) return null;

  return (
    <>
      {/* Activation splash */}
      <AnimatePresence>
        {activating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-black"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Skull size={72} color="#dc1414" strokeWidth={1.5} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black tracking-[0.15em] text-[#dc1414]"
            >
              SIGMA MODE
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-sm font-semibold tracking-widest text-neutral-400 uppercase"
            >
              No more slacking
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hype banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="fixed inset-x-4 z-[92] pointer-events-none"
            style={{ top: "calc(16px + env(safe-area-inset-top))" }}
          >
            <div className="rounded-2xl border-2 border-[#dc1414] bg-black px-4 py-3.5 shadow-[0_0_24px_rgba(220,20,20,0.5)]">
              <p className="text-center text-[15px] font-extrabold uppercase tracking-wide text-[#f5f5f5]">
                {banner}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating "fuel" button — fires an action right now. Parked above the
          nav's other floating controls (pill/mic/schedule + button) so it
          never overlaps them on any page. */}
      <motion.button
        onClick={() => void fire()}
        whileTap={tap}
        aria-label="Demand motivation"
        className="fixed z-[91] flex h-14 w-14 items-center justify-center rounded-full border-2"
        style={{
          right: 16,
          bottom: "calc(146px + var(--nav-bottom))",
          backgroundColor: "#0a0a0a",
          borderColor: "#dc1414",
          boxShadow: "0 0 16px rgba(220,20,20,0.45)",
        }}
      >
        <Flame size={24} color="#dc1414" />
      </motion.button>
    </>
  );
}
