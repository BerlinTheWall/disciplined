import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  Briefcase,
  Calendar,
  Check,
  CheckSquare,
  FileText,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import { useChoose, useConfirm, usePrompt } from "@/components/ConfirmDialog";
import GoalCelebrationBurst, { GoalCelebrationLabel } from "@/components/goals/GoalCelebration";
import GoalEditSheet from "@/components/goals/GoalEditSheet";
import MilestoneDetailSheet from "@/components/goals/MilestoneDetailSheet";
import MilestoneReorderSheet from "@/components/goals/MilestoneReorderSheet";
import WeightInput from "@/components/goals/WeightInput";
import AddItemSheet from "@/components/timeline/AddItemSheet";
import TaskDetailSheet from "@/components/timeline/TaskDetailSheet";
import type { EditItem } from "@/components/timeline/Timeline";
import { hexToRgba } from "@/lib/color";
import { parseISODate, todayISODate } from "@/lib/date";
import { goalEndDate } from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import {
  GOAL_PACE_COLOR,
  GOAL_PACE_LABEL,
  goalPace,
  goalProgress,
  isMilestoneDone,
  milestoneCompletionFraction,
  roundShares,
} from "@/lib/goalProgress";
import { spring, tap } from "@/lib/motion";
import { useGoalPlanWizardStore } from "@/store/goalPlanWizardStore";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal, GoalMilestone } from "@/types/goals";
import type { Task } from "@/types/task";

// A milestone with linked (AI-scheduled) tasks has no plain `done` flag to
// toggle by hand — its circle instead completes (or, tapped again once
// they're all done, un-completes) every one of those tasks, which is what
// isMilestoneDone actually derives its state from.
function toggleMilestoneTasks(m: GoalMilestone, tasks: Task[]) {
  const completed = !isMilestoneDone(m, tasks);
  for (const id of m.linkedTaskIds ?? []) {
    useTaskStore.getState().updateTask(id, { completed });
  }
}

// A little extra trail past the last milestone's own measured bottom
// (trailEnd), so the closing "Done" dot doesn't sit flush against it.
const TRAIL_CLOSE_PAD = 12;

// Same built-in categories as GoalsPage's add-goal sheet (a custom typed-in
// tag falls back to the plain description icon below) — lets the
// description line show what the goal is actually filed under at a glance.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  personal: User,
  work: Briefcase,
  chore: CheckSquare,
  health: Heart,
};

