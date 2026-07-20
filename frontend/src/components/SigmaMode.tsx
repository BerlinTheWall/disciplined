import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Skull } from "lucide-react";

import { tap } from "@/lib/motion";
import { sigmaLine, speakHard } from "@/lib/sigma";
import { useSigmaStore } from "@/store/sigmaStore";

// Personal-use-only hype layer for Sigma Mode. Mounted once at the app root
// (see App.tsx) and renders nothing while off. While on:
//   - a rising edge (off -> on) plays a full-screen "activated" splash
//   - a recurring timer barks a random line as a flashing banner + speech
//   - a floating skull button lets you demand a line on tap, for when
//     you're slacking and need it *right now*
// Nothing here touches the shared reminder/notification systems — it's fully
// separate so it can never leak into the normal app experience.

const MIN_INTERVAL_MS = 3 * 60_000;
const MAX_INTERVAL_MS = 8 * 60_000;
const BANNER_MS = 4_500;

export default function SigmaMode() {
  const on = useSigmaStore((s) => s.on);
  const wasOn = useRef(false);
  const [activating, setActivating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function bark(text: string) {
    clearTimeout(bannerTimer.current);
    setBanner(text);
    speakHard(text);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }

  // Rising edge: off -> on plays the activation splash.
  useEffect(() => {
    if (on && !wasOn.current) {
      setActivating(true);
      speakHard("Sigma mode activated. No more slacking.");
      const id = setTimeout(() => setActivating(false), 2200);
      wasOn.current = true;
      return () => clearTimeout(id);
    }
    wasOn.current = on;
  }, [on]);

  // Recurring, randomly-timed hype while on.
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
      timer = setTimeout(() => {
        bark(sigmaLine());
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [on]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

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

      {/* Floating "fuel" button — demand a line right now. Parked above the
          nav's other floating controls (pill/mic/schedule + button) so it
          never overlaps them on any page. */}
      <motion.button
        onClick={() => bark(sigmaLine())}
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
