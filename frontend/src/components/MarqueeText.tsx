import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// Re-measuring once on mount isn't enough: Inter loads as a variable webfont
// (see main.tsx) and swaps in after first paint, which can widen the text
// just enough that a distance computed against the fallback font stops a
// few characters short of the real end. A ResizeObserver catches that swap
// (and any other future resize) instead of relying on load-order timing.

interface MarqueeTextProps {
  text: string;
  className?: string;
}

// Pixels per second the text travels at — constant across titles, so a
// longer overflow takes proportionally longer instead of racing past.
const SPEED = 40;
// Dwell time (seconds) at each end before reversing, so there's a moment to
// start/finish reading rather than the text being perpetually in motion.
const PAUSE = 1.1;

// A line of text too wide for its box scrolls left to reveal the rest, then
// eases back — like a now-playing ticker — instead of clipping with an
// ellipsis. Text that already fits renders statically, untouched.
export default function MarqueeText({ text, className = "" }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) return;

    function measure() {
      const diff = el!.scrollWidth - container!.clientWidth;
      setOverflow(diff > 2 ? diff : 0); // small slop so sub-pixel rounding doesn't trigger it
    }
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  const travel = overflow / SPEED;
  const total = PAUSE * 2 + travel * 2;

  return (
    <div ref={containerRef} className="overflow-hidden min-w-0">
      <motion.span
        ref={textRef}
        className={`inline-block whitespace-nowrap ${className}`}
        animate={overflow > 0 ? { x: [0, 0, -overflow, -overflow, 0] } : { x: 0 }}
        transition={
          overflow > 0
            ? {
                duration: total,
                times: [0, PAUSE / total, (PAUSE + travel) / total, 1 - PAUSE / total, 1],
                ease: "easeInOut",
                repeat: Infinity,
              }
            : { duration: 0 }
        }
      >
        {text}
      </motion.span>
    </div>
  );
}
