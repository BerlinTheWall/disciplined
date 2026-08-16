import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ListChecks, MessageSquareText, Plus, Sparkles, Trash2, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import { useChoose, useConfirm } from "@/components/ConfirmDialog";
import GoalCelebration from "@/components/goals/GoalCelebration";
import WeightInput from "@/components/goals/WeightInput";
import { goalColor } from "@/lib/goalPriority";
import {
  GOAL_PACE_COLOR,
  GOAL_PACE_LABEL,
  goalPace,
  goalProgress,
  isMilestoneDone,
  roundShares,
} from "@/lib/goalProgress";
import { tap } from "@/lib/motion";
import { useGoalFocusStore } from "@/store/goalFocusStore";
import { useGoalPlanWizardStore } from "@/store/goalPlanWizardStore";
import { useGoalStore } from "@/store/goalStore";
import { useTaskStore } from "@/store/taskStore";
import type { Goal } from "@/types/goals";
import type { Priority, Task } from "@/types/task";

const PRIORITY_CYCLE: (Priority | null)[] = [null, "high", "medium", "low"];

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
  const [noteEditing, setNoteEditing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  // Which milestone's linked-tasks list is expanded, if any — tapping a
  // milestone with AI-scheduled sessions reveals which tasks it's actually
  // tracking, since that's otherwise invisible (only its derived done state
  // shows on the row itself).
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);

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
          noteEditing={noteEditing}
          setNoteEditing={setNoteEditing}
          addingMilestone={addingMilestone}
          setAddingMilestone={setAddingMilestone}
          milestoneText={milestoneText}
          setMilestoneText={setMilestoneText}
          expandedMilestoneId={expandedMilestoneId}
          setExpandedMilestoneId={setExpandedMilestoneId}
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
  noteEditing,
  setNoteEditing,
  addingMilestone,
  setAddingMilestone,
  milestoneText,
  setMilestoneText,
  expandedMilestoneId,
  setExpandedMilestoneId,
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
  noteEditing: boolean;
  setNoteEditing: (v: boolean) => void;
  addingMilestone: boolean;
  setAddingMilestone: (v: boolean | ((prev: boolean) => boolean)) => void;
  milestoneText: string;
  setMilestoneText: (v: string) => void;
  expandedMilestoneId: string | null;
  setExpandedMilestoneId: (v: string | null) => void;
  confirm: ReturnType<typeof useConfirm>;
  choose: ReturnType<typeof useChoose>;
  onClose: () => void;
  onOpenTask: (t: Task) => void;
}) {
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
  const showNote = noteEditing || !!goal.note || pace === "behind" || pace === "at-risk";
  // Every task this goal actually drives — its own links plus whatever's
  // attached to a milestone (how AI-scheduled sessions get linked) — so
  // deleting the goal can offer to take them with it instead of silently
  // leaving them orphaned on the calendar.
  const allLinkedTaskIds = [
    ...goal.linkedTaskIds,
    ...goal.milestones.flatMap((m) => m.linkedTaskIds ?? []),
  ];

  const cyclePriority = () => {
    const next =
      PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(goal.priority) + 1) % PRIORITY_CYCLE.length];
    useGoalStore.getState().setPriority(goal.id, next);
  };

  const circumference = 2 * Math.PI * 44;
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
    <div className="relative px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] max-w-md mx-auto">
      <GoalCelebration show={celebrate} />

      <div className="flex items-center gap-3 mb-6">
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

      <div className="flex items-start gap-4 mb-7">
        <div className="relative w-[104px] h-[104px] shrink-0">
          <svg width="104" height="104" className="-rotate-90">
            <circle
              cx="52"
              cy="52"
              r="44"
              fill="none"
              stroke="var(--surface-subtle)"
              strokeWidth="10"
            />
            <circle
              cx="52"
              cy="52"
              r="44"
              fill="none"
              stroke={accent}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={p.done ? 0 : circumference * (1 - p.fraction)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {p.done ? (
              <Check size={28} style={{ color: accent }} strokeWidth={3} />
            ) : (
              <b className="text-[22px] font-extrabold leading-none">{p.percent}%</b>
            )}
            <span className="text-[10px] text-fg-faint font-semibold mt-1 text-center px-1">
              {subtitle}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-[19px] font-extrabold leading-tight">{goal.title}</h1>
          {pace && (
            <span
              className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mt-1.5"
              style={{
                color: GOAL_PACE_COLOR[pace],
                backgroundColor: `${GOAL_PACE_COLOR[pace]}26`,
              }}
            >
              {GOAL_PACE_LABEL[pace]}
            </span>
          )}
          {p.mode === "manual" && !p.done && (
            <motion.button
              onClick={() => useGoalStore.getState().addProgress(goal.id, 1)}
              whileTap={tap}
              className="flex items-center gap-1 text-[12.5px] font-semibold mt-1.5 px-2.5 py-1 rounded-full bg-surface-raised"
              style={{ color: accent }}
            >
              <Plus size={13} />
              Add progress
            </motion.button>
          )}
          <Collapse open={showNote} className="pt-1.5">
            <input
              value={goal.note ?? ""}
              onChange={(e) => useGoalStore.getState().setNote(goal.id, e.target.value)}
              onBlur={() => {
                if (!goal.note) setNoteEditing(false);
              }}
              placeholder="Why this matters…"
              className="w-full bg-transparent text-[13px] italic text-fg-muted placeholder-fg-faint focus:outline-none"
            />
          </Collapse>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {!showNote && (
            <ActionChip icon={MessageSquareText} label="Why" onClick={() => setNoteEditing(true)} />
          )}
          <ActionChip
            icon={Plus}
            label="Task"
            accent={accent}
            onClick={() => useGoalFocusStore.getState().requestAddTask(goal.id)}
          />
          <ActionChip
            icon={ListChecks}
            label="Milestone"
            accent={accent}
            onClick={() => setAddingMilestone((v) => !v)}
          />
          <ActionChip
            icon={Sparkles}
            label="Plan with AI"
            accent={accent}
            onClick={() => useGoalPlanWizardStore.getState().start(goal.id)}
          />
        </div>

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
          {goal.milestones.map((m) => {
            // A milestone with AI-scheduled sessions derives its done
            // state from them (see isMilestoneDone) — its dot must show
            // that same state, and toggling it by hand would silently do
            // nothing to the actual progress ring, so it isn't offered.
            const hasLinkedTasks = (m.linkedTaskIds?.length ?? 0) > 0;
            const done = isMilestoneDone(m, tasks);
            const expanded = expandedMilestoneId === m.id;
            const linkedTasks = hasLinkedTasks
              ? tasks
                  .filter((t) => m.linkedTaskIds!.includes(t.id))
                  .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
              : [];
            return (
              <div key={m.id} className="relative">
                <div className="py-2.5 flex items-center gap-3">
                  <button
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
                    className={`absolute -left-[22px] w-4 h-4 rounded-full border-2 shrink-0 ${
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
                  />
                  <button
                    onClick={
                      hasLinkedTasks
                        ? () => setExpandedMilestoneId(expanded ? null : m.id)
                        : undefined
                    }
                    className={`flex-1 min-w-0 text-left text-[14.5px] font-medium truncate ${
                      done ? "text-fg-faint line-through" : "text-fg"
                    }`}
                  >
                    {m.label}
                  </button>
                  {/* Weighting only means something with 2+ steps — a single
                        one is trivially 100% of the goal. */}
                  {goal.milestones.length > 1 && (
                    <WeightInput
                      value={m.weight}
                      placeholder={milestoneShareById[m.id] ?? 0}
                      onChange={(w) => useGoalStore.getState().setMilestoneWeight(goal.id, m.id, w)}
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
                  <Collapse open={expanded} outerClassName="-mt-1" className="pb-2.5">
                    <div className="flex flex-col gap-1.5">
                      {linkedTasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <button
                            onClick={() => useTaskStore.getState().toggleTaskCompleted(t.id)}
                            aria-label={t.completed ? "Mark task not done" : "Mark task done"}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              t.completed
                                ? "bg-fg border-fg text-fg-inverse"
                                : "border-border-strong text-transparent"
                            }`}
                          >
                            <Check size={9} strokeWidth={3.5} />
                          </button>
                          <button
                            onClick={() => onOpenTask(t)}
                            className={`flex-1 min-w-0 text-left text-xs truncate ${
                              t.completed ? "text-fg-faint line-through" : "text-fg-muted"
                            }`}
                          >
                            {t.title}
                          </button>
                        </div>
                      ))}
                    </div>
                  </Collapse>
                )}
              </div>
            );
          })}
        </div>
        {goal.milestones.length > 1 && (
          <p className="text-[11px] text-fg-faint mt-2">
            Type a step's % of this goal, or leave it blank to share the rest evenly.
          </p>
        )}
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
    </div>
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
