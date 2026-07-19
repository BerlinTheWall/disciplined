import { useMemo, useState } from "react";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  GripVertical,
  Plus,
  Target,
  X,
} from "lucide-react";

import { useConfirm } from "@/components/ConfirmDialog";
import { relativeDayLabel } from "@/lib/date";
import {
  currentPeriodKey,
  periodLabel,
  relativePeriodName,
  shiftPeriodKey,
} from "@/lib/goalPeriods";
import { goalProgress } from "@/lib/goalProgress";
import { spring, tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { useGoalFocusStore } from "@/store/goalFocusStore";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal, GoalPeriod } from "@/types/goals";
import type { Priority } from "@/types/task";

const PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

// Cycle order for the priority flag: none → high → medium → low → none.
const PRIORITY_CYCLE: (Priority | null)[] = [null, "high", "medium", "low"];
const ACCENT = "#9ec06a";
const priorityColor = (p: Priority | null) => (p ? PRIORITY_META[p].color : ACCENT);

export default function GoalsPage() {
  const goals = useGoalStore((s) => s.goals);
  const addGoal = useGoalStore((s) => s.addGoal);
  const reorder = useGoalStore((s) => s.reorder);
  const rollover = useGoalStore((s) => s.rollover);

  const [period, setPeriod] = useState<GoalPeriod>("week");
  // One remembered key per horizon so switching tabs keeps your place.
  const [keys, setKeys] = useState<Record<GoalPeriod, string>>({
    week: currentPeriodKey("week"),
    month: currentPeriodKey("month"),
    year: currentPeriodKey("year"),
  });
  const activeKey = keys[period];
  const isCurrent = activeKey === currentPeriodKey(period);

  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [newPriority, setNewPriority] = useState<Priority | null>(null);

  const listed = useMemo(
    () =>
      goals
        .filter((g) => g.period === period && g.periodKey === activeKey)
        .sort((a, b) => a.order - b.order),
    [goals, period, activeKey]
  );

  const tasks = useTaskStore((s) => s.tasks);
  const doneCount = listed.filter((g) => goalProgress(g, tasks).done).length;

  // Unfinished goals from the previous period, offered as one-tap carry-over
  // (current period only).
  const prevKey = shiftPeriodKey(period, activeKey, -1);
  const carryCount = isCurrent
    ? goals.filter(
        (g) =>
          g.period === period &&
          g.periodKey === prevKey &&
          !g.done &&
          !listed.some((cur) => cur.title === g.title)
      ).length
    : 0;

  function shift(delta: number) {
    setKeys((k) => ({ ...k, [period]: shiftPeriodKey(period, k[period], delta) }));
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsed = parseInt(target, 10);
    addGoal({
      period,
      periodKey: activeKey,
      title: trimmed,
      target: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      priority: newPriority,
    });
    setTitle("");
    setTarget("");
    setNewPriority(null);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Horizon toggle with an animated selected pill */}
      <div className="flex items-center bg-surface-raised rounded-xl p-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className="relative flex-1 h-9 rounded-lg text-sm font-medium"
          >
            {period === p.key && (
              <motion.span
                layoutId="goalSeg"
                transition={spring.snappy}
                className="absolute inset-0 bg-surface rounded-lg shadow-sm"
              />
            )}
            <span className={`relative z-10 ${period === p.key ? "text-fg" : "text-fg-muted"}`}>
              {p.label}
            </span>
          </button>
        ))}
      </div>

      {/* Period navigation + summary */}
      <div>
        <div className="flex items-center justify-between px-1">
          <motion.button
            onClick={() => shift(-1)}
            whileTap={tap}
            className="p-2 -m-2 text-fg-faint"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <div className="text-center">
            <p className="text-sm font-semibold text-fg capitalize">
              {relativePeriodName(period, activeKey) ?? periodLabel(period, activeKey)}
            </p>
            {relativePeriodName(period, activeKey) && (
              <p className="text-[11px] text-fg-faint">{periodLabel(period, activeKey)}</p>
            )}
          </div>
          <motion.button onClick={() => shift(1)} whileTap={tap} className="p-2 -m-2 text-fg-faint">
            <ChevronRight size={18} />
          </motion.button>
        </div>
        {listed.length > 0 && (
          <div className="mt-2 flex items-center gap-3 px-1">
            <div className="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
              <motion.div
                animate={{ width: `${(doneCount / listed.length) * 100}%` }}
                transition={spring.gentle}
                className="h-full rounded-full"
                style={{ backgroundColor: ACCENT }}
              />
            </div>
            <span className="text-xs font-medium text-fg-muted tabular-nums shrink-0">
              {doneCount}/{listed.length} done
            </span>
          </div>
        )}
      </div>

      {/* Carry-over */}
      <AnimatePresence>
        {carryCount > 0 && (
          <motion.button
            onClick={() => rollover(period, prevKey, activeKey)}
            whileTap={tap}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full flex items-center gap-2.5 bg-surface-raised rounded-2xl px-4 py-3 text-left"
          >
            <ArrowDownToLine size={16} className="text-fg-muted shrink-0" />
            <span className="text-sm font-medium text-fg">
              Bring over {carryCount} unfinished from last {period}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Goal list — drag the handle to reorder */}
      {listed.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-3">
            <Target size={24} className="text-fg-faint" />
          </div>
          <p className="text-sm text-fg-faint max-w-52">
            No goals for this {period} yet. Add one below — link tasks to it and it fills as you
            finish them.
          </p>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={listed}
          onReorder={(next) =>
            reorder(
              period,
              activeKey,
              next.map((g) => g.id)
            )
          }
          className="flex flex-col gap-2.5"
        >
          {listed.map((g) => (
            <GoalRow key={g.id} goal={g} tasks={tasks} />
          ))}
        </Reorder.Group>
      )}

      {/* Add a goal */}
      <div className="pt-1 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setNewPriority(
                PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(newPriority) + 1) % PRIORITY_CYCLE.length]
              )
            }
            aria-label="Cycle new goal priority"
            className="w-11 h-11 rounded-xl bg-surface shadow-soft flex items-center justify-center shrink-0"
          >
            <Flag
              size={17}
              style={{ color: priorityColor(newPriority) }}
              fill={newPriority ? priorityColor(newPriority) : "none"}
            />
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={`Add a goal for this ${period}…`}
            className="flex-1 min-w-0 bg-surface rounded-xl px-3.5 py-3 text-[15px] text-fg placeholder-fg-faint shadow-soft focus:outline-none"
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="of #"
            inputMode="numeric"
            className="w-14 bg-surface rounded-xl px-2 py-3 text-[15px] text-center text-fg placeholder-fg-faint shadow-soft focus:outline-none"
          />
          <motion.button
            onClick={handleAdd}
            whileTap={tap}
            disabled={!title.trim()}
            aria-label="Add goal"
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              title.trim() ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
            }`}
          >
            <Plus size={20} />
          </motion.button>
        </div>
        <p className="text-[11px] text-fg-faint px-1">
          Add a number for a progress goal (e.g. “Read” of 12), or link tasks to a goal and it fills
          as you complete them.
        </p>
      </div>
    </div>
  );
}

// ── One goal row ─────────────────────────────────────────────────────────────

function GoalRow({ goal, tasks }: { goal: Goal; tasks: Parameters<typeof goalProgress>[1] }) {
  const controls = useDragControls();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);

  const p = goalProgress(goal, tasks);
  const accent = priorityColor(goal.priority);

  const toggleDone = () => useGoalStore.getState().toggleDone(goal.id);
  const cyclePriority = () => {
    const next =
      PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(goal.priority) + 1) % PRIORITY_CYCLE.length];
    useGoalStore.getState().setPriority(goal.id, next);
  };

  return (
    <Reorder.Item
      value={goal}
      dragListener={false}
      dragControls={controls}
      className="relative bg-surface rounded-2xl shadow-soft overflow-hidden"
    >
      {/* Priority accent stripe */}
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onPointerDown={(e) => controls.start(e)}
            aria-label="Drag to reorder"
            className="touch-none text-fg-faint -ml-1 cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </button>

          <motion.button
            onClick={toggleDone}
            whileTap={tap}
            aria-label={p.done ? "Mark not done" : "Mark done"}
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
              p.done ? "text-fg-inverse" : "border-border-strong text-transparent"
            }`}
            style={p.done ? { backgroundColor: accent, borderColor: accent } : undefined}
          >
            <Check size={15} strokeWidth={3} />
          </motion.button>

          <p
            className={`flex-1 min-w-0 font-medium truncate ${
              p.done ? "text-fg-faint line-through" : "text-fg"
            }`}
          >
            {goal.title}
          </p>

          <motion.button
            onClick={cyclePriority}
            whileTap={tap}
            aria-label="Set priority"
            className="p-1.5 shrink-0"
          >
            <Flag
              size={16}
              style={{ color: goal.priority ? accent : "var(--fg-faint)" }}
              fill={goal.priority ? accent : "none"}
            />
          </motion.button>

          {p.mode === "manual" && !p.done && (
            <motion.button
              onClick={() => useGoalStore.getState().addProgress(goal.id, 1)}
              whileTap={tap}
              aria-label="Add progress"
              className="w-8 h-8 rounded-full bg-surface-raised text-fg flex items-center justify-center shrink-0"
            >
              <Plus size={16} />
            </motion.button>
          )}

          <motion.button
            onClick={async () => {
              const ok = await confirm({
                title: "Delete goal?",
                message: `"${goal.title}" will be removed.`,
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) useGoalStore.getState().deleteGoal(goal.id);
            }}
            whileTap={tap}
            aria-label="Delete goal"
            className="p-1.5 text-fg-faint shrink-0"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Progress bar for manual + task-linked goals */}
        {p.mode !== "check" && (
          <div className="mt-2.5 flex items-center gap-3 pl-[38px]">
            <div className="flex-1 h-2 rounded-full bg-surface-subtle overflow-hidden">
              <motion.div
                animate={{ width: `${p.fraction * 100}%` }}
                transition={spring.gentle}
                className="h-full rounded-full"
                style={{ backgroundColor: accent }}
              />
            </div>
            <span className="text-xs font-medium text-fg-muted tabular-nums shrink-0">
              {p.current}/{p.total}
              {p.mode === "tasks" ? " tasks" : ""}
            </span>
          </div>
        )}

        {/* Linked-task controls */}
        <div className="mt-2 pl-[38px] flex items-center gap-3">
          {p.mode === "tasks" && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-fg-muted"
            >
              <ChevronDown
                size={13}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? "Hide tasks" : "Show tasks"}
            </button>
          )}
          <button
            onClick={() => useGoalFocusStore.getState().requestAddTask(goal.id)}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: accent }}
          >
            <Plus size={13} />
            Add task
          </button>
        </div>

        <AnimatePresence initial={false}>
          {expanded && p.linkedTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="pl-[38px] overflow-hidden"
            >
              <div className="mt-2 flex flex-col gap-1.5">
                {p.linkedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-xl bg-surface-alt px-2.5 py-2"
                  >
                    <button
                      onClick={() => useTaskStore.getState().toggleTaskCompleted(t.id)}
                      aria-label={t.completed ? "Mark task not done" : "Mark task done"}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        t.completed
                          ? "bg-fg border-fg text-fg-inverse"
                          : "border-border-strong text-transparent"
                      }`}
                    >
                      <Check size={11} strokeWidth={3.5} />
                    </button>
                    <span
                      className={`flex-1 min-w-0 text-sm truncate ${
                        t.completed ? "text-fg-faint line-through" : "text-fg"
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="text-[11px] text-fg-faint shrink-0 capitalize">
                      {relativeDayLabel(t.date)}
                    </span>
                    <button
                      onClick={() => useGoalStore.getState().linkTask(null, t.id)}
                      aria-label="Unlink task"
                      className="p-1 text-fg-faint shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}
