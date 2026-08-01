import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import PlanRow from "./PlanRow";
import { COLOR_OPTIONS } from "@/components/timeline/addItemOptions";
import { guessIcon, type IconKey } from "@/lib/icons";
import { spring } from "@/lib/motion";

// A canned, entirely local seven-day plan — never persisted, never touches
// the backend. The point is to let a brand-new user feel the assistant
// noticing things (a packed day, a saved streak) before they've entered a
// single real event of their own. All copy is scripted, not a live Gemini
// call — zero cost, zero chance of a flaky/odd response during onboarding.
const [GREEN, ROSE, ORANGE, , LIME, BLUE, , VIOLET, PINK] = COLOR_OPTIONS;

interface FakeItem {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  done: boolean;
}

interface FakeDay {
  label: string;
  note: string;
  items: FakeItem[];
}

const FAKE_WEEK: FakeDay[] = [
  {
    label: "Mon",
    note: "Solid start — the run happened before most people are even awake.",
    items: [
      { title: "Morning run", startMinutes: 390, durationMinutes: 30, color: GREEN, done: true },
      {
        title: "Deep work: redesign",
        startMinutes: 540,
        durationMinutes: 120,
        color: BLUE,
        done: true,
      },
      { title: "Team standup", startMinutes: 660, durationMinutes: 15, color: BLUE, done: true },
      { title: "Gym", startMinutes: 1050, durationMinutes: 60, color: ROSE, done: true },
    ],
  },
  {
    label: "Tue",
    note: "Two days in on the run streak already.",
    items: [
      { title: "Morning run", startMinutes: 390, durationMinutes: 30, color: GREEN, done: true },
      { title: "Client call", startMinutes: 600, durationMinutes: 45, color: BLUE, done: true },
      {
        title: "Lunch with Sam",
        startMinutes: 750,
        durationMinutes: 60,
        color: ORANGE,
        done: true,
      },
      { title: "Read", startMinutes: 1200, durationMinutes: 30, color: VIOLET, done: true },
    ],
  },
  {
    label: "Wed",
    note: "This day's packed — six things before 7pm, and the run got skipped. If this were real, I'd nudge you to catch it later tonight.",
    items: [
      { title: "Morning run", startMinutes: 390, durationMinutes: 30, color: GREEN, done: false },
      { title: "Standup", startMinutes: 540, durationMinutes: 15, color: BLUE, done: true },
      { title: "Design review", startMinutes: 600, durationMinutes: 90, color: BLUE, done: true },
      { title: "Dentist", startMinutes: 840, durationMinutes: 60, color: ROSE, done: true },
      { title: "Deep work", startMinutes: 930, durationMinutes: 120, color: BLUE, done: false },
      { title: "Gym", startMinutes: 1080, durationMinutes: 60, color: ROSE, done: false },
    ],
  },
  {
    label: "Thu",
    note: "Lighter day — a good bounce-back after Wednesday.",
    items: [
      { title: "Morning run", startMinutes: 390, durationMinutes: 30, color: GREEN, done: true },
      { title: "Team lunch", startMinutes: 720, durationMinutes: 60, color: ORANGE, done: true },
      { title: "Grocery run", startMinutes: 1020, durationMinutes: 45, color: LIME, done: true },
    ],
  },
  {
    label: "Fri",
    note: "Streak's alive again — four days out of five.",
    items: [
      { title: "Morning run", startMinutes: 390, durationMinutes: 30, color: GREEN, done: true },
      { title: "Sprint planning", startMinutes: 600, durationMinutes: 60, color: BLUE, done: true },
      { title: "Happy hour", startMinutes: 1080, durationMinutes: 90, color: PINK, done: false },
    ],
  },
  {
    label: "Sat",
    note: "Weekend, later start — the habit bends without breaking.",
    items: [
      { title: "Morning run", startMinutes: 540, durationMinutes: 30, color: GREEN, done: true },
      { title: "Hike", startMinutes: 660, durationMinutes: 120, color: LIME, done: false },
      {
        title: "Dinner with friends",
        startMinutes: 1140,
        durationMinutes: 90,
        color: PINK,
        done: false,
      },
    ],
  },
  {
    label: "Sun",
    note: "End of the week — this is when I'd send you a quick recap of how it went.",
    items: [
      { title: "Morning run", startMinutes: 540, durationMinutes: 30, color: GREEN, done: true },
      { title: "Meal prep", startMinutes: 660, durationMinutes: 60, color: ORANGE, done: false },
      {
        title: "Plan next week",
        startMinutes: 1080,
        durationMinutes: 20,
        color: BLUE,
        done: false,
      },
    ],
  },
];

function fakeIcon(title: string): IconKey {
  return guessIcon(title) ?? "default";
}

export default function FakeWeekPreview({ accent }: { accent: string }) {
  const [dayIndex, setDayIndex] = useState(2); // start on Wednesday — the day with something to say

  const day = FAKE_WEEK[dayIndex];
  const sorted = [...day.items].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center bg-surface-alt rounded-full p-1.5 mb-5">
        {FAKE_WEEK.map((d, i) => (
          <button
            key={d.label}
            onClick={() => setDayIndex(i)}
            className="relative flex-1 h-10 rounded-full text-sm font-semibold"
          >
            {dayIndex === i && (
              <motion.span
                layoutId="fakeWeekDay"
                transition={spring.snappy}
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
            )}
            <span
              className="relative z-10"
              style={{ color: dayIndex === i ? "#fff" : "var(--fg-muted)" }}
            >
              {d.label}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={dayIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={spring.gentle}
            className="flex flex-col gap-2.5"
          >
            {sorted.map((item) => (
              <PlanRow
                key={`${item.title}-${item.startMinutes}`}
                icon={fakeIcon(item.title)}
                color={item.color}
                title={item.title}
                startMinutes={item.startMinutes}
                durationMinutes={item.durationMinutes}
                done={item.done}
                accent={accent}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={dayIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring.gentle}
          className="flex items-start gap-3 bg-surface-alt rounded-2xl px-3.5 py-3.5 mt-4"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: accent, color: "#fff" }}
          >
            <Sparkles size={16} />
          </div>
          <p className="text-sm text-fg-muted flex-1 pt-1.5">{day.note}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
