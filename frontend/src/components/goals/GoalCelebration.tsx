import { AnimatePresence, motion } from "framer-motion";

const CONFETTI_COLORS = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#c084fc", "#fb923c"];

// A burst radiating evenly around the ring, index-derived (not Math.random())
// so it's reproducible and never recomputes mid-flight on a re-render. Each
// piece gets its own angle, travel distance and fall, so the burst reads as
// scattered rather than a uniform ring of dots.
const PIECE_COUNT = 20;
const PIECES = Array.from({ length: PIECE_COUNT }, (_, i) => {
  const angle = (i / PIECE_COUNT) * Math.PI * 2 + ((i * 47) % 10) * 0.03;
  const distance = 70 + ((i * 37) % 55); // 70..125
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance * 0.6 + 30, // gravity-biased downward drift
    rotate: ((i * 71) % 360) - 180,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 7) * 0.025,
    duration: 0.85 + ((i * 13) % 5) * 0.08,
    size: i % 3 === 0 ? 7 : 5,
    round: i % 2 === 0,
  };
});

// The confetti + flash burst when a goal flips to done — rendered as a plain
// `absolute inset-0` overlay *inside the ring's own container* (see
// GoalDetailScreen), so it's centered on the ring for free via flexbox
// rather than guessing the ring's pixel offset within the wider card. Never
// blocks the next tap. Reduced motion is handled globally by the app's
// <MotionConfig reducedMotion="user"> wrapper (main.tsx), so this needs no
// media-query handling of its own.
export default function GoalCelebrationBurst({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {/* Soft flash right behind the ring */}
          <motion.div
            className="absolute h-40 w-40 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ duration: 0.8, ease: "easeOut", opacity: { duration: 0.5 } }}
          />

          {PIECES.map((p, i) => (
            <motion.span
              key={i}
              className={`absolute ${p.round ? "rounded-full" : "rounded-[1px]"}`}
              style={{ backgroundColor: p.color, width: p.size, height: p.size * 1.4 }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.5 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.rotate, scale: 1 }}
              transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// The "well done" chip, shown separately from the burst above — the card's
// own footer rather than the ring, so it never fights the confetti for the
// same small centered spot.
export function GoalCelebrationLabel({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.p
          initial={{ opacity: 0, y: 10, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.9 }}
          transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
          className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-inverse px-3.5 py-1.5 text-[13px] font-bold text-fg-inverse shadow-soft"
        >
          🎉 Well done!
        </motion.p>
      )}
    </AnimatePresence>
  );
}
