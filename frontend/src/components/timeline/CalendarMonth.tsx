import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import SwipePager from "./SwipePager";
import { isLightColor } from "@/lib/color";
import { parseISODate, toISODate } from "@/lib/date";
import { isHabitActiveOnDate } from "@/lib/habits";
import { tap } from "@/lib/motion";
import { useHabitStore } from "@/store/habitStore";
import { useTaskStore } from "@/store/taskStore";
import Collapse from "../Collapse";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* ---- month/year scroll wheels ------------------------------------ */

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_H;

// Years offered by the year wheel, centered on the current year.
const YEAR_START = new Date().getFullYear() - 30;
const YEARS = Array.from({ length: 61 }, (_, i) => String(YEAR_START + i));

// One snap-scrolling column (same mechanics as the edit sheet's time wheel):
// the centered item is highlighted and committed after the scroll settles.
function Wheel({
  items,
  index,
  color,
  onChange,
}: {
  items: string[];
  index: number;
  color: string;
  onChange: (nextIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(index);
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";

  // Park the wheel on the current value (on mount and outside changes), unless
  // a user scroll has already settled there.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > WHEEL_ITEM_H / 2) {
      el.scrollTop = target;
    }
    setActive(index);
  }, [index]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
    setActive(idx);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (idx !== index) onChange(idx);
    }, 110);
  }

  return (
    <div className="flex-1 bg-surface-raised rounded-2xl py-2">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="wheel-col overflow-y-scroll snap-y snap-mandatory"
        style={{ height: WHEEL_VISIBLE * WHEEL_ITEM_H, scrollbarWidth: "none" }}
      >
        <div style={{ height: WHEEL_PAD }} />
        {items.map((label, i) => (
          <div
            key={label}
            className="flex items-center justify-center snap-center"
            style={{ height: WHEEL_ITEM_H }}
          >
            {i === active ? (
              <span
                className="px-4 py-1.5 rounded-full font-semibold text-base"
                style={{ backgroundColor: color, color: onColor }}
              >
                {label}
              </span>
            ) : (
              <span className="text-base text-fg-disabled">{label}</span>
            )}
          </div>
        ))}
        <div style={{ height: WHEEL_PAD }} />
      </div>
    </div>
  );
}

// Month-grid date picker: month navigation, the selected day filled in the
// accent color, today tinted in it, and up to three dots per day marking the
// tasks/habits already scheduled there.
export default function CalendarMonth({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (iso: string) => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);

  const selected = parseISODate(value);
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  // Tapping the "July 2026" heading flips the day grid into month/year wheels.
  const [wheelOpen, setWheelOpen] = useState(false);
  const todayIso = toISODate(new Date());
  const y = view.getFullYear();
  const m = view.getMonth();
  const onSelColor = isLightColor(color) ? "#111827" : "#ffffff";

  // Colors of the items already scheduled on a given day, for the dot row.
  function dayMarkers(iso: string) {
    const d = parseISODate(iso);
    return [
      ...habits.filter((h) => isHabitActiveOnDate(h, d)).map((h) => h.color),
      ...tasks.filter((t) => t.date === iso).map((t) => t.color),
    ];
  }

  function shiftMonth(delta: number) {
    setView(new Date(y, m + delta, 1));
  }

  // Renders one month's day grid, for a given offset from the currently viewed
  // month (used by both the settled page and its swiped-in neighbours).
  function renderMonthGrid(offset: number) {
    const gy = new Date(y, m + offset, 1).getFullYear();
    const gm = new Date(y, m + offset, 1).getMonth();
    const firstWeekday = new Date(gy, gm, 1).getDay();
    const daysInMonth = new Date(gy, gm + 1, 0).getDate();
    // Always pad out to 6 full rows (42 cells) so every month's grid is the
    // same height — otherwise 4-vs-6-row months jump the sheet's height as
    // you swipe between them. Padding cells mirror a real day cell's markup
    // (invisibly) so a fully-empty last row still reserves its height instead
    // of collapsing to nothing.
    const trailingPad = 42 - firstWeekday - daysInMonth;
    const pad = (key: string) => (
      <span key={key} className="flex flex-col items-center gap-1 py-0.5" aria-hidden>
        <span className="w-9 h-9" />
        <span className="h-1.5" />
      </span>
    );
    return (
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstWeekday }, (_, i) => pad(`pad-lead-${i}`))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = toISODate(new Date(gy, gm, i + 1));
          const isSelected = iso === value;
          const isToday = iso === todayIso;
          const dots = dayMarkers(iso).slice(0, 3);
          return (
            <button
              key={iso}
              onClick={() => onChange(iso)}
              className="flex flex-col items-center gap-1 py-0.5"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-base font-semibold"
                style={
                  isSelected
                    ? { backgroundColor: color, color: onSelColor }
                    : { color: isToday ? color : "var(--fg)" }
                }
              >
                {i + 1}
              </span>
              <span className="flex gap-0.5 h-1.5">
                {dots.map((c, j) => (
                  <span
                    key={j}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
            </button>
          );
        })}
        {Array.from({ length: trailingPad }, (_, i) => pad(`pad-trail-${i}`))}
      </div>
    );
  }

  return (
    <div>
      <style>{".wheel-col::-webkit-scrollbar{display:none}"}</style>
      <div className="flex items-center justify-between mb-3">
        <motion.button
          onClick={() => setWheelOpen((v) => !v)}
          whileTap={tap}
          className="flex items-center gap-1.5"
        >
          <span className="text-xl font-bold text-fg">
            {MONTH_NAMES[m]} <span style={{ color }}>{y}</span>
          </span>
          <ChevronDown
            size={18}
            className={`text-fg-faint transition-transform ${wheelOpen ? "rotate-180" : ""}`}
          />
        </motion.button>
        <div className="flex gap-2">
          <motion.button
            onClick={() => shiftMonth(-1)}
            whileTap={tap}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <motion.button
            onClick={() => shiftMonth(1)}
            whileTap={tap}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </div>

      {/* Month/year wheels swap in for the day grid; the two opposing
          collapses morph the height smoothly instead of jumping. */}
      <Collapse open={wheelOpen}>
        <div className="flex gap-2 pb-1">
          <Wheel
            items={MONTH_NAMES}
            index={m}
            color={color}
            onChange={(i) => setView(new Date(y, i, 1))}
          />
          <Wheel
            items={YEARS}
            index={Math.max(0, Math.min(YEARS.length - 1, y - YEAR_START))}
            color={color}
            onChange={(i) => setView(new Date(YEAR_START + i, m, 1))}
          />
        </div>
      </Collapse>

      <Collapse open={!wheelOpen}>
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_LABELS.map((d) => (
            <span key={d} className="text-center text-sm text-fg-faint">
              {d}
            </span>
          ))}
        </div>

        {/* Swipe the grid to move a month at a time, following the finger like the
            day/week pagers elsewhere in the timeline. */}
        <SwipePager
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          pageKey={(offset) => {
            const d = new Date(y, m + offset, 1);
            return `${d.getFullYear()}-${d.getMonth()}`;
          }}
          renderPage={renderMonthGrid}
        />
      </Collapse>
    </div>
  );
}
