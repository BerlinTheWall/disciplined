import { useLayoutEffect, useRef, useState } from "react";

import { isLightColor } from "@/lib/color";

const DEFAULT_ITEM_H = 40;
const DEFAULT_VISIBLE_ROWS = 3;

interface NumberWheelProps {
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  color: string;
  formatLabel?: (n: number) => string;
  visibleRows?: number;
}

// Single-column snap-scrolling number picker — the same mechanics as
// TimeWheel.tsx's private WheelColumn (scroll-snap, settle-after-drag, a
// centered colored band), generalized so it isn't tied to hours/minutes.
// Used for "every N weeks/months" and "day of the month" instead of a plain
// +/- stepper, matching the app's other pickers' feel.
export default function NumberWheel({
  min,
  max,
  value,
  onChange,
  color,
  formatLabel = (n) => String(n),
  visibleRows = DEFAULT_VISIBLE_ROWS,
}: NumberWheelProps) {
  const itemHeight = DEFAULT_ITEM_H;
  const pad = ((visibleRows - 1) / 2) * itemHeight;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clamped = Math.min(max, Math.max(min, value));
  const selectedIndex = clamped - min;
  const [active, setActive] = useState(selectedIndex);
  const contrast = isLightColor(color) ? "#111827" : "#fff";

  // Park on the selected index when it changes from outside (opening the
  // sheet, switching freq) — same distance guard as WheelColumn so a scroll
  // that already settled at the target isn't fought.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * itemHeight;
    if (Math.abs(el.scrollTop - target) > itemHeight / 2) el.scrollTop = target;
    setActive(selectedIndex);
  }, [selectedIndex, itemHeight]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const count = max - min + 1;
    const idx = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / itemHeight)));
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(min + idx), 110);
  }

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="relative bg-surface-raised rounded-2xl py-2">
      <div
        className="absolute inset-x-4 rounded-full pointer-events-none"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          height: itemHeight,
          backgroundColor: color,
        }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-col relative overflow-y-scroll snap-y snap-mandatory"
        style={{ height: visibleRows * itemHeight, scrollbarWidth: "none" }}
      >
        <div style={{ height: pad }} />
        {values.map((n, i) => (
          <div
            key={n}
            className="flex items-center justify-center snap-center"
            style={{ height: itemHeight }}
          >
            <span
              className={`text-lg font-semibold tabular-nums ${i === active ? "" : "text-fg-disabled"}`}
              style={i === active ? { color: contrast } : undefined}
            >
              {formatLabel(n)}
            </span>
          </div>
        ))}
        <div style={{ height: pad }} />
      </div>
    </div>
  );
}
