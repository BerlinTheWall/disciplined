import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { spring, tap } from "@/lib/motion";
import type { Page } from "@/lib/pages";
import { useTaskStore } from "@/store/taskStore";
import { useTutorialStore } from "@/store/tutorialStore";

// First-launch guided tour. Each step spotlights one element (everything else
// is dimmed AND blocked — the only way forward is doing the real action) or,
// for steps that happen inside a sheet, shows a free-floating instruction.
// Completion is detected from real app state, not from "Next" buttons.

interface TutorialHostProps {
  activePage: Page;
  isAddOpen: boolean;
  isSideMenuOpen: boolean;
}

// What each step highlights and says. `selector` is the spotlit element
// (data-tour attribute); steps without one are full-dim (modal) or free
// (banner) depending on `mode`.
const STEPS: Array<{
  selector?: string;
  mode: "modal" | "spotlight" | "banner";
  text: string;
  button?: string;
}> = [
  {
    mode: "modal",
    text: "Welcome to Disciplined! Let me walk you through the essentials — it takes under a minute.",
    button: "Start the tour",
  },
  {
    mode: "spotlight",
    selector: '[data-tour="calendar-tab"]',
    text: "This is your Calendar — your whole day lives here. Tap it.",
  },
  {
    mode: "spotlight",
    selector: '[data-tour="add-task"]',
    text: "The + button adds things to your day. Tap it.",
  },
  {
    mode: "banner",
    text: "Create your first task: give it a name, pick a time, and save it.",
  },
  {
    mode: "spotlight",
    selector: '[data-tour="menu"]',
    text: "Everything else — meals, recipes, workouts, habits, expenses — lives in this menu. Open it.",
  },
  {
    mode: "banner",
    text: "These sections work just like the calendar. Pick one to peek, or close the menu to continue.",
  },
  {
    mode: "spotlight",
    selector: '[data-tour="mic"]',
    text: "One last thing: this mic is your assistant. Tap it anytime and say things like “move gym to 6” or “what's tomorrow?”.",
    button: "Finish",
  },
];

interface Hole {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function TutorialHost({ activePage, isAddOpen, isSideMenuOpen }: TutorialHostProps) {
  const { done, step, baselineTasks, start, setStep, finish } = useTutorialStore();
  const tasksCount = useTaskStore((s) => s.tasks.length);
  const [hole, setHole] = useState<Hole | null>(null);

  // Advance on the real actions (and fall back a step when the add sheet is
  // closed without a task having been created).
  useEffect(() => {
    if (done || step === 0) return;
    if (step === 1 && activePage === "schedule") setStep(2);
    else if (step === 2 && isAddOpen) setStep(3);
    else if (step === 3 && !isAddOpen) setStep(tasksCount > baselineTasks ? 4 : 2);
    else if (step === 4 && isSideMenuOpen) setStep(5);
    else if (step === 5 && !isSideMenuOpen) setStep(6);
  }, [done, step, activePage, isAddOpen, isSideMenuOpen, tasksCount, baselineTasks, setStep]);

  // Track the spotlit element's position — re-measured briefly after each
  // step change (entrance animations move things) and kept fresh while the
  // step is active.
  const selector = done ? undefined : STEPS[step]?.selector;
  useEffect(() => {
    if (!selector) {
      setHole(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setHole(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 8;
      setHole({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    measure();
    const interval = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
    };
  }, [selector, step]);

  if (done || step >= STEPS.length) return null;
  const current = STEPS[step];

  // Card sits opposite the hole so it never covers the target.
  const cardAbove = hole !== null && hole.top > window.innerHeight / 2;

  const card = (
    <motion.div
      key={`card-${step}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={spring.snappy}
      className="pointer-events-auto bg-surface rounded-2xl shadow-xl border border-border-strong p-4"
    >
      <p className="text-[15px] text-fg leading-snug">{current.text}</p>
      {current.button && (
        <motion.button
          onClick={() => (step === 0 ? start(tasksCount) : finish())}
          whileTap={tap}
          className="mt-3 w-full h-11 rounded-xl bg-fg text-fg-inverse font-semibold"
        >
          {current.button}
        </motion.button>
      )}
    </motion.div>
  );

  // Banner mode: instruction only, the whole screen stays interactive.
  if (current.mode === "banner") {
    return (
      <div
        className="fixed inset-x-4 z-[80] pointer-events-none"
        style={{ top: "calc(12px + env(safe-area-inset-top))" }}
      >
        <AnimatePresence mode="wait">{card}</AnimatePresence>
      </div>
    );
  }

  // Modal (intro) or spotlight: dim everything, block touches outside the
  // hole. The hole itself has no element over it, so the real control works.
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {hole ? (
        <>
          {/* Dim + ring around the target (the giant shadow is the dim). */}
          <div
            className="fixed rounded-2xl border-2 border-white/80 transition-all duration-300 pointer-events-none"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: "0 0 0 200vmax rgba(0, 0, 0, 0.55)",
            }}
          />
          {/* Touch blockers around the hole — the only tappable thing on
              screen is the spotlit control. */}
          <div
            className="fixed left-0 right-0 top-0 pointer-events-auto"
            style={{ height: Math.max(hole.top, 0) }}
          />
          <div
            className="fixed left-0 right-0 bottom-0 pointer-events-auto"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className="fixed left-0 pointer-events-auto"
            style={{ top: hole.top, height: hole.height, width: Math.max(hole.left, 0) }}
          />
          <div
            className="fixed right-0 pointer-events-auto"
            style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55 pointer-events-auto" />
      )}

      {current.mode === "modal" || !hole ? (
        <div className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-[81]">
          <AnimatePresence mode="wait">{card}</AnimatePresence>
        </div>
      ) : (
        <div
          className="fixed inset-x-4 z-[81]"
          style={
            cardAbove
              ? { bottom: window.innerHeight - hole.top + 12 }
              : { top: hole.top + hole.height + 12 }
          }
        >
          <AnimatePresence mode="wait">{card}</AnimatePresence>
        </div>
      )}
    </div>
  );
}
