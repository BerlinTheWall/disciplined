import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ListChecks,
  MessageSquareText,
  Plus,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";

import Collapse from "@/components/Collapse";
import { useConfirm } from "@/components/ConfirmDialog";
import GoalCelebration from "@/components/goals/GoalCelebration";
import LinkedGoalPicker from "@/components/goals/LinkedGoalPicker";
import { canLinkGoalPeriod } from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { GOAL_PACE_COLOR, GOAL_PACE_LABEL, goalPace, goalProgress } from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { useGoalFocusStore } from "@/store/goalFocusStore";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal } from "@/types/goals";
import type { Priority, Task } from "@/types/task";

const PRIORITY_CYCLE: (Priority | null)[] = [null, "high", "medium", "low"];

// The full-screen takeover a carousel card opens into — depth lives here
// (hero ring, milestone trail, linked items) rather than in an inline
// accordion, so the carousel itself stays scannable.
export default function GoalDetailScreen({
  goal,
  goals,
  tasks,
  onClose,
  onOpenTask,
}: {
  goal: Goal;
  goals: Goal[];
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
  const confirm = useConfirm();
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [milestoneText, setMilestoneText] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const p = goalProgress(goal, tasks, goals);
  const pace = goalPace(goal, tasks, goals);
  const accent = goalColor(goal.priority);
  const showNote = noteEditing || !!goal.note || pace === "behind" || pace === "at-risk";
  const linkableGoals = goals.filter(
    (g) => g.id !== goal.id && canLinkGoalPeriod(goal.period, g.period)
  );

  const wasDoneRef = useRef(p.done);
  useEffect(() => {
    const wasDone = wasDoneRef.current;
    wasDoneRef.current = p.done;
    if (!wasDone && p.done) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 900);
      return () => clearTimeout(t);
    }
  }, [p.done]);

  const toggleDone = () => useGoalStore.getState().toggleDone(goal.id);
  const cyclePriority = () => {
    const next =
      PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(goal.priority) + 1) % PRIORITY_CYCLE.length];
    useGoalStore.getState().setPriority(goal.id, next);
  };

  const circumference = 2 * Math.PI * 66;
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

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="fixed inset-0 z-50 bg-surface overflow-y-auto"
    >
      <div className="relative px-5 pt-[calc(18px+env(safe-area-inset-top))] pb-16 max-w-md mx-auto">
        <GoalCelebration show={celebrate} />

        <div className="flex items-center gap-3 mb-6">
          <motion.button
            onClick={onClose}
            whileTap={tap}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center shrink-0"
          >
            <ArrowLeft size={17} />
          </motion.button>
          <h1 className="flex-1 min-w-0 text-[17px] font-extrabold truncate">{goal.title}</h1>
          <motion.button
            onClick={cyclePriority}
            whileTap={tap}
            aria-label="Priority"
            className="text-[11px] font-extrabold uppercase tracking-wide shrink-0 px-2 py-1 rounded-full"
            style={{ color: accent, backgroundColor: `${accent}1f` }}
          >
            {goal.priority ?? "none"}
          </motion.button>
          <motion.button
            onClick={async () => {
              const ok = await confirm({
                title: "Delete goal?",
                message: `"${goal.title}" will be removed.`,
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) {
                useGoalStore.getState().deleteGoal(goal.id);
                onClose();
              }
            }}
            whileTap={tap}
            aria-label="Delete goal"
            className="p-1.5 text-fg-faint shrink-0"
          >
            <Trash2 size={17} />
          </motion.button>
        </div>

        <div className="flex flex-col items-center mb-7">
          <div className="relative w-[154px] h-[154px]">
            <svg width="154" height="154" className="-rotate-90">
              <circle
                cx="77"
                cy="77"
                r="66"
                fill="none"
                stroke="var(--surface-subtle)"
                strokeWidth="13"
              />
              <circle
                cx="77"
                cy="77"
                r="66"
                fill="none"
                stroke={accent}
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {p.done ? (
                <Check size={40} style={{ color: accent }} strokeWidth={3} />
              ) : (
                <b className="text-[34px] font-extrabold leading-none">{p.percent}%</b>
              )}
              <span className="text-[11px] text-fg-faint font-semibold mt-1.5">{subtitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-4">
            <motion.button
              onClick={toggleDone}
              whileTap={tap}
              aria-label={p.done ? "Mark not done" : "Mark done"}
              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${
                p.done ? "text-fg-inverse" : "border-border-strong text-transparent"
              }`}
              style={p.done ? { backgroundColor: accent, borderColor: accent } : undefined}
            >
              <Check size={18} strokeWidth={3} />
            </motion.button>
            {p.mode === "manual" && !p.done && (
              <motion.button
                onClick={() => useGoalStore.getState().addProgress(goal.id, 1)}
                whileTap={tap}
                aria-label="Add progress"
                className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center"
              >
                <Plus size={18} />
              </motion.button>
            )}
            {pace && (
              <span
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-full"
                style={{
                  color: GOAL_PACE_COLOR[pace],
                  backgroundColor: `${GOAL_PACE_COLOR[pace]}26`,
                }}
              >
                {GOAL_PACE_LABEL[pace]}
              </span>
            )}
          </div>
        </div>

        <Collapse open={showNote} className="pb-5">
          <input
            value={goal.note ?? ""}
            onChange={(e) => useGoalStore.getState().setNote(goal.id, e.target.value)}
            onBlur={() => {
              if (!goal.note) setNoteEditing(false);
            }}
            placeholder="Why this matters…"
            className="w-full bg-surface-alt rounded-xl px-3.5 py-2.5 text-[13.5px] italic text-fg-muted placeholder-fg-faint focus:outline-none"
          />
        </Collapse>

        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {!showNote && (
              <ActionChip
                icon={MessageSquareText}
                label="Why"
                onClick={() => setNoteEditing(true)}
              />
            )}
            <ActionChip
              icon={Plus}
              label="Task"
              accent={accent}
              onClick={() => useGoalFocusStore.getState().requestAddTask(goal.id)}
            />
            {linkableGoals.length > 0 && (
              <ActionChip
                icon={Waypoints}
                label="Goal"
                accent={accent}
                onClick={() => setGoalPickerOpen((v) => !v)}
              />
            )}
            <ActionChip
              icon={ListChecks}
              label="Milestone"
              accent={accent}
              onClick={() => setAddingMilestone((v) => !v)}
            />
          </div>

          <Collapse open={goalPickerOpen}>
            <LinkedGoalPicker goal={goal} allGoals={goals} />
          </Collapse>

          <Collapse open={addingMilestone}>
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
        </div>

        <Collapse open={goal.milestones.length > 0} outerClassName="mb-6">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-3">
            Milestones
          </p>
          <div className="relative pl-[22px]">
            <div className="absolute left-[7px] top-1.5 bottom-1.5 w-[2px] bg-surface-subtle" />
            {goal.milestones.map((m) => (
              <div key={m.id} className="relative py-2.5 flex items-center gap-3">
                <button
                  onClick={() => useGoalStore.getState().toggleMilestone(goal.id, m.id)}
                  aria-label={m.done ? "Mark step not done" : "Mark step done"}
                  className="absolute -left-[22px] w-4 h-4 rounded-full border-2 shrink-0"
                  style={
                    m.done
                      ? { backgroundColor: accent, borderColor: accent }
                      : { borderColor: "var(--surface-subtle)", backgroundColor: "var(--surface)" }
                  }
                />
                <span
                  className={`flex-1 min-w-0 text-[14.5px] font-medium truncate ${
                    m.done ? "text-fg-faint line-through" : "text-fg"
                  }`}
                >
                  {m.label}
                </span>
                <button
                  onClick={() => useGoalStore.getState().deleteMilestone(goal.id, m.id)}
                  aria-label="Delete step"
                  className="p-1 text-fg-faint shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </Collapse>

        <Collapse open={p.linkedTasks.length > 0 || p.linkedGoals.length > 0}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-fg-faint mb-3">
            Linked
          </p>
          <div className="flex flex-col gap-2 mb-2">
            {p.linkedTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2.5 rounded-xl bg-surface-alt px-3 py-2.5"
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
                <button
                  onClick={() => onOpenTask(t)}
                  className={`flex-1 min-w-0 text-left text-sm truncate ${
                    t.completed ? "text-fg-faint line-through" : "text-fg"
                  }`}
                >
                  {t.title}
                </button>
                <WeightInput goalId={goal.id} itemId={t.id} goal={goal} share={p.shares[t.id]} />
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
                    goalId={goal.id}
                    itemId={lg.id}
                    goal={goal}
                    share={p.shares[lg.id]}
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
      </div>
    </motion.div>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full bg-surface-raised"
      style={accent ? { color: accent } : { color: "var(--fg-faint)" }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function WeightInput({
  goalId,
  itemId,
  goal,
  share,
}: {
  goalId: string;
  itemId: string;
  goal: Goal;
  share: number;
}) {
  return (
    <div className="flex items-center shrink-0">
      <input
        value={goal.weights?.[itemId] != null ? String(goal.weights[itemId]) : ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          useGoalStore.getState().setWeight(goalId, itemId, raw === "" ? null : parseInt(raw, 10));
        }}
        placeholder={String(Math.round(share))}
        inputMode="numeric"
        aria-label="Weight"
        className="w-8 bg-transparent text-right text-xs font-medium tabular-nums text-fg placeholder-fg-faint focus:outline-none"
      />
      <span className="text-xs text-fg-faint">%</span>
    </div>
  );
}
