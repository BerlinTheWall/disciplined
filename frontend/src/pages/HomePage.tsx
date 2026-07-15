import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  Square,
  UtensilsCrossed,
  Volume2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useNow } from "@/hooks/useNow";
import { useReadAloud } from "@/hooks/useReadAloud";
import { prefetchAssistantVoice } from "@/hooks/useSpeech";
import { assistantDayBriefing } from "@/lib/assistantSpeech";
import { fetchBriefingScript } from "@/lib/briefing";
import { todayISODate } from "@/lib/date";
import { CALORIE_GOAL } from "@/lib/goals";
import { dayNutrition, indexItems, money } from "@/lib/grocery";
import { getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { monthStartISO, spendInRange } from "@/lib/insights";
import { press, tap } from "@/lib/motion";
import type { Page } from "@/lib/pages";
import { PRIORITY_META } from "@/lib/priority";
import { useExpenseStore } from "@/store/expenseStore";
import { useGroceryStore } from "@/store/groceryStore";
import { useHabitStore } from "@/store/habitStore";
import { useMealStore } from "@/store/mealStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { Priority } from "@/types/task";

interface HomePageProps {
  onViewAll?: () => void;
  onNavigate?: (page: Page) => void;
}

interface DayItem {
  id: string;
  kind: "task" | "habit";
  title: string;
  startMinutes: number;
  durationMinutes: number;
  color: string;
  icon: keyof typeof ICONS;
  completed: boolean;
  priority?: Priority | null;
}

const PRIO_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
// Ring accents, one per discipline pillar.
const RING_TASKS = "#9ec06a"; // soft green
const RING_HABITS = "#eab464"; // warm amber
const RING_MOVE = "#60a5fa"; // blue

function fmt12(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return {
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`,
    period: h < 12 ? "AM" : "PM",
  };
}

// Apple-Activity-style concentric rings: outer→inner is tasks, habits, movement.
// Each ring's faint track is a dim tint of its own colour, so a pillar with
// nothing planned still reads as "this ring exists, nothing done yet". The
// centre shows the day's overall completion, or a check once every planned
// ring is closed.
function ActivityRings({
  data,
  centerLabel,
  perfect,
  size = 104,
}: {
  data: { pct: number; color: string; active: boolean }[];
  centerLabel: number;
  perfect: boolean;
  size?: number;
}) {
  const stroke = 10;
  const gap = 4;
  const c = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {data.map((d, i) => {
          const r = c - stroke / 2 - i * (stroke + gap);
          const circ = 2 * Math.PI * r;
          return (
            <g key={i}>
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={`${d.color}33`}
                strokeWidth={stroke}
              />
              {d.active && d.pct > 0 && (
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - Math.min(d.pct, 1))}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {perfect ? (
          <Check size={22} className="text-white" strokeWidth={3} />
        ) : (
          <span className="text-lg font-bold text-white tabular-nums">
            {centerLabel}
            <span className="text-[10px] align-top">%</span>
          </span>
        )}
      </div>
    </div>
  );
}

// One legend row beside the rings: a colour dot, the pillar name, and its
// done/total — or a rest label when nothing's planned for that pillar today.
function RingStat({
  label,
  color,
  done,
  total,
  rest,
}: {
  label: string;
  color: string;
  done: number;
  total: number;
  rest: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <p className="text-sm text-gray-300 flex-1 min-w-0 truncate">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums">
        {total ? `${done}/${total}` : rest}
      </p>
    </div>
  );
}

// A compact tappable stat tile for a domain Home doesn't otherwise surface
// (nutrition, spending): an icon, the headline number, a progress bar toward a
// goal/budget, and a one-line caption. Tapping deep-links to that page.
function GlanceTile({
  icon: Icon,
  color,
  label,
  value,
  unit,
  sub,
  pct,
  barColor,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  pct: number;
  barColor: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={press}
      className="flex flex-col gap-2.5 text-left rounded-3xl bg-surface-alt border border-border-strong shadow-soft p-4"
    >
      <div className="flex items-center justify-between">
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}1f` }}
        >
          <Icon size={16} style={{ color }} />
        </span>
        <ChevronRight size={16} className="text-fg-faint" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        <p className="text-2xl font-bold text-fg tabular-nums leading-tight mt-0.5 truncate">
          {value}
          {unit && <span className="text-sm font-medium text-fg-faint">{unit}</span>}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(Math.min(Math.max(pct, 0), 1) * 100)}%`,
            backgroundColor: barColor,
            transition: "width 0.5s ease",
          }}
        />
      </div>
      <p className="text-[11px] text-fg-faint truncate">{sub}</p>
    </motion.button>
  );
}

function Chip({ count, label, active }: { count: number; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full pl-1.5 pr-4 py-1.5 shrink-0 border ${
        active ? "border-transparent" : "border-border-strong bg-surface"
      }`}
      style={active ? { backgroundColor: "rgba(158, 192, 106, 0.22)" } : undefined}
    >
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold tabular-nums ${
          active ? "bg-surface text-fg" : "bg-surface-raised text-fg-muted"
        }`}
      >
        {count}
      </span>
      <span className={`text-sm font-medium ${active ? "text-fg" : "text-fg-muted"}`}>{label}</span>
    </div>
  );
}

export default function HomePage({ onViewAll, onNavigate }: HomePageProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  const habits = useHabitStore((s) => s.habits);
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted);
  const focusScheduleItem = useScheduleFocusStore((s) => s.focusItem);
  const meals = useMealStore((s) => s.meals);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const expenses = useExpenseStore((s) => s.expenses);
  const monthlyBudget = useExpenseStore((s) => s.monthlyBudget);
  const { reading, loading, toggle: toggleRead, tryAutoPlay } = useReadAloud();
  // Morning ritual: highlights the read-my-day row when the browser blocked
  // the automatic playback, inviting the one tap it needs.
  const [briefingPrompt, setBriefingPrompt] = useState(false);

  const today = todayISODate();
  const todayObj = new Date(today + "T00:00:00");

  const items: DayItem[] = [
    ...tasks
      .filter((t) => t.date === today)
      .map<DayItem>((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        startMinutes: t.startMinutes,
        durationMinutes: t.durationMinutes,
        color: t.color,
        icon: t.icon,
        completed: t.completed,
        priority: t.priority,
      })),
    ...habits
      .filter((h) => isHabitActiveOnDate(h, todayObj))
      .map<DayItem>((h) => ({
        id: h.id,
        kind: "habit",
        title: h.title,
        startMinutes: h.startMinutes,
        durationMinutes: h.durationMinutes,
        color: h.color,
        icon: h.icon,
        completed: h.completedDates.includes(today),
      })),
  ].sort((a, b) => a.startMinutes - b.startMinutes);

  // The briefing the button reads: an LLM-written script when the backend can
  // provide one, the local template otherwise. Fetched and voice-prefetched in
  // the background (debounced) so playback starts instantly. The template
  // string doubles as the change signal — it varies exactly when the day does.
  const briefing = assistantDayBriefing(items, "Today");
  const [script, setScript] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      const streaks = habits
        .filter((h) => isHabitActiveOnDate(h, todayObj))
        .map((h) => ({ title: h.title, days: getHabitStreak(h, todayObj) }))
        .filter((s) => s.days >= 3)
        .sort((a, b) => b.days - a.days)
        .slice(0, 3);
      const s = await fetchBriefingScript(
        "today",
        items.map((i) => ({
          title: i.title,
          startMinutes: i.startMinutes,
          durationMinutes: i.durationMinutes,
          completed: i.completed,
          kind: i.kind,
        })),
        streaks
      );
      if (cancelled) return;
      setScript(s);
      prefetchAssistantVoice(s ?? briefing);

      // Morning ritual: on the first open of the day, speak the briefing —
      // or, when the browser blocks gesture-less audio, invite the tap.
      const { morningBriefing, lastMorningBriefingDate, setLastMorningBriefingDate } =
        useSettingsStore.getState();
      if (
        morningBriefing &&
        lastMorningBriefingDate !== today &&
        document.visibilityState === "visible"
      ) {
        setLastMorningBriefingDate(today);
        const played = await tryAutoPlay(s ?? briefing);
        if (!played && !cancelled) setBriefingPrompt(true);
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing]);

  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const inSpan = (i: DayItem) =>
    nowMin >= i.startMinutes && nowMin < i.startMinutes + i.durationMinutes;

  const total = items.length;
  const done = items.filter((i) => i.completed).length;
  const pending = total - done;
  const inProgress = items.filter((i) => !i.completed && inSpan(i)).length;
  const todo = Math.max(0, pending - inProgress);
  const percent = total ? Math.round((done / total) * 100) : 0;

  // Today's discipline rings: tasks, habits, and movement (workout-linked
  // tasks), each filling with today's completion. A pillar with nothing
  // scheduled shows an empty ring and sits out of the "perfect day" count.
  const todayTasks = tasks.filter((t) => t.date === today);
  const workoutTasks = todayTasks.filter((t) => t.workoutSessionId);
  const plainTasks = todayTasks.filter((t) => !t.workoutSessionId);
  const activeHabitsToday = habits.filter((h) => isHabitActiveOnDate(h, todayObj));
  const habitsDoneToday = activeHabitsToday.filter((h) => h.completedDates.includes(today)).length;
  const pillars = [
    {
      label: "Tasks",
      color: RING_TASKS,
      done: plainTasks.filter((t) => t.completed).length,
      total: plainTasks.length,
      rest: "—",
    },
    {
      label: "Habits",
      color: RING_HABITS,
      done: habitsDoneToday,
      total: activeHabitsToday.length,
      rest: "—",
    },
    {
      label: "Movement",
      color: RING_MOVE,
      done: workoutTasks.filter((t) => t.completed).length,
      total: workoutTasks.length,
      rest: "Rest",
    },
  ];
  const ringsApplicable = pillars.filter((p) => p.total > 0).length;
  const ringsClosed = pillars.filter((p) => p.total > 0 && p.done >= p.total).length;
  const perfectDay = ringsApplicable > 0 && ringsClosed === ringsApplicable;

  // Glance: the two domains Home doesn't otherwise surface — today's nutrition
  // and spending — each tapping through to its own page.
  const groceryIndex = useMemo(() => indexItems(groceryItems), [groceryItems]);
  const todayMeals = meals.filter((m) => m.date === today);
  const kcalToday = dayNutrition(todayMeals, groceryIndex).calories;
  const spendToday = expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
  const spendMonth = spendInRange(expenses, monthStartISO(), today).total;

  // Focus: what's happening now, else the next thing, else the highest-priority
  // task still left today.
  const active = items.filter((i) => !i.completed);
  const current = [...active].filter(inSpan).sort((a, b) => b.startMinutes - a.startMinutes)[0];
  const upcoming = [...active]
    .filter((i) => i.startMinutes > nowMin)
    .sort((a, b) => a.startMinutes - b.startMinutes)[0];
  const highPriority = [...active].sort(
    (a, b) =>
      PRIO_RANK[b.priority ?? "medium"] - PRIO_RANK[a.priority ?? "medium"] ||
      a.startMinutes - b.startMinutes
  )[0];
  const focus = current ?? upcoming ?? highPriority ?? null;

  // Jump to the schedule, land on this item's day, and let DaySchedule scroll it
  // into view — rather than opening the edit sheet. Focus items are always
  // today's, so today is the target date.
  function openInSchedule(item: DayItem) {
    setSelectedDate(today);
    focusScheduleItem(item.id);
    onViewAll?.();
  }

  function toggle(item: DayItem) {
    if (item.kind === "task") toggleTaskCompleted(item.id);
    else toggleHabitCompleted(item.id, today);
  }

  const focusLabel = current ? "Happening Now" : upcoming ? "Upcoming Task" : "Up Next";
  const fStart = focus ? fmt12(focus.startMinutes) : null;
  const fEnd = focus ? fmt12(focus.startMinutes + focus.durationMinutes) : null;
  const fPrio = focus?.priority ? PRIORITY_META[focus.priority] : null;
  const FocusIcon = focus ? (ICONS[focus.icon] ?? ICONS.default) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting, with the spoken day summary a compact pill beside it. When
          the morning briefing was blocked by the browser, the pill pulses as
          the invitation to tap. */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl font-bold leading-tight text-fg">
          Everyday
          <br />
          Counts
        </h1>
        <motion.button
          onClick={() => {
            setBriefingPrompt(false);
            toggleRead(script ?? briefing);
          }}
          whileTap={tap}
          animate={briefingPrompt && !reading && !loading ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={
            briefingPrompt && !reading && !loading ? { repeat: Infinity, duration: 1.6 } : undefined
          }
          className={`shrink-0 mt-1 flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium ${
            reading || loading || briefingPrompt
              ? "bg-surface-inverse text-fg-inverse"
              : "bg-surface-alt border border-border-strong text-fg"
          }`}
        >
          {loading ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="flex"
            >
              <Loader2 size={14} />
            </motion.span>
          ) : reading ? (
            <Square size={12} />
          ) : (
            <Volume2 size={15} />
          )}
          {loading ? "Preparing…" : reading ? "Stop" : "Day Summary"}
        </motion.button>
      </div>

      {/* Today's rings — tasks, habits, and movement, each filling with today's
          completion. Close every ring that has something planned for a perfect day. */}
      <div className="rounded-3xl bg-surface-feature text-white p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-gray-300">Today's Progress</p>
          <p className="text-xs font-medium text-gray-400">
            {ringsApplicable === 0
              ? "Nothing planned yet"
              : perfectDay
                ? "Perfect day 🎉"
                : `${ringsClosed}/${ringsApplicable} rings closed`}
          </p>
        </div>
        <div className="flex items-center">
          <ActivityRings
            data={pillars.map((p) => ({
              pct: p.total ? p.done / p.total : 0,
              color: p.color,
              active: p.total > 0,
            }))}
            centerLabel={percent}
            perfect={perfectDay}
          />
          <div className="self-stretch w-px bg-white/10 mx-5" />
          <div className="flex-1 flex flex-col gap-3.5">
            {pillars.map((p) => (
              <RingStat key={p.label} {...p} />
            ))}
          </div>
        </div>
      </div>

      {/* Glance — today's nutrition and spending, tapping through to their pages. */}
      <div className="grid grid-cols-2 gap-3">
        <GlanceTile
          icon={UtensilsCrossed}
          color={RING_TASKS}
          label="Meals"
          value={kcalToday.toLocaleString()}
          unit=" kcal"
          sub={
            todayMeals.length
              ? `${todayMeals.length} logged · goal ${CALORIE_GOAL.toLocaleString()}`
              : "Nothing logged yet"
          }
          pct={kcalToday / CALORIE_GOAL}
          barColor={kcalToday > CALORIE_GOAL ? "#f87171" : RING_TASKS}
          onClick={() => onNavigate?.("meals")}
        />
        <GlanceTile
          icon={Wallet}
          color={RING_HABITS}
          label="Spent today"
          value={money(spendToday)}
          sub={`${money(spendMonth)} of ${money(monthlyBudget)} this month`}
          pct={spendMonth / (monthlyBudget || 1)}
          barColor={spendMonth > monthlyBudget ? "#f87171" : RING_HABITS}
          onClick={() => onNavigate?.("expenses")}
        />
      </div>

      {/* Today's tasks */}
      <div>
        <div className="flex items-baseline justify-between px-1 mb-3">
          <h2 className="text-lg font-bold text-fg">Today's Tasks</h2>
          {onViewAll && (
            <button
              onClick={() => {
                setSelectedDate(today);
                onViewAll();
              }}
              className="text-sm font-medium text-fg-muted"
            >
              View All
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
          <Chip count={todo} label="To Do" active />
          <Chip count={inProgress} label="In Progress" />
          <Chip count={done} label="Done" />
        </div>

        {focus && fStart && fEnd ? (
          <>
            <h3 className="text-sm font-semibold text-fg-muted px-1 mb-2">{focusLabel}</h3>
            <motion.button
              onClick={() => openInSchedule(focus)}
              whileTap={press}
              className="w-full text-left bg-surface-alt border border-border-strong rounded-3xl shadow-soft p-5"
            >
              <div className="flex items-start justify-between">
                {fPrio ? (
                  <span
                    className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1"
                    style={{ color: fPrio.color, backgroundColor: `${fPrio.color}1f` }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: fPrio.color }}
                    />
                    {fPrio.label} Priority
                  </span>
                ) : (
                  <span />
                )}
                <ArrowUpRight size={18} className="text-fg-faint shrink-0" />
              </div>

              <div className="flex items-center gap-2.5 mt-3">
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${focus.color}1f` }}
                >
                  {FocusIcon && <FocusIcon size={18} style={{ color: focus.color }} />}
                </span>
                <p className="text-xl font-bold text-fg leading-snug min-w-0 truncate">
                  {focus.title}
                </p>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5 text-sm text-fg-faint">
                  <Clock size={15} />
                  {fStart.time} – {fEnd.time} {fEnd.period}
                </div>
                <motion.span
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggle(focus);
                  }}
                  whileTap={tap}
                  className="w-8 h-8 rounded-full border-2 shrink-0"
                  style={{ borderColor: focus.color }}
                />
              </div>
            </motion.button>
          </>
        ) : (
          <div className="rounded-3xl bg-surface-alt border border-border-strong shadow-soft p-6 text-center">
            <p className="font-medium text-fg">
              {total === 0 ? "Nothing scheduled today" : "All done for today"}
            </p>
            <p className="text-sm text-fg-faint mt-1">
              {total === 0
                ? "Add tasks from the Calendar tab."
                : "Nice work — you're all caught up."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
