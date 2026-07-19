import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { useConfirm } from "@/components/ConfirmDialog";
import {
  currentPeriodKey,
  periodLabel,
  relativePeriodName,
  shiftPeriodKey,
} from "@/lib/goalPeriods";
import { spring, tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import type { GoalPeriod } from "@/types/goals";

const PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

// Goals hub: pick a horizon (week/month/year), browse period instances with
// the arrows, check goals off or nudge their progress, and pull unfinished
// ones forward from the previous period.
export default function GoalsPage() {
  const { goals, addGoal, toggleDone, addProgress, deleteGoal, rollover } = useGoalStore();
  const confirm = useConfirm();

  const [period, setPeriod] = useState<GoalPeriod>("week");
  // One remembered key per horizon so switching tabs doesn't lose your place.
  const [keys, setKeys] = useState<Record<GoalPeriod, string>>({
    week: currentPeriodKey("week"),
    month: currentPeriodKey("month"),
    year: currentPeriodKey("year"),
  });
  const activeKey = keys[period];
  const isCurrent = activeKey === currentPeriodKey(period);

  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");

  const listed = goals
    .filter((g) => g.period === period && g.periodKey === activeKey)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  // Unfinished goals from the previous period, offered as a one-tap carry
  // over — only when looking at the current period.
  const prevKey = shiftPeriodKey(period, activeKey, -1);
  const carryCount = isCurrent
    ? goals.filter((g) => {
        if (g.period !== period || g.periodKey !== prevKey || g.done) return false;
        return !listed.some((cur) => cur.title === g.title);
      }).length
    : 0;

  function shift(delta: number) {
    setKeys((k) => ({ ...k, [period]: shiftPeriodKey(period, k[period], delta) }));
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parsedTarget = parseInt(target, 10);
    addGoal({
      period,
      periodKey: activeKey,
      title: trimmed,
      target: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null,
    });
    setTitle("");
    setTarget("");
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Horizon toggle */}
      <div className="flex items-center bg-surface-raised rounded-xl p-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`relative flex-1 h-9 rounded-lg text-sm font-medium transition-colors ${
              period === p.key ? "bg-surface shadow-sm text-fg" : "text-fg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between px-1">
        <motion.button onClick={() => shift(-1)} whileTap={tap} className="p-2 -m-2 text-fg-faint">
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

      {/* Carry-over from the previous period */}
      {carryCount > 0 && (
        <motion.button
          onClick={() => rollover(period, prevKey, activeKey)}
          whileTap={tap}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full flex items-center gap-2.5 bg-surface-raised rounded-2xl px-4 py-3 text-left"
        >
          <ArrowDownToLine size={16} className="text-fg-muted shrink-0" />
          <span className="text-sm font-medium text-fg">
            Bring over {carryCount} unfinished from last {period}
          </span>
        </motion.button>
      )}

      {/* Goal list */}
      {listed.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-fg-faint">No goals for this {period} yet — add one below.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {listed.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={spring.pop}
                className="bg-surface rounded-2xl shadow-soft px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <motion.button
                    onClick={() => toggleDone(g.id)}
                    whileTap={tap}
                    aria-label={g.done ? "Mark as not done" : "Mark as done"}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      g.done
                        ? "bg-fg border-fg text-fg-inverse"
                        : "border-border-strong text-transparent"
                    }`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </motion.button>
                  <p
                    className={`flex-1 min-w-0 font-medium truncate ${
                      g.done ? "text-fg-faint line-through" : "text-fg"
                    }`}
                  >
                    {g.title}
                  </p>
                  {g.target !== null && !g.done && (
                    <motion.button
                      onClick={() => addProgress(g.id, 1)}
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
                        message: `"${g.title}" will be removed.`,
                        confirmLabel: "Delete",
                        destructive: true,
                      });
                      if (ok) deleteGoal(g.id);
                    }}
                    whileTap={tap}
                    aria-label="Delete goal"
                    className="p-1.5 -m-0.5 text-fg-faint shrink-0"
                  >
                    <X size={16} />
                  </motion.button>
                </div>

                {g.target !== null && (
                  <div className="mt-2.5 flex items-center gap-3 pl-10">
                    <div className="flex-1 h-2 rounded-full bg-surface-subtle overflow-hidden">
                      <motion.div
                        animate={{ width: `${Math.min(100, (g.progress / g.target) * 100)}%` }}
                        transition={spring.gentle}
                        className="h-full rounded-full bg-fg"
                      />
                    </div>
                    <span className="text-xs font-medium text-fg-muted tabular-nums shrink-0">
                      {g.progress}/{g.target}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add a goal */}
      <div className="flex items-center gap-2">
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
          className="w-16 bg-surface rounded-xl px-2 py-3 text-[15px] text-center text-fg placeholder-fg-faint shadow-soft focus:outline-none"
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
      <p className="text-[11px] text-fg-faint px-1 -mt-2">
        Add a number to make it a progress goal — e.g. “Read books” of 12.
      </p>
    </div>
  );
}
