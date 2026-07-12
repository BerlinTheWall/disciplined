import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Square,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useNow } from "@/hooks/useNow";
import { useReadAloud } from "@/hooks/useReadAloud";
import { prefetchAssistantVoice } from "@/hooks/useSpeech";
import { assistantDayBriefing } from "@/lib/assistantSpeech";
import { fetchBriefingScript } from "@/lib/briefing";
import { todayISODate } from "@/lib/date";
import { getHabitStreak, isHabitActiveOnDate } from "@/lib/habits";
import { ICONS } from "@/lib/icons";
import { press, tap } from "@/lib/motion";
import { PRIORITY_META } from "@/lib/priority";
import { useHabitStore } from "@/store/habitStore";
import { useScheduleFocusStore } from "@/store/scheduleFocusStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { Priority } from "@/types/task";

interface HomePageProps {
  onViewAll?: () => void;
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
const RING = "#9ec06a"; // soft green progress

function fmt12(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return {
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`,
    period: h < 12 ? "AM" : "PM",
  };
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - percent / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RING}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-white tabular-nums">
          {percent}
          <span className="text-xs align-top">%</span>
        </span>
      </div>
    </div>
  );
}

function ProgStat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-gray-300 shrink-0">
        <Icon size={15} />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-bold text-white tabular-nums">{value}</p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    </div>
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

export default function HomePage({ onViewAll }: HomePageProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTaskCompleted = useTaskStore((s) => s.toggleTaskCompleted);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  const habits = useHabitStore((s) => s.habits);
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted);
  const focusScheduleItem = useScheduleFocusStore((s) => s.focusItem);
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

  const fStart = focus ? fmt12(focus.startMinutes) : null;
  const fEnd = focus ? fmt12(focus.startMinutes + focus.durationMinutes) : null;
  const fPrio = focus?.priority ? PRIORITY_META[focus.priority] : null;
  const FocusIcon = focus ? (ICONS[focus.icon] ?? ICONS.default) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <h1 className="text-3xl font-bold leading-tight text-fg">
        Everyday
        <br />
        Counts
      </h1>

      {/* Today's progress */}
      <div className="rounded-3xl bg-surface-feature text-white p-5 shadow-card">
        <p className="text-sm font-medium text-gray-300 mb-4">Today's Progress</p>
        <div className="flex items-center">
          <ProgressRing percent={percent} />
          <div className="self-stretch w-px bg-white/10 mx-5" />
          <div className="flex-1 flex flex-col gap-3.5">
            <ProgStat icon={ClipboardList} value={total} label="Total Task" />
            <ProgStat icon={CheckCircle2} value={done} label="Completed Task" />
            <ProgStat icon={Clock} value={pending} label="Pending Task" />
          </div>
        </div>
      </div>

      {/* Today's tasks */}
      <div>
        <div className="flex items-baseline justify-between px-1 mb-3">
          <h2 className="text-lg font-bold text-fg">Today's Tasks</h2>
          {onViewAll && (
            <button onClick={onViewAll} className="text-sm font-medium text-fg-muted">
              View All
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
          <Chip count={todo} label="To Do" active />
          <Chip count={inProgress} label="In Progress" />
          <Chip count={done} label="Done" />
        </div>

        {/* Hear the whole day, assistant-style, before diving into what's next.
            When the morning briefing was blocked by the browser, this row
            becomes the invitation to tap. */}
        <motion.button
          onClick={() => {
            setBriefingPrompt(false);
            toggleRead(script ?? briefing);
          }}
          whileTap={tap}
          animate={briefingPrompt && !reading ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={briefingPrompt && !reading ? { repeat: Infinity, duration: 1.6 } : undefined}
          className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 mb-4 text-left ${
            reading || loading || briefingPrompt
              ? "bg-surface-inverse"
              : "bg-surface-alt border border-border-strong"
          }`}
        >
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              reading || loading || briefingPrompt
                ? "bg-white/15 text-fg-inverse"
                : "bg-surface-raised text-fg-muted"
            }`}
          >
            {loading ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="flex"
              >
                <Loader2 size={16} />
              </motion.span>
            ) : reading ? (
              <Square size={14} />
            ) : (
              <Volume2 size={17} />
            )}
          </span>
          <span
            className={`font-medium ${
              reading || loading || briefingPrompt ? "text-fg-inverse" : "text-fg"
            }`}
          >
            {loading
              ? "Preparing your briefing…"
              : reading
                ? "Stop reading"
                : briefingPrompt
                  ? "Your morning briefing is ready — tap to listen"
                  : "Read my day"}
          </span>
        </motion.button>

        {focus && fStart && fEnd ? (
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
