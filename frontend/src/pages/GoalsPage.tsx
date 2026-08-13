import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  Briefcase,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Heart,
  Plus,
  Target,
  User,
} from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import GoalCard from "@/components/goals/GoalCard";
import GoalDetailScreen from "@/components/goals/GoalDetailScreen";
import PeriodPath from "@/components/goals/PeriodPath";
import { chipCls } from "@/components/timeline/addItemOptions";
import CalendarMonth from "@/components/timeline/CalendarMonth";
import { FieldPanel } from "@/components/timeline/FieldPanel";
import { isLightColor } from "@/lib/color";
import { formatFullDate, parseISODate, relativeDayLabel, todayISODate } from "@/lib/date";
import {
  currentPeriodKey,
  goalCascadesInto,
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

const CATEGORIES: { key: GoalCategory; label: string; icon: typeof User }[] = [
  { key: "personal", label: "Personal", icon: User },
  { key: "work", label: "Work", icon: Briefcase },
  { key: "chore", label: "Chore", icon: CheckSquare },
  { key: "health", label: "Health", icon: Heart },
];

const PRIORITY_LEVELS: { key: Priority; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

// Same sage accent as --path-accent (index.css) — the Goals feature's own
// color, reused here for the date popup's "Done" button.
const GOAL_ACCENT = "#7ea852";
const GOAL_ACCENT_ON = isLightColor(GOAL_ACCENT) ? "#111827" : "#ffffff";

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

  const nativeListed = useMemo(
    () =>
      goals
        .filter((g) => g.period === period && g.periodKey === activeKey)
        .sort((a, b) => a.order - b.order),
    [goals, period, activeKey]
  );

  // Coarser goals (a month goal, say) that are still "live" during this
  // narrower view (one of that month's weeks) — see goalCascadesInto.
  // Appended after this period's own goals and rendered a touch quieter
  // (GoalCard's `cascaded` prop) so they read as "also going on", not as
  // belonging natively to this period.
  const cascadedListed = useMemo(
    () => goals.filter((g) => goalCascadesInto(g.period, g.periodKey, period, activeKey)),
    [goals, period, activeKey]
  );

  const listed = useMemo(
    () => [...nativeListed, ...cascadedListed],
    [nativeListed, cascadedListed]
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
  const [dateOpen, setDateOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  // Custom tags typed in from a past goal (plus whatever's mid-entry right
  // now), offered as chips alongside the built-in categories — a user's own
  // tags stick around without needing a separate place to manage them.
  const builtInCategoryKeys = useMemo(() => new Set(CATEGORIES.map((c) => c.key)), []);
  const customTags = useMemo(() => {
    const tags = new Set(
      goals.map((g) => g.category).filter((c): c is string => !!c && !builtInCategoryKeys.has(c))
    );
    if (newCategory && !builtInCategoryKeys.has(newCategory)) tags.add(newCategory);
    return Array.from(tags);
  }, [goals, newCategory, builtInCategoryKeys]);

  function commitTag() {
    const trimmed = tagDraft.trim();
    if (trimmed) setNewCategory(trimmed);
    setTagDraft("");
    setAddingTag(false);
  }

  // Seed the new-goal fields from whatever period/instance is currently
  // being browsed, so leaving everything untouched behaves the same way
  // adding a goal always has: it lands in the period you're looking at.
  function openAdd() {
    setNewScale(period);
    setNewStartDate(isCurrent ? todayISODate() : periodStartDate(period, activeKey));
    setDateOpen(false);
    setAddingTag(false);
    setTagDraft("");
    setAddOpen(true);
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const startDate = newStartDate || todayISODate();
    addGoal({
      period: newScale,
      periodKey: periodKeyFor(newScale, parseISODate(startDate)),
      title: trimmed,
      target: null,
      priority: newPriority,
      category: newCategory,
      startDate,
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
                cascaded={g.period !== period}
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
        <label className="text-xs font-bold tracking-wide text-fg-muted mb-2 block">
          Goal title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="What do you want to accomplish?"
          autoFocus
          className="w-full bg-surface-raised rounded-2xl px-4 py-3.5 text-[17px] font-semibold text-fg placeholder-fg-faint focus:outline-none"
        />

        <label className="text-xs font-bold tracking-wide text-fg-muted mt-5 mb-2 block">
          Timeframe scale
        </label>
        <div className="flex items-center bg-surface-raised rounded-xl p-1">
          {SCALES.map((s) => (
            <button
              key={s.key}
              onClick={() => setNewScale(s.key)}
              className="relative flex-1 h-9 rounded-lg text-sm font-medium"
            >
              {newScale === s.key && (
                <motion.span
                  layoutId="goalScaleSeg"
                  transition={spring.snappy}
                  className="absolute inset-0 bg-surface rounded-lg shadow-sm"
                />
              )}
              <span className={`relative z-10 ${newScale === s.key ? "text-fg" : "text-fg-muted"}`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>

        <label className="text-xs font-bold tracking-wide text-fg-muted mt-5 mb-2 block">
          Date
        </label>
        <motion.button
          onClick={() => setDateOpen(true)}
          whileTap={tap}
          className="w-full flex items-center justify-between bg-surface-raised rounded-2xl px-4 py-2.5"
        >
          <span className="flex items-center gap-2 text-fg font-medium">
            <Calendar size={18} className="text-fg-faint" />
            {formatFullDate(newStartDate)}
          </span>
          <span className="flex items-center gap-1 text-fg-faint text-sm">
            {relativeDayLabel(newStartDate)}
            <ChevronRight size={16} />
          </span>
        </motion.button>

        <label className="text-xs font-bold tracking-wide text-fg-muted mt-5 mb-2 block">
          Priority
        </label>
        <div className="flex items-center gap-2">
          {PRIORITY_LEVELS.map((level) => {
            const selected = newPriority === level.key;
            const color = goalColor(level.key);
            return (
              <motion.button
                key={level.key}
                onClick={() => setNewPriority(selected ? null : level.key)}
                whileTap={tap}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border text-sm font-medium"
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

        <div className="flex items-center justify-between mt-5 mb-2">
          <label className="text-xs font-bold tracking-wide text-fg-muted">Category</label>
          <motion.button
            onClick={() => setAddingTag(true)}
            whileTap={tap}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--path-accent)" }}
          >
            <Plus size={12} />
            Add tag
          </motion.button>
        </div>

        <Collapse open={addingTag}>
          <div className="flex items-center gap-2 pb-2">
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTag();
                if (e.key === "Escape") {
                  setTagDraft("");
                  setAddingTag(false);
                }
              }}
              placeholder="Tag name…"
              autoFocus
              className="flex-1 min-w-0 bg-surface-raised rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder-fg-faint focus:outline-none"
            />
            <motion.button
              onClick={commitTag}
              whileTap={tap}
              disabled={!tagDraft.trim()}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${
                tagDraft.trim() ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
              }`}
            >
              Add
            </motion.button>
          </div>
        </Collapse>

        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <motion.button
              key={c.key}
              onClick={() => setNewCategory((cur) => (cur === c.key ? null : c.key))}
              whileTap={tap}
              className={`flex items-center gap-1.5 ${chipCls(newCategory === c.key)}`}
            >
              <c.icon size={13} />
              {c.label}
            </motion.button>
          ))}
          {customTags.map((tag) => (
            <motion.button
              key={tag}
              onClick={() => setNewCategory((cur) => (cur === tag ? null : tag))}
              whileTap={tap}
              className={chipCls(newCategory === tag)}
            >
              {tag}
            </motion.button>
          ))}
        </div>

        <motion.button
          onClick={handleAdd}
          whileTap={tap}
          disabled={!title.trim()}
          className={`mt-6 w-full flex items-center justify-center gap-2 rounded-full py-4 font-semibold ${
            title.trim() ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
          }`}
        >
          <CirclePlus size={18} />
          Create goal
        </motion.button>
      </BottomSheet>

      {/* Rendered as a sibling of the sheet (not inside it), same as the task
          sheet's own field editor, so its fixed positioning survives the
          sheet's own slide-up transform. */}
      <FieldPanel
        open={addOpen && dateOpen}
        title="Date"
        color={GOAL_ACCENT}
        onColor={GOAL_ACCENT_ON}
        onClose={() => setDateOpen(false)}
      >
        <CalendarMonth
          value={newStartDate}
          color={GOAL_ACCENT}
          onChange={(iso) => {
            setNewStartDate(iso);
            setDateOpen(false);
          }}
        />
      </FieldPanel>

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
