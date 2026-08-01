import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import PlanRow from "./PlanRow";
import { COLOR_OPTIONS } from "@/components/timeline/addItemOptions";
import type { UserSegment } from "@/lib/api";
import { guessIcon, type IconKey } from "@/lib/icons";
import { spring } from "@/lib/motion";

// A canned, entirely local seven-day plan — never persisted, never touches
// the backend. The point is to let a brand-new user feel the assistant
// noticing things (a packed day, a saved streak) before they've entered a
// single real event of their own. All copy is scripted, not a live Gemini
// call — zero cost, zero chance of a flaky/odd response during onboarding.
// One dataset per self-reported segment (see the wizard's "what best
// describes you" step) so the demo actually looks like their life instead
// of a generic stranger's week.
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

// Default/fallback dataset — also used when the user skips the segment
// question entirely, so skipping never means an empty or broken demo.
const PROFESSIONAL_WEEK: FakeDay[] = [
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

const STUDENT_WEEK: FakeDay[] = [
  {
    label: "Mon",
    note: "Morning class, then straight into a shift — a full day but nothing's skipped.",
    items: [
      {
        title: "Lecture: Econ 101",
        startMinutes: 540,
        durationMinutes: 90,
        color: BLUE,
        done: true,
      },
      {
        title: "Study block: readings",
        startMinutes: 660,
        durationMinutes: 60,
        color: VIOLET,
        done: true,
      },
      {
        title: "Shift: campus café",
        startMinutes: 840,
        durationMinutes: 180,
        color: ORANGE,
        done: true,
      },
      { title: "Gym", startMinutes: 1200, durationMinutes: 45, color: ROSE, done: true },
    ],
  },
  {
    label: "Tue",
    note: "The essay block got pushed — worth protecting time for it before the deadline creeps up.",
    items: [
      { title: "Lecture: Stats", startMinutes: 600, durationMinutes: 60, color: BLUE, done: true },
      {
        title: "Group project meeting",
        startMinutes: 780,
        durationMinutes: 45,
        color: BLUE,
        done: true,
      },
      {
        title: "Library: essay draft",
        startMinutes: 960,
        durationMinutes: 120,
        color: VIOLET,
        done: false,
      },
      {
        title: "Hang out with roommates",
        startMinutes: 1260,
        durationMinutes: 90,
        color: PINK,
        done: false,
      },
    ],
  },
  {
    label: "Wed",
    note: "Another packed one — lecture, lab, and a shift before the evening even starts.",
    items: [
      {
        title: "Lecture: Econ 101",
        startMinutes: 540,
        durationMinutes: 90,
        color: BLUE,
        done: true,
      },
      {
        title: "Lab: Chemistry",
        startMinutes: 660,
        durationMinutes: 120,
        color: BLUE,
        done: true,
      },
      {
        title: "Shift: campus café",
        startMinutes: 840,
        durationMinutes: 180,
        color: ORANGE,
        done: true,
      },
      { title: "Gym", startMinutes: 1080, durationMinutes: 45, color: ROSE, done: false },
      {
        title: "Study block",
        startMinutes: 1200,
        durationMinutes: 60,
        color: VIOLET,
        done: false,
      },
    ],
  },
  {
    label: "Thu",
    note: "Lighter day — good one to actually get ahead on reading.",
    items: [
      { title: "Lecture: Stats", startMinutes: 600, durationMinutes: 60, color: BLUE, done: true },
      {
        title: "Lunch with friends",
        startMinutes: 720,
        durationMinutes: 60,
        color: PINK,
        done: true,
      },
      {
        title: "Study block: readings",
        startMinutes: 900,
        durationMinutes: 90,
        color: VIOLET,
        done: true,
      },
    ],
  },
  {
    label: "Fri",
    note: "Deadline day — everything else can wait until it's in.",
    items: [
      {
        title: "Lecture: Econ 101",
        startMinutes: 540,
        durationMinutes: 90,
        color: BLUE,
        done: true,
      },
      {
        title: "Essay due",
        startMinutes: 780,
        durationMinutes: 30,
        color: ORANGE,
        done: true,
      },
      {
        title: "Party with friends",
        startMinutes: 1200,
        durationMinutes: 120,
        color: PINK,
        done: false,
      },
    ],
  },
  {
    label: "Sat",
    note: "Weekend shift, otherwise open — a good day to catch up on sleep.",
    items: [
      {
        title: "Shift: campus café",
        startMinutes: 660,
        durationMinutes: 240,
        color: ORANGE,
        done: true,
      },
      { title: "Gym", startMinutes: 1080, durationMinutes: 45, color: ROSE, done: false },
    ],
  },
  {
    label: "Sun",
    note: "Sunday reset — this is exactly the kind of day I'd help you get ahead before Monday hits.",
    items: [
      { title: "Meal prep", startMinutes: 720, durationMinutes: 60, color: ORANGE, done: false },
      {
        title: "Study block: exam review",
        startMinutes: 900,
        durationMinutes: 120,
        color: VIOLET,
        done: false,
      },
      {
        title: "Plan next week",
        startMinutes: 1140,
        durationMinutes: 20,
        color: BLUE,
        done: false,
      },
    ],
  },
];

const MANAGER_WEEK: FakeDay[] = [
  {
    label: "Mon",
    note: "Six things before 5pm and almost no gaps — a fairly typical Monday for a manager's calendar.",
    items: [
      { title: "1:1: Alex", startMinutes: 540, durationMinutes: 30, color: BLUE, done: true },
      { title: "1:1: Priya", startMinutes: 570, durationMinutes: 30, color: BLUE, done: true },
      { title: "Team standup", startMinutes: 630, durationMinutes: 15, color: BLUE, done: true },
      {
        title: "Leadership sync",
        startMinutes: 660,
        durationMinutes: 60,
        color: VIOLET,
        done: true,
      },
      {
        title: "Strategy planning block",
        startMinutes: 840,
        durationMinutes: 90,
        color: VIOLET,
        done: true,
      },
      {
        title: "Review team updates",
        startMinutes: 990,
        durationMinutes: 45,
        color: BLUE,
        done: true,
      },
    ],
  },
  {
    label: "Tue",
    note: "The budget review slipped — worth protecting a slot for it before it becomes urgent.",
    items: [
      { title: "1:1: Jordan", startMinutes: 540, durationMinutes: 30, color: BLUE, done: true },
      {
        title: "Cross-team planning",
        startMinutes: 600,
        durationMinutes: 90,
        color: VIOLET,
        done: true,
      },
      { title: "Lunch", startMinutes: 780, durationMinutes: 45, color: ORANGE, done: true },
      {
        title: "Budget review",
        startMinutes: 900,
        durationMinutes: 60,
        color: LIME,
        done: false,
      },
      { title: "Team standup", startMinutes: 990, durationMinutes: 15, color: BLUE, done: true },
    ],
  },
  {
    label: "Wed",
    note: "Packed straight through lunch — the strategy block got squeezed out again.",
    items: [
      { title: "1:1: Sam", startMinutes: 540, durationMinutes: 30, color: BLUE, done: true },
      {
        title: "All-hands prep",
        startMinutes: 600,
        durationMinutes: 45,
        color: BLUE,
        done: true,
      },
      {
        title: "All-hands meeting",
        startMinutes: 660,
        durationMinutes: 60,
        color: BLUE,
        done: true,
      },
      { title: "Lunch", startMinutes: 780, durationMinutes: 30, color: ORANGE, done: true },
      {
        title: "Interview: candidate",
        startMinutes: 840,
        durationMinutes: 60,
        color: PINK,
        done: true,
      },
      {
        title: "Strategy planning block",
        startMinutes: 960,
        durationMinutes: 90,
        color: VIOLET,
        done: false,
      },
    ],
  },
  {
    label: "Thu",
    note: "First real deep-work block of the week — worth protecting more of these.",
    items: [
      { title: "Team standup", startMinutes: 540, durationMinutes: 15, color: BLUE, done: true },
      {
        title: "Deep work: quarterly plan",
        startMinutes: 600,
        durationMinutes: 120,
        color: GREEN,
        done: true,
      },
      { title: "1:1: Alex", startMinutes: 780, durationMinutes: 30, color: BLUE, done: true },
      {
        title: "Skip-level chats",
        startMinutes: 900,
        durationMinutes: 60,
        color: PINK,
        done: true,
      },
    ],
  },
  {
    label: "Fri",
    note: "Lighter close to the week — good rhythm heading into the weekend.",
    items: [
      { title: "1:1: Priya", startMinutes: 540, durationMinutes: 30, color: BLUE, done: true },
      { title: "Team retro", startMinutes: 600, durationMinutes: 60, color: VIOLET, done: true },
      { title: "Team lunch", startMinutes: 720, durationMinutes: 90, color: ORANGE, done: true },
      {
        title: "Review team updates",
        startMinutes: 900,
        durationMinutes: 45,
        color: BLUE,
        done: false,
      },
    ],
  },
  {
    label: "Sat",
    note: "Quiet weekend — a good reset before next week's back-to-back starts again.",
    items: [
      {
        title: "Coffee: personal admin",
        startMinutes: 660,
        durationMinutes: 30,
        color: LIME,
        done: false,
      },
    ],
  },
  {
    label: "Sun",
    note: "This is when I'd send a quick look-ahead at next week's meeting load.",
    items: [
      {
        title: "Plan next week's priorities",
        startMinutes: 1080,
        durationMinutes: 30,
        color: BLUE,
        done: false,
      },
    ],
  },
];

const PARENT_WEEK: FakeDay[] = [
  {
    label: "Mon",
    note: "A full day around the kids' schedule, and everything still got done.",
    items: [
      { title: "Get kids ready", startMinutes: 420, durationMinutes: 45, color: PINK, done: true },
      { title: "School drop-off", startMinutes: 480, durationMinutes: 20, color: PINK, done: true },
      { title: "Work block", startMinutes: 540, durationMinutes: 180, color: BLUE, done: true },
      { title: "Lunch", startMinutes: 720, durationMinutes: 30, color: ORANGE, done: true },
      { title: "School pickup", startMinutes: 900, durationMinutes: 20, color: PINK, done: true },
      { title: "Soccer practice", startMinutes: 960, durationMinutes: 60, color: ROSE, done: true },
      {
        title: "Dinner + bedtime routine",
        startMinutes: 1080,
        durationMinutes: 90,
        color: PINK,
        done: true,
      },
    ],
  },
  {
    label: "Tue",
    note: "The appointment ran long and pickup got missed — worth a buffer around appointments like this.",
    items: [
      { title: "Get kids ready", startMinutes: 420, durationMinutes: 45, color: PINK, done: true },
      { title: "School drop-off", startMinutes: 480, durationMinutes: 20, color: PINK, done: true },
      { title: "Work block", startMinutes: 540, durationMinutes: 180, color: BLUE, done: true },
      {
        title: "Pediatrician appointment",
        startMinutes: 840,
        durationMinutes: 45,
        color: LIME,
        done: true,
      },
      { title: "School pickup", startMinutes: 900, durationMinutes: 20, color: PINK, done: false },
      {
        title: "Dinner + bedtime routine",
        startMinutes: 1080,
        durationMinutes: 90,
        color: PINK,
        done: true,
      },
    ],
  },
  {
    label: "Wed",
    note: "Bedtime routine slipped tonight — a busy one all around.",
    items: [
      { title: "Get kids ready", startMinutes: 420, durationMinutes: 45, color: PINK, done: true },
      { title: "School drop-off", startMinutes: 480, durationMinutes: 20, color: PINK, done: true },
      { title: "Work block", startMinutes: 540, durationMinutes: 180, color: BLUE, done: true },
      { title: "School pickup", startMinutes: 900, durationMinutes: 20, color: PINK, done: true },
      { title: "Piano lesson", startMinutes: 960, durationMinutes: 45, color: VIOLET, done: true },
      {
        title: "Dinner + bedtime routine",
        startMinutes: 1080,
        durationMinutes: 90,
        color: PINK,
        done: false,
      },
    ],
  },
  {
    label: "Thu",
    note: "Back on track — meal prep earlier in the day made the evening smoother.",
    items: [
      { title: "Get kids ready", startMinutes: 420, durationMinutes: 45, color: PINK, done: true },
      { title: "School drop-off", startMinutes: 480, durationMinutes: 20, color: PINK, done: true },
      { title: "Work block", startMinutes: 540, durationMinutes: 180, color: BLUE, done: true },
      { title: "Meal prep", startMinutes: 720, durationMinutes: 45, color: ORANGE, done: true },
      { title: "School pickup", startMinutes: 900, durationMinutes: 20, color: PINK, done: true },
      {
        title: "Dinner + bedtime routine",
        startMinutes: 1080,
        durationMinutes: 90,
        color: PINK,
        done: true,
      },
    ],
  },
  {
    label: "Fri",
    note: "Shorter work block, more room to breathe heading into the weekend.",
    items: [
      { title: "Get kids ready", startMinutes: 420, durationMinutes: 45, color: PINK, done: true },
      { title: "School drop-off", startMinutes: 480, durationMinutes: 20, color: PINK, done: true },
      { title: "Work block", startMinutes: 540, durationMinutes: 120, color: BLUE, done: true },
      { title: "School pickup", startMinutes: 900, durationMinutes: 20, color: PINK, done: true },
      {
        title: "Family movie night",
        startMinutes: 1020,
        durationMinutes: 120,
        color: VIOLET,
        done: false,
      },
    ],
  },
  {
    label: "Sat",
    note: 'Weekend\'s built entirely around the kids — no separate "me time" block this week.',
    items: [
      {
        title: "Family breakfast",
        startMinutes: 540,
        durationMinutes: 45,
        color: ORANGE,
        done: false,
      },
      {
        title: "Kid's soccer game",
        startMinutes: 660,
        durationMinutes: 90,
        color: ROSE,
        done: false,
      },
      { title: "Grocery run", startMinutes: 900, durationMinutes: 45, color: LIME, done: false },
    ],
  },
  {
    label: "Sun",
    note: "End of the week — this is when I'd check in on how the balancing act went.",
    items: [
      { title: "Meal prep", startMinutes: 600, durationMinutes: 60, color: ORANGE, done: false },
      {
        title: "Pack bags for school/work",
        startMinutes: 1020,
        durationMinutes: 20,
        color: PINK,
        done: false,
      },
      {
        title: "Plan next week",
        startMinutes: 1140,
        durationMinutes: 20,
        color: BLUE,
        done: false,
      },
    ],
  },
];

const FAKE_WEEKS: Record<UserSegment, FakeDay[]> = {
  professional: PROFESSIONAL_WEEK,
  student: STUDENT_WEEK,
  manager: MANAGER_WEEK,
  parent: PARENT_WEEK,
};

function fakeIcon(title: string): IconKey {
  return guessIcon(title) ?? "default";
}

export default function FakeWeekPreview({
  accent,
  segment,
}: {
  accent: string;
  segment: UserSegment | null;
}) {
  const week = FAKE_WEEKS[segment ?? "professional"];
  const [dayIndex, setDayIndex] = useState(2); // start on Wednesday — the day with something to say

  const day = week[dayIndex];
  const sorted = [...day.items].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center bg-surface-alt rounded-full p-1.5 mb-5">
        {week.map((d, i) => (
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
            key={`${segment}-${dayIndex}`}
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
          key={`${segment}-${dayIndex}`}
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
