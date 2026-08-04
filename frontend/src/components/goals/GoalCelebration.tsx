import { AnimatePresence, motion } from "framer-motion";

const PIECES = [
  { dx: -34, dy: -46, rotate: -35, color: "#f87171", delay: 0 },
  { dx: 6, dy: -58, rotate: 15, color: "#fbbf24", delay: 0.03 },
  { dx: 38, dy: -42, rotate: 50, color: "#4ade80", delay: 0.06 },
  { dx: -46, dy: -14, rotate: -70, color: "#60a5fa", delay: 0.02 },
  { dx: 44, dy: -10, rotate: 80, color: "#f87171", delay: 0.08 },
  { dx: -20, dy: -60, rotate: -10, color: "#4ade80", delay: 0.1 },
  { dx: 22, dy: -60, rotate: 40, color: "#fbbf24", delay: 0.05 },
  { dx: 0, dy: -30, rotate: 0, color: "#60a5fa", delay: 0.12 },
];

// A brief, positive-only burst when a goal flips to done — never a modal,
// never blocks the next tap, no penalty state to speak of if a goal never
// gets here. Reduced motion is handled globally by the app's
// <MotionConfig reducedMotion="user"> wrapper (main.tsx), so this needs no
// media-query handling of its own.
export default function GoalCelebration({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none absolute right-9 top-3 z-10">
          {PIECES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute w-1.5 h-2.5 rounded-[1px]"
              style={{ backgroundColor: p.color }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.rotate, scale: 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, delay: p.delay, ease: "easeOut" }}
            />
          ))}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute right-0 -top-1 -translate-y-full whitespace-nowrap rounded-full bg-fg text-fg-inverse text-[11px] font-medium px-2.5 py-1 shadow-soft"
          >
            Nice — goal complete
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
