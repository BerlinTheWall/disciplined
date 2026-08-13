import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Plus, Target } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import GoalCard from "@/components/goals/GoalCard";
import GoalDetailScreen from "@/components/goals/GoalDetailScreen";
import PeriodPath from "@/components/goals/PeriodPath";
import { chipCls } from "@/components/timeline/addItemOptions";
import { parseISODate, toISODate } from "@/lib/date";
import {
  currentPeriodKey,
  periodKeyFor,
  periodLabel,
  periodStartDate,
  relativePeriodName,
  shiftPeriodKey,
} from "@/lib/goalPeriods";
import { goalColor } from "@/lib/goalPriority";
import { spring, tap } from "@/lib/motion";
import { useGoalStore } from "@/store/goalStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useTaskStore } from "@/store/taskStore";
import type { GoalCategory, GoalPeriod } from "@/types/goals";
import type { Priority, Task } from "@/types/task";

const PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const SCALES: { key: GoalPeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

const CATEGORIES: { key: GoalCategory; label: string }[] = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
  { key: "chore", label: "Chore" },
];

// "week" -> "weeks", "month" -> "months" — the duration input's trailing unit.
const SCALE_UNIT: Record<GoalPeriod, string> = { week: "weeks", month: "months", year: "years" };

const IMPORTANCE_LEVELS: { key: Priority; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

export default function GoalsPage({ onOpenSchedule }: { onOpenSchedule?: () => void }) {
  const goals = useGoalStore((s) => s.goals);
  const addGoal = useGoalStore((s) => s.addGoal);
  const rollover = useGoalStore((s) => s.rollover);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  const tasks = useTaskStore((s) => s.tasks);

  // Tap a linked task → land on its day in the schedule and scroll it into
  // view (DaySchedule consumes the focus id).
  function openTask(t: Task) {
    setSelectedDate(t.date);
    useScheduleFocusStore.getState().focusItem(t.id);
    onOpenSchedule?.();
  }

  const [period, setPeriod] = useState<GoalPeriod>("week");
  // One remembered key per horizon so switching tabs keeps your place.
  const [keys, setKeys] = useState<Record<GoalPeriod, string>>({
    week: currentPeriodKey("week"),
    month: currentPeriodKey("month"),
    year: currentPeriodKey("year"),
  });
  const activeKey = keys[period];
  const isCurrent = activeKey === currentPeriodKey(period);

  const listed = useMemo(
    () =>
      goals
        .filter((g) => g.period === period && g.periodKey === activeKey)
        .sort((a, b) => a.order - b.order),
    [goals, period, activeKey]
  );

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

  // The path's day-stops (Week view) open that day in the schedule; its
  // week/month-stops (Month/Year view) zoom the goals list itself in one
  // level, landing on that sub-period.
  function openDay(date: string) {
    setSelectedDate(date);
    onOpenSchedule?.();
  }
  function jumpPeriod(p: GoalPeriod, key: string) {
    setPeriod(p);
    setKeys((k) => ({ ...k, [p]: key }));
  }

  // Carousel scroll → dot pagination. No drag-reorder here on purpose: a
  // horizontal swipeable carousel and a horizontal drag-to-reorder gesture
  // would fight each other; priority already keeps the order meaningful.
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  // Reset the dot index during render when the tab/period changes (React's
  // documented "adjusting state" pattern), rather than in an effect — an
  // effect calling setState synchronously would trigger a second render for
  // no reason. The scrollTo below is a genuine external-system side effect
  // (the DOM node itself), so that part does belong in an effect.
  const [carouselKey, setCarouselKey] = useState(`${period}:${activeKey}`);
  if (carouselKey !== `${period}:${activeKey}`) {
    setCarouselKey(`${period}:${activeKey}`);
    setCarouselIndex(0);
  }
  useEffect(() => {
    carouselRef.current?.scrollTo({ left: 0 });
  }, [period, activeKey]);
  function handleCarouselScroll() {
    const el = carouselRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const cardWidth = first.offsetWidth + 12; // gap-3
    const idx = Math.round(el.scrollLeft / cardWidth);
    setCarouselIndex(Math.max(0, Math.min(listed.length - 1, idx)));
  }
  function goToCard(i: number) {
    const card = carouselRef.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const detailGoal = goals.find((g) => g.id === detailGoalId) ?? null;

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority | null>(null);
  const [newCategory, setNewCategory] = useState<GoalCategory | null>(null);
  const [newScale, setNewScale] = useState<GoalPeriod>("week");
  const [newStartDate, setNewStartDate] = useState("");
  const [newDuration, setNewDuration] = useState("1");

  // Seed the new-goal fields from whatever period/instance is currently
  // being browsed, so leaving everything untouched behaves the same way
  // adding a goal always has: it lands in the period you're looking at.
  function openAdd() {
    setNewScale(period);
    setNewStartDate(isCurrent ? toISODate(new Date()) : periodStartDate(period, activeKey));
    setNewDuration("1");
    setAddOpen(true);
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const duration = parseInt(newDuration, 10);
    const startDate = newStartDate || toISODate(new Date());
    addGoal({
      period: newScale,
      periodKey: periodKeyFor(newScale, parseISODate(startDate)),
      title: trimmed,
      target: null,
      priority: newPriority,
      category: newCategory,
      startDate,
      durationCount: Number.isFinite(duration) && duration > 0 ? duration : null,
    });
    setTitle("");
    setNewPriority(null);
    setNewCategory(null);
    setAddOpen(false);
  }

  return (
    <div className="relative space-y-4 pb-6">
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

      {/* Period navigation + Path */}
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
        <div className="mt-3">
          <PeriodPath
            period={period}
            activeKey={activeKey}
            goals={goals}
            tasks={tasks}
            onOpenDay={openDay}
            onJumpPeriod={jumpPeriod}
          />
        </div>
      </div>

      {/* Goal carousel */}
      {listed.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-3">
            <Target size={24} className="text-fg-faint" />
          </div>
          <p className="text-sm text-fg-faint max-w-52">
            No goals for this {period} yet. Tap + to add one.
          </p>
        </div>
      ) : (
        <>
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4"
            style={{ scrollbarWidth: "none" }}
          >
            {listed.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                goals={goals}
                tasks={tasks}
                onOpen={() => setDetailGoalId(g.id)}
              />
            ))}
          </div>
          {listed.length > 1 && (
            <div className="flex justify-center gap-1.5">
              {listed.map((g, i) => (
                <button
                  key={g.id}
                  onClick={() => goToCard(i)}
                  aria-label={`Go to ${g.title}`}
                  className="p-1.5 -m-1.5"
                >
                  <span
                    className="block h-1.5 rounded-full transition-all"
                    style={{
                      width: i === carouselIndex ? 16 : 6,
                      backgroundColor:
                        i === carouselIndex ? "var(--path-accent)" : "var(--surface-subtle)",
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}

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

      {/* Floating add button — there's no natural "bottom of the list" once
          goals are a carousel, so quick-add moves off the always-visible bar
          and into a deliberate sheet instead. */}
      <motion.button
        onClick={openAdd}
        whileTap={tap}
        aria-label="Add a goal"
        className="fixed right-5 bottom-[calc(84px+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-fg text-fg-inverse flex items-center justify-center shadow-lg z-30"
      >
        <Plus size={26} />
      </motion.button>

      <BottomSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        className="bg-surface rounded-t-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        <p className="text-sm font-semibold text-fg mb-3">New goal</p>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Goal title…"
          autoFocus
          className="w-full bg-surface-raised rounded-xl px-3.5 py-3 text-[15px] text-fg placeholder-fg-faint focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-fg-faint">
          Linking tasks/goals, milestones and a note all happen after, from the goal's own screen.
        </p>

        <div className="mt-4 rounded-2xl bg-surface-alt divide-y divide-border-strong overflow-hidden">
          <div className="px-4 py-3.5">
            <p className="text-xs font-medium text-fg-faint mb-2.5">Importance</p>
            <div className="flex items-center gap-2">
              {IMPORTANCE_LEVELS.map((level) => {
                const selected = newPriority === level.key;
                const color = goalColor(level.key);
                return (
                  <motion.button
                    key={level.key}
                    onClick={() => setNewPriority(selected ? null : level.key)}
                    whileTap={tap}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium"
                    style={
                      selected
                        ? { borderColor: color, backgroundColor: `${color}1a`, color }
                        : { borderColor: "var(--border-strong)", color: "var(--fg-muted)" }
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {level.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <p className="text-xs font-medium text-fg-faint mb-2.5">Category</p>
            <div className="flex items-center gap-2">
              {CATEGORIES.map((c) => (
                <motion.button
                  key={c.key}
                  onClick={() => setNewCategory((cur) => (cur === c.key ? null : c.key))}
                  whileTap={tap}
                  className={chipCls(newCategory === c.key)}
                >
                  {c.label}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <p className="text-xs font-medium text-fg-faint mb-2.5">Scale</p>
            <div className="flex items-center gap-2">
              {SCALES.map((s) => (
                <motion.button
                  key={s.key}
                  onClick={() => setNewScale(s.key)}
                  whileTap={tap}
                  className={chipCls(newScale === s.key)}
                >
                  {s.label}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3.5">
            <p className="text-xs font-medium text-fg-faint mb-2.5">Starts &amp; lasts</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => e.target.value && setNewStartDate(e.target.value)}
                className="flex-1 min-w-0 bg-surface rounded-xl px-3.5 py-2.5 text-[14.5px] text-fg focus:outline-none"
              />
              <input
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="w-12 bg-surface rounded-xl px-1 py-2.5 text-[14.5px] text-center text-fg focus:outline-none"
              />
              <span className="text-[13px] text-fg-faint shrink-0">{SCALE_UNIT[newScale]}</span>
            </div>
          </div>
        </div>

        <motion.button
          onClick={handleAdd}
          whileTap={tap}
          disabled={!title.trim()}
          className={`mt-4 w-full py-3 rounded-xl text-[15px] font-semibold ${
            title.trim() ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
          }`}
        >
          Add goal
        </motion.button>
      </BottomSheet>

      <AnimatePresence>
        {detailGoal && (
          <GoalDetailScreen
            key={detailGoal.id}
            goal={detailGoal}
            goals={goals}
            tasks={tasks}
            onClose={() => setDetailGoalId(null)}
            onOpenTask={openTask}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
