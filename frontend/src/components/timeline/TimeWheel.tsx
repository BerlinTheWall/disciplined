import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { isLightColor } from "@/lib/color";
import { formatTimeLabel, rangeLabel, timeStringToMinutes } from "@/lib/time";

const MINUTES_PER_DAY = 1440;

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 3;

// Single-column snap-scrolling time picker: the centered slot is highlighted
// as a pill in the item's color (showing the full start–end range) and commits
// once the scroll settles. Used inline in the create wizard and, taller, in
// the edit sheet's time panel.
export default function TimeWheel({
  value,
  durationMinutes,
  color,
  onChange,
  visibleRows = WHEEL_VISIBLE,
}: {
  value: string;
  durationMinutes: number;
  color: string;
  onChange: (next: string) => void;
  visibleRows?: number;
}) {
  const wheelPad = ((visibleRows - 1) / 2) * WHEEL_ITEM_H;
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMount = useRef(false);

  // The wheel steps by the chosen duration so short tasks sit back-to-back — a
  // 1-min task offers every minute (6:00, 6:01, …), a 5-min task every fifth
  // (6:00, 6:05, …) — but never coarser than 15 min, so a 1-hour task still
  // steps every 15 (6:00, 6:15, …) instead of only on the hour.
  const step = Math.max(1, Math.min(durationMinutes, 15));
  const steps = useMemo(() => {
    const arr: number[] = [];
    for (let m = 0; m < MINUTES_PER_DAY; m += step) arr.push(m);
    return arr;
  }, [step]);

  const selectedIndex = Math.max(
    0,
    Math.min(steps.length - 1, Math.round(timeStringToMinutes(value) / step))
  );
  const [active, setActive] = useState(selectedIndex);

  // Park the wheel on the current value. Runs on mount, when the value changes
  // from outside (opening the sheet to edit an existing task), and when the step
  // changes (the user picked a new duration). The distance guard avoids fighting
  // a user scroll that has already settled at the target.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > WHEEL_ITEM_H / 2) {
      el.scrollTop = target;
    }
    setActive(selectedIndex);
    // Keep the stored start time on the grid so what's shown matches what's
    // saved: a task loaded at 6:15 with a 30-min duration (no 6:15 slot) snaps to
    // the nearest slot. The guard skips the first, pre-populate render so we don't
    // write back the stale default time the sheet still holds from last time.
    if (didMount.current) {
      const aligned = formatTimeLabel(steps[selectedIndex]);
      if (aligned !== value) onChange(aligned);
    } else {
      didMount.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, step]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(steps.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (idx !== selectedIndex) onChange(formatTimeLabel(steps[idx]));
    }, 110);
  }

  return (
    <div className="bg-surface-raised rounded-2xl py-2">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-col overflow-y-scroll snap-y snap-mandatory"
        style={{ height: visibleRows * WHEEL_ITEM_H, scrollbarWidth: "none" }}
      >
        <div style={{ height: wheelPad }} />
        {steps.map((min, i) => (
          <div
            key={min}
            className="flex items-center justify-center snap-center"
            style={{ height: WHEEL_ITEM_H }}
          >
            {i === active ? (
              <span
                className="px-4 py-1.5 rounded-full font-semibold text-base tabular-nums"
                style={{ backgroundColor: color, color: isLightColor(color) ? "#111827" : "#fff" }}
              >
                {rangeLabel(min, durationMinutes)}
              </span>
            ) : (
              <span className="text-base tabular-nums text-fg-disabled">
                {formatTimeLabel(min)}
              </span>
            )}
          </div>
        ))}
        <div style={{ height: wheelPad }} />
      </div>
    </div>
  );
}
