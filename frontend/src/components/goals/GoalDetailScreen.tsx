import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Calendar,
  Check,
  CheckSquare,
  FileText,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import { useChoose, useConfirm } from "@/components/ConfirmDialog";
import GoalCelebration from "@/components/goals/GoalCelebration";
import GoalEditSheet from "@/components/goals/GoalEditSheet";
import MilestoneDetailSheet from "@/components/goals/MilestoneDetailSheet";
import WeightInput from "@/components/goals/WeightInput";
import TaskDetailSheet from "@/components/timeline/TaskDetailSheet";
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
  roundShares,
} from "@/lib/goalProgress";
import { spring, tap } from "@/lib/motion";
import { useGoalPlanWizardStore } from "@/store/goalPlanWizardStore";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal } from "@/types/goals";
import type { Task } from "@/types/task";

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
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [milestoneText, setMilestoneText] = useState("");
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
      const t = setTimeout(() => setCelebrate(false), 900);
      return () => clearTimeout(t);
    }
  }, [p?.done]);

  return (
    <BottomSheet
      isOpen={!!goal}
      onClose={onClose}
      className="bg-surface max-h-[92vh] overflow-y-auto"
    >
      {goal && p && (
        <GoalDetailContent
          goal={goal}
          goals={goals}
          tasks={tasks}
          p={p}
          pace={pace}
          celebrate={celebrate}
          addingMilestone={addingMilestone}
          setAddingMilestone={setAddingMilestone}
          milestoneText={milestoneText}
          setMilestoneText={setMilestoneText}
          confirm={confirm}
          choose={choose}
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
  addingMilestone,
  setAddingMilestone,
  milestoneText,
  setMilestoneText,
  confirm,
  choose,
  onClose,
  onOpenTask,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  p: ReturnType<typeof goalProgress>;
  pace: ReturnType<typeof goalPace>;
  celebrate: boolean;
  addingMilestone: boolean;
  setAddingMilestone: (v: boolean | ((prev: boolean) => boolean)) => void;
  milestoneText: string;
  setMilestoneText: (v: string) => void;
  confirm: ReturnType<typeof useConfirm>;
  choose: ReturnType<typeof useChoose>;
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
  // Tapping a linked task shows its info popup first (same one the schedule
  // itself uses) rather than jumping straight to the calendar — "Show on
  // calendar" inside it does that jump instead.
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  // Tapping a milestone opens a popup with its title/weight/tasks — see
  // MilestoneDetailSheet.
  const [viewingMilestoneId, setViewingMilestoneId] = useState<string | null>(null);
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
      <GoalCelebration show={celebrate} />

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
          aria-label="Edit goal"
          className="p-1.5 text-fg-faint shrink-0"
        >
          <Pencil size={16} />
        </motion.button>
        <motion.button
          onClick={async () => {
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
          }}
          whileTap={tap}
          aria-label="Delete goal"
          className="p-1.5 text-fg-faint shrink-0"
        >
          <Trash2 size={17} />
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

      <div className="rounded-2xl bg-surface-feature text-white p-5 mb-4">
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg width="96" height="96" className="-rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.14)"
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
                <Check size={26} style={{ color: accent }} strokeWidth={3} />
              ) : (
                <b className="text-[21px] font-extrabold leading-none">{p.percent}%</b>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p
                className="text-[10.5px] font-extrabold uppercase tracking-wide"
                style={{ color: accent }}
              >
                Overall progress
              </p>
              {pace && (
                <span
                  className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: GOAL_PACE_COLOR[pace],
                    backgroundColor: `${GOAL_PACE_COLOR[pace]}26`,
                  }}
                >
                  {GOAL_PACE_LABEL[pace]}
                </span>
              )}
            </div>
            <p className="text-[14.5px] font-bold leading-tight mb-3">{subtitle}</p>
            <div className="h-1.5 rounded-full bg-surface-feature-alt overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: accent }}
                initial={false}
                animate={{ width: `${Math.round((p.done ? 1 : p.fraction) * 100)}%` }}
                transition={spring.gentle}
              />
            </div>
            <p className="text-right text-[10.5px] font-semibold text-gray-400 mt-1.5">
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
            className="flex items-center gap-1 text-[12.5px] font-semibold mt-4 px-2.5 py-1 rounded-full bg-surface-feature-alt"
            style={{ color: accent }}
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
          <motion.button
            onClick={() => setAddingMilestone((v) => !v)}
            whileTap={tap}
            className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-raised text-[12px] font-semibold"
          >
            <Plus size={12} />
            Add Milestone
          </motion.button>
        </div>

        <Collapse open={addingMilestone} className="pb-3">
          <input
            autoFocus
            value={milestoneText}
            onChange={(e) => setMilestoneText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const trimmed = milestoneText.trim();
              if (trimmed) useGoalStore.getState().addMilestone(goal.id, trimmed);
              setMilestoneText("");
              setAddingMilestone(false);
            }}
            placeholder="Add a step…"
            className="w-full bg-surface-alt rounded-xl px-3.5 py-2.5 text-[13.5px] text-fg placeholder-fg-faint focus:outline-none"
          />
        </Collapse>

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
                className="absolute left-3.75 w-0.75 rounded-full bg-surface-subtle"
                style={
                  trailMeasured
                    ? { top: `${dotCenters[0]}px`, height: `${trailEnd! - dotCenters[0]}px` }
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
              const linkedIds = m.linkedTaskIds ?? [];
              const segFraction =
                linkedIds.length > 0
                  ? linkedIds.filter((id) => tasks.find((t) => t.id === id)?.completed).length /
                    linkedIds.length
                  : m.done
                    ? 1
                    : 0;
              const n = goal.milestones.length;
              const style: CSSProperties = trailMeasured
                ? {
                    backgroundColor: accent,
                    top: `${dotCenters[i]}px`,
                    height: `${
                      ((i < n - 1 ? dotCenters[i + 1] : trailEnd!) - dotCenters[i]) * segFraction
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
                  className="absolute left-3.75 w-0.75 rounded-full transition-[height] duration-500 ease-out"
                  style={style}
                />
              );
            })}
            <div className="flex flex-col">
              {goal.milestones.map((m) => {
                // A milestone with AI-scheduled sessions derives its done
                // state from them (see isMilestoneDone) — its dot must show
                // that same state, and toggling it by hand would silently do
                // nothing to the actual progress ring, so it isn't offered.
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
                        onClick={
                          hasLinkedTasks
                            ? undefined
                            : () => useGoalStore.getState().toggleMilestone(goal.id, m.id)
                        }
                        disabled={hasLinkedTasks}
                        aria-label={
                          hasLinkedTasks
                            ? done
                              ? "Done — every scheduled session is completed"
                              : "Not done — scheduled sessions still pending"
                            : done
                              ? "Mark step not done"
                              : "Mark step done"
                        }
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          hasLinkedTasks ? "cursor-default" : ""
                        }`}
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
                        {/* Weighting only means something with 2+ steps — a
                          single one is trivially 100% of the goal. */}
                        {goal.milestones.length > 1 && (
                          <WeightInput
                            value={m.weight}
                            placeholder={milestoneShareById[m.id] ?? 0}
                            onChange={(w) =>
                              useGoalStore.getState().setMilestoneWeight(goal.id, m.id, w)
                            }
                          />
                        )}
                        <button
                          onClick={() => useGoalStore.getState().deleteMilestone(goal.id, m.id)}
                          aria-label="Delete step"
                          className="p-1 text-fg-faint shrink-0"
                        >
                          <X size={13} />
                        </button>
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
            {/* Closes off the trail after the last milestone, mirroring
              every other dot — filled once that milestone itself is done,
              same as a real one, since there's no further milestone to
              hand off to. */}
            {trailMeasured &&
              goal.milestones.length > 1 &&
              (() => {
                const lastMilestone = goal.milestones[goal.milestones.length - 1];
                const lastDone = isMilestoneDone(lastMilestone, tasks);
                return (
                  <div
                    className="absolute z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                    style={{
                      left: "0.3125rem",
                      top: `${trailEnd! - 10}px`,
                      ...(lastDone
                        ? { backgroundColor: accent, borderColor: accent }
                        : {
                            borderColor: "var(--surface-subtle)",
                            backgroundColor: "var(--surface)",
                          }),
                    }}
                  >
                    {lastDone && <Check size={11} strokeWidth={3.5} className="text-fg-inverse" />}
                  </div>
                );
              })()}
          </div>
          {goal.milestones.length > 1 && (
            <p className="text-[11px] text-fg-faint mt-2">
              Type a step's % of this goal, or leave it blank to share the rest evenly.
            </p>
          )}
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
      />

      <GoalEditSheet goal={editing ? goal : null} onClose={() => setEditing(false)} />

      <MilestoneDetailSheet
        goal={goal}
        milestoneId={viewingMilestoneId}
        tasks={tasks}
        accent={accent}
        milestoneShareById={milestoneShareById}
        onClose={() => setViewingMilestoneId(null)}
        onViewTask={setViewingTask}
      />
    </div>
  );
}