// A bottom sheet, same as tapping a task on the timeline opens — depth lives
// here (hero ring, milestone trail, linked items) rather than in an inline
// accordion, so the carousel itself stays scannable. `goal` stays data-driven
// (null while closed/animating out) so BottomSheet's AnimatePresence can play
// the close animation against the last-rendered content.
export default function GoalDetailScreen({
  goal,
  goals,
  tasks,
  onClose,
  onOpenTask,
}: {
  goal: Goal | null;
  goals: Goal[];
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
  const confirm = useConfirm();
  const choose = useChoose();
  const prompt = usePrompt();
  const [celebrate, setCelebrate] = useState(false);

  const p = goal ? goalProgress(goal, tasks, goals) : null;
  const pace = goal ? goalPace(goal, tasks, goals) : null;

  const wasDoneRef = useRef(p?.done ?? false);
  useEffect(() => {
    if (!p) return;
    const wasDone = wasDoneRef.current;
    wasDoneRef.current = p.done;
    if (!wasDone && p.done) {
      setCelebrate(true);
      // Long enough for the confetti burst and its label to fully play out
      // and fade (see GoalCelebration) rather than getting cut off mid-way.
      const t = setTimeout(() => setCelebrate(false), 1600);
      return () => clearTimeout(t);
    }
  }, [p?.done]);

  return (
    <BottomSheet
      isOpen={!!goal}
      onClose={onClose}
      className="bg-surface max-h-[82vh] overflow-y-auto"
    >
      {goal && p && (
        <GoalDetailContent
          goal={goal}
          goals={goals}
          tasks={tasks}
          p={p}
          pace={pace}
          celebrate={celebrate}
          confirm={confirm}
          choose={choose}
          prompt={prompt}
          onClose={onClose}
          onOpenTask={onOpenTask}
        />
      )}
    </BottomSheet>
  );
}

function GoalDetailContent({
  goal,
  goals,
  tasks,
  p,
  pace,
  celebrate,
  confirm,
  choose,
  prompt,
  onClose,
  onOpenTask,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  p: ReturnType<typeof goalProgress>;
  pace: ReturnType<typeof goalPace>;
  celebrate: boolean;
  confirm: ReturnType<typeof useConfirm>;
  choose: ReturnType<typeof useChoose>;
  prompt: ReturnType<typeof usePrompt>;
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
  // Tapping a linked task shows its info popup first (same one the schedule
  // itself uses) rather than jumping straight to the calendar — "Show on
  // calendar" inside it does that jump instead.
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  // The full task editor, handed off from the read-only viewer's own Edit
  // button — same "close the viewer, open the editor" flow the schedule
  // page itself uses (Timeline.tsx), rather than the viewer being a dead
  // end here.
  const [editingItem, setEditingItem] = useState<EditItem | null>(null);
  const [editing, setEditing] = useState(false);
  // Tapping a milestone opens a popup with its title/weight/tasks — see
  // MilestoneDetailSheet.
  const [viewingMilestoneId, setViewingMilestoneId] = useState<string | null>(null);
  // Opens the flat drag-to-reorder list (MilestoneReorderSheet) — separate
  // from viewingMilestoneId since it's a whole-list action, not one row's.
  const [reordering, setReordering] = useState(false);
  // Description collapses to 1 line, expanding on "Show more". Animating
  // this with framer-motion's `layout` prop (the first attempt) used its
  // FLIP technique — scaling the whole box between its before/after size —
  // which visibly warps the text mid-transition instead of just revealing
  // more of it. Animating an explicit pixel `height` instead (measured via
  // a permanently 1-line-clamped, invisible probe copy of the text — its
  // clientHeight is the collapsed target, scrollHeight the expanded one,
  // both readable even while it stays clamped) avoids that: the real,
  // unclamped text sits in a plain box whose height we tween directly, so
  // it just reflows normally and gets progressively revealed.
  const [descExpanded, setDescExpanded] = useState(false);
  const [descLineHeight, setDescLineHeight] = useState<number | null>(null);
  const [descFullHeight, setDescFullHeight] = useState<number | null>(null);
  const descProbeRef = useRef<HTMLSpanElement>(null);
  const descWrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const probe = descProbeRef.current;
    const wrap = descWrapRef.current;
    if (!probe || !wrap || !goal.description) return;
    function measure() {
      if (!probe) return;
      setDescLineHeight(probe.clientHeight);
      setDescFullHeight(probe.scrollHeight);
    }
    measure();
    // Watching the wrapper (not the clamped probe itself, whose box never
    // resizes) catches width-driven reflow — sheet resize, orientation
    // change; re-measuring once the real font is ready catches Inter
    // Variable's async webfont swap (main.tsx) changing how much text fits
    // versus the fallback font used for the very first measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [goal.description]);
  const descOverflowing =
    descLineHeight != null && descFullHeight != null && descFullHeight - descLineHeight > 1;

  // Pixel-precise centers of each milestone's dot, relative to the trail
  // container — the trail's fill used to assume every row was the same
  // height (each milestone got an equal 1/n slice), but a row with
  // AI-scheduled sessions is visibly taller than a plain one, so the
  // percentage math drifted away from where the dots actually sit the
  // moment milestones weren't uniform. getBoundingClientRect sidesteps
  // that (and every intervening padding/position:relative wrapper) by
  // reading real layout instead of assuming it.
  const trailRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dotCenters, setDotCenters] = useState<number[]>([]);
  // Where the trail should end after the last milestone — its own row's
  // real bottom edge (which already includes its full linked-task list,
  // however tall that made it), not a guessed "next dot" distance. Lets
  // the last milestone's segment reach all the way down instead of
  // stopping short whenever it happens to be the tallest row, and gives
  // the closing end-dot below a real position to sit at.
  const [trailEnd, setTrailEnd] = useState<number | null>(null);
  useLayoutEffect(() => {
    const container = trailRef.current;
    if (!container) return;
    function measure() {
      if (!container) return;
      const containerTop = container.getBoundingClientRect().top;
      const centers = goal.milestones.map((m) => {
        const dot = dotRefs.current[m.id];
        if (!dot) return null;
        const r = dot.getBoundingClientRect();
        return r.top - containerTop + r.height / 2;
      });
      if (centers.every((c): c is number => c !== null)) setDotCenters(centers);
      const lastMilestone = goal.milestones[goal.milestones.length - 1];
      const lastRow = lastMilestone ? rowRefs.current[lastMilestone.id] : null;
      if (lastRow) setTrailEnd(lastRow.getBoundingClientRect().bottom - containerTop);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [goal.milestones]);

  // Rounded together (not each independently, like WeightInput's own
  // internal Math.round would) so the displayed percents actually sum to
  // the true total instead of drifting — six even shares each rounding up
  // would otherwise read as 102%. Linked tasks and goals share one weight
  // pool (goalProgress computes them together), so they round together too.
  const milestoneShareById: Record<string, number> = {};
  roundShares(goal.milestones.map((m) => p.milestoneShares[m.id] ?? 0)).forEach((share, i) => {
    milestoneShareById[goal.milestones[i].id] = share;
  });
  const linkedIds = [...p.linkedTasks.map((t) => t.id), ...p.linkedGoals.map((lg) => lg.id)];
  const linkedShareById: Record<string, number> = {};
  roundShares(linkedIds.map((id) => p.shares[id] ?? 0)).forEach((share, i) => {
    linkedShareById[linkedIds[i]] = share;
  });
  const accent = goalColor(goal.priority);
  const DescriptionIcon = (goal.category && CATEGORY_ICON[goal.category]) || FileText;
  // Every task this goal actually drives — its own links plus whatever's
  // attached to a milestone (how AI-scheduled sessions get linked) — so
  // deleting the goal can offer to take them with it instead of silently
  // leaving them orphaned on the calendar.
  const allLinkedTaskIds = [
    ...goal.linkedTaskIds,
    ...goal.milestones.flatMap((m) => m.linkedTaskIds ?? []),
  ];

  // Lives in the edit sheet as a quiet destructive button at the bottom
  // (Structured-style — see the design-reference memory) rather than as
  // its own icon up here next to Edit, so the two aren't sitting side by
  // side inviting a mis-tap.
  async function handleDeleteGoal() {
    const taskCount = allLinkedTaskIds.length;
    let deleteTasksToo = false;

    if (taskCount === 0) {
      const ok = await confirm({
        title: "Delete goal?",
        message: `"${goal.title}" will be removed.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
    } else {
      const choice = await choose({
        title: "Delete goal?",
        message: `"${goal.title}" has ${taskCount} linked task${taskCount === 1 ? "" : "s"} on your calendar. Delete those too, or just unlink them from the goal?`,
        options: [
          {
            label: `Delete goal and ${taskCount} task${taskCount === 1 ? "" : "s"}`,
            value: "goal-and-tasks",
            destructive: true,
          },
          { label: "Delete goal only", value: "goal-only", destructive: true },
        ],
      });
      if (!choice) return;
      deleteTasksToo = choice === "goal-and-tasks";
    }

    if (deleteTasksToo) {
      for (const taskId of allLinkedTaskIds) useTaskStore.getState().deleteTask(taskId);
    }
    useGoalStore.getState().deleteGoal(goal.id);
    onClose();
  }

  // Every milestone gets its own trail segment below its dot — including
  // the last one, which reaches its own row's measured bottom (trailEnd)
  // rather than a guessed "next dot" distance.
  const trailMeasured = dotCenters.length === goal.milestones.length && trailEnd != null;

  const circumference = 2 * Math.PI * 40;
  const subtitle =
    p.mode === "linked"
      ? `${p.current} of ${p.total} linked`
      : p.mode === "milestones"
        ? `${p.current} of ${p.total} milestones`
        : p.mode === "manual"
          ? `${p.current} of ${p.total}`
          : p.done
            ? "Done"
            : "Not done yet";
  const endDate = goalEndDate(goal.period, goal.periodKey, goal.startDate, goal.durationCount);
  const daysRemaining = Math.round(
    (parseISODate(endDate).getTime() - parseISODate(todayISODate()).getTime()) / 86400000
  );

  return (
    <div className="relative px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center shrink-0"
        >
          <X size={17} />
        </motion.button>
        <div className="flex-1" />
        <motion.button
          onClick={() => useGoalPlanWizardStore.getState().start(goal.id)}
          whileTap={tap}
          className="shrink-0 flex items-center justify-center gap-1 h-9 px-3.5 rounded-full text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          <Sparkles size={14} />
          Plan with AI
        </motion.button>
        <motion.button
          onClick={() => setEditing(true)}
          whileTap={tap}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-surface-raised text-sm font-medium text-fg shrink-0"
        >
          <Pencil size={15} />
          Edit
        </motion.button>
      </div>

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h1 className="min-w-0 text-[25px] font-extrabold leading-tight">{goal.title}</h1>
        <span className="flex items-center gap-1.5 shrink-0 text-[12px] font-semibold text-fg-muted bg-surface-raised px-2.5 py-1.5 rounded-full">
          <Calendar size={13} className="shrink-0 text-fg-faint" />
          {parseISODate(endDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {goal.description && (
        <div className="flex items-start gap-1.5 mb-5 text-[13.5px] text-fg-muted">
          <DescriptionIcon size={14} className="shrink-0 mt-0.5" style={{ color: accent }} />
          <div ref={descWrapRef} className="relative min-w-0 flex-1">
            <span
              ref={descProbeRef}
              aria-hidden
              className="line-clamp-1 invisible absolute inset-x-0 pointer-events-none select-none"
            >
              {goal.description}
            </span>
            <motion.div
              className="overflow-hidden"
              initial={false}
              animate={{ height: (descExpanded ? descFullHeight : descLineHeight) ?? "auto" }}
              transition={spring.gentle}
            >
              <span>{goal.description}</span>
            </motion.div>
            {descOverflowing && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="block text-[12px] font-semibold mt-0.5"
                style={{ color: accent }}
              >
                {descExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-2xl text-fg p-5 mb-4"
        style={{ backgroundColor: `${accent}14` }}
      >
        <GoalCelebrationLabel show={celebrate} />

        <div className="flex items-center gap-4">
          <motion.div
            className="relative w-24 h-24 shrink-0"
            animate={celebrate ? { scale: [1, 1.14, 1] } : undefined}
            transition={spring.pop}
          >
            <GoalCelebrationBurst show={celebrate} />
            <svg width="96" height="96" className="-rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="var(--surface-subtle)"
                strokeWidth="9"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke={accent}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {p.done ? (
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={spring.pop}
                >
                  <Check size={26} style={{ color: accent }} strokeWidth={3} />
                </motion.div>
              ) : (
                <b className="text-[21px] font-extrabold leading-none text-fg">{p.percent}%</b>
              )}
            </div>
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p
                className="text-[10.5px] font-extrabold uppercase tracking-wide"
                style={{ color: accent }}
              >
                Overall progress
              </p>
              {/* Once done, pace no longer means anything (goalPace returns
                null for a finished goal) — shown as "Done" in the same spot
                instead of just disappearing. */}
              {(pace || p.done) && (
                <span
                  className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: p.done ? GOAL_PACE_COLOR["on-track"] : GOAL_PACE_COLOR[pace!],
                    backgroundColor: `${p.done ? GOAL_PACE_COLOR["on-track"] : GOAL_PACE_COLOR[pace!]}26`,
                  }}
                >
                  {p.done ? "Done" : GOAL_PACE_LABEL[pace!]}
                </span>
              )}
            </div>
            <p className="text-[14.5px] font-bold leading-tight mb-3 text-fg">{subtitle}</p>
            <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: accent }}
                initial={false}
                animate={{ width: `${Math.round((p.done ? 1 : p.fraction) * 100)}%` }}
                transition={spring.gentle}
              />
            </div>
            <p className="text-right text-[10.5px] font-semibold text-fg-faint mt-1.5">
              {daysRemaining > 0
                ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
                : daysRemaining === 0
                  ? "Last day"
                  : `${-daysRemaining} day${-daysRemaining === 1 ? "" : "s"} overdue`}
            </p>
          </div>
        </div>

        {p.mode === "manual" && !p.done && (
          <motion.button
            onClick={() => useGoalStore.getState().addProgress(goal.id, 1)}
            whileTap={tap}
            className="flex items-center gap-1 text-[12.5px] font-semibold mt-4 px-2.5 py-1 rounded-full"
            style={{ color: accent, backgroundColor: `${accent}26` }}
          >
            <Plus size={13} />
            Add progress
          </motion.button>
        )}
      </div>

      <div className="border-t border-border pt-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] font-extrabold uppercase tracking-wide text-fg-faint">
            Milestones
          </p>
          <div className="flex items-center gap-2">
            {goal.milestones.length > 1 && (
              <motion.button
                onClick={() => setReordering(true)}
                whileTap={tap}
                aria-label="Reorder milestones"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-surface-raised"
              >
                <ArrowUpDown size={13} />
              </motion.button>
            )}
            <motion.button
              onClick={async () => {
                const label = await prompt({
                  title: "Add Milestone",
                  placeholder: "Add a step…",
                  confirmLabel: "Add",
                });
                const trimmed = label?.trim();
                if (trimmed) useGoalStore.getState().addMilestone(goal.id, trimmed);
              }}
              whileTap={tap}
              className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-raised text-[12px] font-semibold"
            >
              <Plus size={12} />
              Add Milestone
            </motion.button>
          </div>
        </div>

        <Collapse open={goal.milestones.length > 0}>
          <div ref={trailRef} className="relative">
            {/* Background + fill both prefer the dots' real on-screen
              centers (dotCenters), measured by the effect above — but
              never wait on that measurement to show *something*: until
              it lands (or if it never does, for whatever reason), fall
              back to the old assumed-equal-slice percentages rather than
              rendering no trail at all. */}
            {goal.milestones.length > 1 && (
              <div
                className="absolute left-[13.5px] w-0.75 rounded-full bg-surface-subtle"
                style={
                  trailMeasured
                    ? {
                        top: `${dotCenters[0]}px`,
                        height: `${trailEnd! + TRAIL_CLOSE_PAD - dotCenters[0]}px`,
                      }
                    : { top: "0.75rem", bottom: "0.75rem" }
                }
              />
            )}
            {/* One segment per milestone, starting at its own dot — the
              last one has no next dot to measure toward, so it reaches for
              its own row's real bottom (trailEnd, which already accounts
              for however tall its linked-task list made that row) instead.
              Fills as its own scheduled sessions get checked off, or
              all-or-nothing for a plain one. */}
            {goal.milestones.map((m, i) => {
              const segFraction = milestoneCompletionFraction(m, tasks);
              const n = goal.milestones.length;
              const style: CSSProperties = trailMeasured
                ? {
                    backgroundColor: accent,
                    top: `${dotCenters[i]}px`,
                    height: `${
                      ((i < n - 1 ? dotCenters[i + 1] : trailEnd! + TRAIL_CLOSE_PAD) -
                        dotCenters[i]) *
                      segFraction
                    }px`,
                  }
                : {
                    backgroundColor: accent,
                    top: `calc(0.75rem + (100% - 1.5rem) * ${i / n})`,
                    height: `calc((100% - 1.5rem) * ${segFraction / n})`,
                  };
              return (
                <div
                  key={m.id}
                  className="absolute left-[13.5px] w-0.75 rounded-full transition-[height] duration-500 ease-out"
                  style={style}
                />
              );
            })}
            <div className="flex flex-col">
              {goal.milestones.map((m) => {
                // A milestone with AI-scheduled sessions derives its done
                // state from them (see isMilestoneDone) — its dot completes
                // (or un-completes) every one of those tasks instead of a
                // plain `done` flag, via toggleMilestoneTasks above.
                const hasLinkedTasks = (m.linkedTaskIds?.length ?? 0) > 0;
                const done = isMilestoneDone(m, tasks);
                const linkedTasks = hasLinkedTasks
                  ? tasks
                      .filter((t) => m.linkedTaskIds!.includes(t.id))
                      .sort(
                        (a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes
                      )
                  : [];
                const doneTaskCount = linkedTasks.filter((t) => t.completed).length;
                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      rowRefs.current[m.id] = el;
                    }}
                    className="relative flex gap-3 py-2.5"
                  >
                    <div className="relative z-10 w-7.5 shrink-0 flex justify-center pt-0.5">
                      <button
                        ref={(el) => {
                          dotRefs.current[m.id] = el;
                        }}
                        onClick={() =>
                          hasLinkedTasks
                            ? toggleMilestoneTasks(m, tasks)
                            : useGoalStore.getState().toggleMilestone(goal.id, m.id)
                        }
                        aria-label={done ? "Mark step not done" : "Mark step done"}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={
                          done
                            ? { backgroundColor: accent, borderColor: accent }
                            : {
                                borderColor: "var(--surface-subtle)",
                                backgroundColor: "var(--surface)",
                              }
                        }
                      >
                        {done && <Check size={11} strokeWidth={3.5} className="text-fg-inverse" />}
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingMilestoneId(m.id)}
                          className={`flex-1 min-w-0 text-left text-[14.5px] font-semibold truncate ${
                            done ? "text-fg-faint line-through" : "text-fg"
                          }`}
                        >
                          {m.label}
                        </button>
                        {/* Read-only here — weighting only means something
                          with 2+ steps, and is only editable from the
                          milestone's own edit sheet (tap to open, see
                          MilestoneDetailSheet — that's also where it's
                          deleted from). */}
                        {goal.milestones.length > 1 && (
                          <span className="shrink-0 text-xs font-medium tabular-nums text-fg-faint">
                            {Math.round(m.weight ?? milestoneShareById[m.id] ?? 0)}%
                          </span>
                        )}
                      </div>
                      {hasLinkedTasks && (
                        <p className="text-[11px] text-fg-faint mt-0.5">
                          {doneTaskCount} of {linkedTasks.length} sessions
                        </p>
                      )}

                      {hasLinkedTasks && (
                        <div className="flex flex-col gap-1.5 mt-2">
                          {linkedTasks.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center gap-2 rounded-xl px-2.5 py-2"
                              style={{ backgroundColor: hexToRgba(t.color, 0.12) }}
                            >
                              <button
                                onClick={() => useTaskStore.getState().toggleTaskCompleted(t.id)}
                                aria-label={t.completed ? "Mark task not done" : "Mark task done"}
                                className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: t.completed ? t.color : "transparent",
                                  borderColor: t.color,
                                }}
                              >
                                <Check
                                  size={9}
                                  strokeWidth={3.5}
                                  className={t.completed ? "text-white" : "text-transparent"}
                                />
                              </button>
                              <button
                                onClick={() => setViewingTask(t)}
                                className={`flex-1 min-w-0 text-left text-[12.5px] truncate ${
                                  t.completed ? "text-fg-faint line-through" : "text-fg-muted"
                                }`}
                              >
                                {t.title}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Closes off the trail after the last milestone with a "Done"
              marker for the goal as a whole — filled only once every
              milestone is, unlike the real dots above which each track just
              their own. Toggles the last milestone on tap, same rule as its
              own row dot (see toggleMilestoneTasks above) — that's a
              separate thing from what the fill now shows, but the tap
              target sits right where that row's own dot would be, so it
              stays wired to it rather than doing nothing. Overlapping the
              real dot above it — which can happen for a milestone without
              linked tasks, whose row is short — is harmless here since both
              trigger the exact same toggle for the exact same milestone. */}
            {trailMeasured &&
              goal.milestones.length > 1 &&
              (() => {
                const lastMilestone = goal.milestones[goal.milestones.length - 1];
                const lastHasLinkedTasks = (lastMilestone.linkedTaskIds?.length ?? 0) > 0;
                const lastDone = isMilestoneDone(lastMilestone, tasks);
                const allDone = goal.milestones.every((m) => isMilestoneDone(m, tasks));
                const closeTop = trailEnd! + TRAIL_CLOSE_PAD - 10;
                return (
                  <>
                    <button
                      onClick={() =>
                        lastHasLinkedTasks
                          ? toggleMilestoneTasks(lastMilestone, tasks)
                          : useGoalStore.getState().toggleMilestone(goal.id, lastMilestone.id)
                      }
                      aria-label={lastDone ? "Mark step not done" : "Mark step done"}
                      className="absolute z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                      style={{
                        left: "0.3125rem",
                        top: `${closeTop}px`,
                        ...(allDone
                          ? { backgroundColor: accent, borderColor: accent }
                          : {
                              borderColor: "var(--surface-subtle)",
                              backgroundColor: "var(--surface)",
                            }),
                      }}
                    >
                      {allDone && <Check size={11} strokeWidth={3.5} className="text-fg-inverse" />}
                    </button>
                    <span
                      className="absolute z-10 text-[14.5px] font-semibold"
                      style={{
                        left: "2.625rem",
                        top: `${closeTop}px`,
                        lineHeight: "1.25rem",
                        color: allDone ? accent : "var(--fg-faint)",
                      }}
                    >
                      Done
                    </span>
                  </>
                );
              })()}
            {/* Reserves real flow space for the closing dot/label above,
              which — like every dot before it — sits 10px past its own
              anchor and is now anchored TRAIL_CLOSE_PAD past trailEnd on
              top of that. Absolute positioning doesn't grow trailRef's own
              box to fit it, so without this spacer that overhang would
              paint past the sheet's last bit of bottom padding and clip. */}
            {goal.milestones.length > 1 && <div style={{ height: TRAIL_CLOSE_PAD + 10 }} />}
          </div>
        </Collapse>
      </div>

      <Collapse open={p.linkedTasks.length > 0 || p.linkedGoals.length > 0}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-3">
          Linked
        </p>
        <div className="flex flex-col gap-2 mb-2">
          {p.linkedTasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: hexToRgba(t.color, 0.12) }}
            >
              <button
                onClick={() => useTaskStore.getState().toggleTaskCompleted(t.id)}
                aria-label={t.completed ? "Mark task not done" : "Mark task done"}
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: t.completed ? t.color : "transparent",
                  borderColor: t.color,
                }}
              >
                <Check
                  size={11}
                  strokeWidth={3.5}
                  className={t.completed ? "text-white" : "text-transparent"}
                />
              </button>
              <button
                onClick={() => setViewingTask(t)}
                className={`flex-1 min-w-0 text-left text-sm truncate ${
                  t.completed ? "text-fg-faint line-through" : "text-fg"
                }`}
              >
                {t.title}
              </button>
              <WeightInput
                value={goal.weights?.[t.id]}
                placeholder={linkedShareById[t.id] ?? 0}
                onChange={(w) => useGoalStore.getState().setWeight(goal.id, t.id, w)}
              />
              <button
                onClick={() => useGoalStore.getState().linkTask(null, t.id)}
                aria-label="Unlink task"
                className="p-1 text-fg-faint shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {p.linkedGoals.map((lg) => {
            const sub = goalProgress(lg, tasks, goals);
            return (
              <div
                key={lg.id}
                className="flex items-center gap-2.5 rounded-xl bg-surface-alt px-3 py-2.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: goalColor(lg.priority) }}
                />
                <span
                  className={`flex-1 min-w-0 text-sm truncate ${
                    sub.done ? "text-fg-faint line-through" : "text-fg"
                  }`}
                >
                  {lg.title}
                </span>
                <WeightInput
                  value={goal.weights?.[lg.id]}
                  placeholder={linkedShareById[lg.id] ?? 0}
                  onChange={(w) => useGoalStore.getState().setWeight(goal.id, lg.id, w)}
                />
                <button
                  onClick={() => useGoalStore.getState().linkGoal(null, lg.id)}
                  aria-label="Unlink goal"
                  className="p-1 text-fg-faint shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-fg-faint">
          Type a task or goal's % of this one, or leave it blank to share the rest evenly.
        </p>
      </Collapse>

      <TaskDetailSheet
        item={viewingTask ? { type: "task", data: viewingTask } : null}
        onClose={() => setViewingTask(null)}
        onShowOnCalendar={viewingTask ? () => onOpenTask(viewingTask) : undefined}
        onEdit={(item) => {
          setViewingTask(null);
          setEditingItem(item);
        }}
      />

      <AddItemSheet
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        editItem={editingItem}
      />

      <GoalEditSheet
        goal={editing ? goal : null}
        onClose={() => setEditing(false)}
        onDelete={handleDeleteGoal}
      />

      <MilestoneDetailSheet
        goal={goal}
        milestoneId={viewingMilestoneId}
        tasks={tasks}
        accent={accent}
        milestoneShareById={milestoneShareById}
        onClose={() => setViewingMilestoneId(null)}
        onViewTask={setViewingTask}
      />

      <MilestoneReorderSheet goal={goal} isOpen={reordering} onClose={() => setReordering(false)} />
    </div>
  );
}
