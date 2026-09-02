import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Flame, Lightbulb, Loader2, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import Collapse from "@/components/Collapse";
import { Heatmap, MonthBars } from "@/components/profile/ProfileCharts";
import { primeAudioChannel, speakAssistant, stopSpeaking, wordTokens } from "@/hooks/useSpeech";
import { addDays, todayISODate, toISODate } from "@/lib/date";
import { ICONS } from "@/lib/icons";
import {
  consistencyByPeriod,
  dayScore,
  habitConsistencyByPeriod,
  habitMonthlyCompletion,
  habitStats,
  heatmapWeeks,
  lastPeriods,
  summarizeConsistency,
  summarizeHabits,
  weekdayBreakdown,
  type ComparePeriod,
  type PeriodRange,
} from "@/lib/insights";
import { spring, tap } from "@/lib/motion";
import { useHabitStore } from "@/store/habitStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";

export type ProfileDetailKind = "consistency" | "habits";

// How many bars to show per granularity — enough to actually compare against
// each other without the chart turning into a wall of slivers.
const PERIOD_COUNTS: Record<ComparePeriod, number> = { week: 8, month: 6, year: 5 };
const PERIODS: { key: ComparePeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const TITLES: Record<ProfileDetailKind, string> = {
  consistency: "Consistency",
  habits: "Habit Streaks",
};

// Week/Month/Year switcher for the comparison chart — the same segmented
// control pattern as the Goals page.
function PeriodToggle({
  value,
  onChange,
}: {
  value: ComparePeriod;
  onChange: (p: ComparePeriod) => void;
}) {
  return (
    <div className="flex items-center bg-surface-toggle-track rounded-full p-1 mb-4 overflow-hidden">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className="relative flex-1 h-9 rounded-full text-sm font-medium"
        >
          {value === p.key && (
            <motion.span
              layoutId="profileDetailPeriod"
              transition={spring.snappy}
              className="absolute inset-0 bg-surface rounded-full shadow-sm"
            />
          )}
          <span className={`relative z-10 ${value === p.key ? "text-fg" : "text-fg-muted"}`}>
            {p.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// The highlighted "here's what's going on" box at the top of every detail —
// a short, locally-composed analysis (arithmetic phrased as prose, not an LLM
// call) of the period-over-period numbers below it. Collapsed by default;
// tapping the lightbulb expands it and reads it aloud (Gemini voice via
// speakAssistant), lighting up the bulb and highlighting each word as it's
// spoken. State is kept local to this instance rather than the app's global
// read-aloud store, so this doesn't fight over play/stop with unrelated
// speech elsewhere in the app.
function Analysis({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "reading">("idle");
  // Separate from `status`: once opened, the text stays visible even after
  // reading finishes or is stopped — only a new `text` (period switch) closes
  // it back up, since the old reading no longer matches what's on screen.
  const [expanded, setExpanded] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const activeRef = useRef(false); // true while THIS instance owns the current speech
  const expandedRef = useRef(false); // mirrors `expanded`, read-only inside the effect below
  const words = useMemo(() => wordTokens(text).map((t) => t.word), [text]);

  useEffect(() => {
    if (activeRef.current) {
      stopSpeaking();
      activeRef.current = false;
    }
    if (expandedRef.current) {
      expandedRef.current = false;
      setStatus("idle");
      setExpanded(false);
      setActiveWord(-1);
    }
  }, [text]);

  useEffect(() => {
    return () => {
      if (activeRef.current) stopSpeaking();
    };
  }, []);

  function handleTap() {
    if (status !== "idle") {
      // Stop, but leave the box open and the words read so far still colored.
      stopSpeaking();
      activeRef.current = false;
      setStatus("idle");
      return;
    }
    if (!useSettingsStore.getState().voiceEnabled) return;
    // Unlock the audio channel synchronously in the tap handler — the actual
    // playback starts later, after an async fetch, outside the gesture window
    // mobile browsers otherwise require.
    primeAudioChannel();
    activeRef.current = true;
    expandedRef.current = true;
    setExpanded(true);
    setActiveWord(-1);
    setStatus("loading");
    void speakAssistant(text, {
      onStart: () => setStatus("reading"),
      onWord: setActiveWord,
      onDone: () => {
        activeRef.current = false;
        setStatus("idle");
        setActiveWord(words.length - 1); // finished — leave the whole line colored
      },
    });
  }

  return (
    <div className="rounded-2xl bg-surface-alt border border-border-strong p-4">
      <div className="flex items-start gap-3">
        <motion.button
          whileTap={tap}
          onClick={handleTap}
          aria-label={
            status === "idle"
              ? "Read analysis aloud"
              : status === "loading"
                ? "Preparing voice"
                : "Stop reading"
          }
          className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0 mt-0.5"
        >
          {status === "loading" ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="flex"
            >
              <Loader2 size={15} className="text-fg-muted" />
            </motion.span>
          ) : (
            <Lightbulb
              size={15}
              className={status === "reading" ? "text-amber-400" : "text-fg-muted"}
              fill={status === "reading" ? "currentColor" : "none"}
            />
          )}
        </motion.button>

        <div className="flex-1 min-w-0">
          {!expanded && (
            <button onClick={handleTap} className="text-sm text-fg-muted text-left pt-1.5 w-full">
              Tap to hear the analysis
            </button>
          )}
          <Collapse open={expanded}>
            <p className="text-sm text-fg leading-relaxed">
              {words.map((w, i) => (
                <span key={i} className={i <= activeWord ? "text-amber-400" : undefined}>
                  {w}
                  {i < words.length - 1 ? " " : ""}
                </span>
              ))}
            </p>
            <p className="text-xs text-fg-faint pt-2">
              {status === "loading"
                ? "Preparing voice…"
                : status === "reading"
                  ? "🔊 Reading aloud — tap to stop"
                  : "Tap the bulb to read it again"}
            </p>
          </Collapse>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ProfileDetailSheet({
  kind,
  onClose,
}: {
  kind: ProfileDetailKind | null;
  onClose: () => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);

  const todayObj = useMemo(() => new Date(), []);

  // Chart granularity — shared across whichever card's sheet is open.
  const [period, setPeriod] = useState<ComparePeriod>("month");
  const count = PERIOD_COUNTS[period];

  // Consistency
  const heat = useMemo(() => heatmapWeeks(52, tasks, habits), [tasks, habits]);
  const consistencyPoints = useMemo(
    () => consistencyByPeriod(period, count, tasks, habits, todayObj),
    [period, count, tasks, habits, todayObj]
  );
  const weekdays = useMemo(
    () => weekdayBreakdown(90, tasks, habits, todayObj),
    [tasks, habits, todayObj]
  );
  const bestWeekday = weekdays.reduce(
    (a, b) => (b.total > 0 && b.pct > a.pct ? b : a),
    weekdays[0]
  );
  const worstWeekday = weekdays
    .filter((w) => w.total > 0)
    .reduce((a, b) => (b.pct < a.pct ? b : a), weekdays.find((w) => w.total > 0) ?? weekdays[0]);

  // Week drill-down: which specific week (Mon..Sun) is expanded below the
  // "Last N weeks" chart when period === "week". Index into weekRanges/
  // consistencyPoints, which share the same ordering there. Persists across
  // switching away from and back to Week — jumping back to whatever you were
  // last looking at is more useful than always snapping to the current week.
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);
  const weekRanges = useMemo(() => lastPeriods("week", PERIOD_COUNTS.week, todayObj), [todayObj]);
  const effectiveWeekIdx = Math.min(
    selectedWeekIdx ?? weekRanges.length - 1,
    weekRanges.length - 1
  );
  const selectedWeek = weekRanges[effectiveWeekIdx];
  // One entry per Mon..Sun of that week; null for days after today (they
  // haven't happened, so there's nothing to show — not a 0% failure).
  const weekDayScores = useMemo(() => {
    const monday = new Date(selectedWeek.start + "T00:00:00");
    const todayISO = todayISODate();
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const iso = toISODate(d);
      return iso > todayISO ? null : dayScore(iso, tasks, habits);
    });
  }, [selectedWeek, tasks, habits]);

  // Habits
  const habitRows = useMemo(() => habitStats(habits, todayObj), [habits, todayObj]);
  const habitPoints = useMemo(
    () => habitConsistencyByPeriod(period, count, habits, todayObj),
    [period, count, habits, todayObj]
  );

  if (!kind) return null;

  return (
    <BottomSheet
      isOpen={!!kind}
      onClose={onClose}
      className="bg-surface-alt max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-5 pb-4">
        <h2 className="text-xl font-bold text-fg">{TITLES[kind]}</h2>
        <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
          <X size={22} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <PeriodToggle value={period} onChange={setPeriod} />

        {kind === "consistency" && (
          <>
            <Analysis text={summarizeConsistency(consistencyPoints, period)} />
            <div className="h-4" />
            <Section title={`Last ${count} ${period}s`}>
              <div className="rounded-3xl bg-surface p-5 shadow-card">
                <MonthBars
                  points={consistencyPoints}
                  value={(p) => p.pct}
                  format={(v) => `${v}%`}
                  selectedIndex={period === "week" ? effectiveWeekIdx : undefined}
                  onSelect={period === "week" ? setSelectedWeekIdx : undefined}
                />
                {period === "week" && (
                  <p className="text-[11px] text-fg-faint text-center mt-4 pt-3 border-t border-border">
                    Tap a bar to see that week's days
                  </p>
                )}
              </div>
            </Section>

            {period === "week" && (
              <Section title="Week detail">
                <div className="rounded-3xl bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between mb-5">
                    <motion.button
                      onClick={() => setSelectedWeekIdx(Math.max(0, effectiveWeekIdx - 1))}
                      whileTap={tap}
                      disabled={effectiveWeekIdx === 0}
                      aria-label="Previous week"
                      className="p-1.5 -m-1.5 text-fg-muted disabled:opacity-30"
                    >
                      <ChevronLeft size={18} />
                    </motion.button>
                    <p className="text-sm font-semibold text-fg">{weekRangeLabel(selectedWeek)}</p>
                    <motion.button
                      onClick={() =>
                        setSelectedWeekIdx(Math.min(weekRanges.length - 1, effectiveWeekIdx + 1))
                      }
                      whileTap={tap}
                      disabled={effectiveWeekIdx === weekRanges.length - 1}
                      aria-label="Next week"
                      className="p-1.5 -m-1.5 text-fg-muted disabled:opacity-30"
                    >
                      <ChevronRight size={18} />
                    </motion.button>
                  </div>
                  <div className="flex gap-2">
                    {weekDayScores.map((d, i) => {
                      const date = addDays(new Date(selectedWeek.start + "T00:00:00"), i);
                      const hasData = d !== null && d.total > 0;
                      const pct = hasData ? (d.score ?? 0) * 100 : 0;
                      const r = 15;
                      const circumference = 2 * Math.PI * r;
                      const offset = circumference * (1 - pct / 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                          <p className="text-[10px] font-medium text-fg-faint">
                            {WEEKDAY_LABELS[date.getDay()]}
                          </p>
                          <svg width={36} height={36} viewBox="0 0 36 36" className="shrink-0">
                            {hasData && <title>{`${d.done}/${d.total}`}</title>}
                            <circle
                              cx={18}
                              cy={18}
                              r={r}
                              fill="none"
                              stroke="var(--surface-subtle)"
                              strokeWidth={4}
                            />
                            {hasData && (
                              <circle
                                cx={18}
                                cy={18}
                                r={r}
                                fill="none"
                                stroke="#9ec06a"
                                strokeWidth={4}
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                transform="rotate(-90 18 18)"
                                style={{ transition: "stroke-dashoffset 0.4s ease" }}
                              />
                            )}
                          </svg>
                          <p className="text-[11px] font-semibold text-fg tabular-nums">
                            {date.getDate()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
            )}

            {period === "year" && (
              <Section title="Full year">
                <div className="rounded-2xl bg-surface p-4">
                  <Heatmap weeks={heat} />
                  <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-fg-faint">
                    <span>Less</span>
                    {[0.15, 0.4, 0.6, 0.8, 1].map((a) => (
                      <span
                        key={a}
                        className="w-[11px] h-[11px] rounded-[3px]"
                        style={{ backgroundColor: `rgba(158,192,106,${a})` }}
                      />
                    ))}
                    <span>More</span>
                  </div>
                </div>
              </Section>
            )}
            {period === "week" && (
              <Section title="By day of week (last 90 days)">
                <div className="rounded-2xl bg-surface p-4">
                  <div className="flex items-end gap-2 h-20">
                    {weekdays.map((w) => (
                      <div
                        key={w.day}
                        className="flex-1 flex flex-col items-center justify-end gap-1"
                      >
                        <div className="w-full h-14 rounded-md bg-surface-subtle flex items-end overflow-hidden">
                          <div
                            className="w-full rounded-md"
                            style={{
                              height: w.total ? `${Math.max(w.pct, 6)}%` : 0,
                              backgroundColor:
                                w.total === 0
                                  ? "transparent"
                                  : w.day === bestWeekday.day
                                    ? "#9ec06a"
                                    : "#9ec06a88",
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-fg-faint">{WEEKDAY_LABELS[w.day]}</p>
                      </div>
                    ))}
                  </div>
                  {bestWeekday.total > 0 && (
                    <p className="text-xs text-fg-muted mt-3">
                      Best: <span className="text-fg font-medium">{dayName(bestWeekday.day)}</span>{" "}
                      ({bestWeekday.pct}%) · Toughest:{" "}
                      <span className="text-fg font-medium">{dayName(worstWeekday.day)}</span> (
                      {worstWeekday.pct}%)
                    </p>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        {kind === "habits" && (
          <>
            <Analysis text={summarizeHabits(habitRows, habitPoints, period)} />
            <div className="h-4" />
            <Section title={`Overall completion, last ${count} ${period}s`}>
              <div className="rounded-2xl bg-surface p-4">
                <MonthBars points={habitPoints} value={(p) => p.pct} format={(v) => `${v}%`} />
              </div>
            </Section>
            <Section title="Every habit">
              <div className="rounded-2xl bg-surface p-2">
                {habitRows.length === 0 ? (
                  <p className="text-sm text-fg-faint p-3">No habits yet.</p>
                ) : (
                  habitRows.map(({ habit, current, longest, rate7 }) => {
                    const Icon = ICONS[habit.icon] ?? ICONS.default;
                    const [prevM, curM] = habitMonthlyCompletion(habit, 2, todayObj);
                    return (
                      <div
                        key={habit.id}
                        className="flex items-center gap-3 px-2.5 py-3 border-b border-border last:border-0"
                      >
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${habit.color}22`, color: habit.color }}
                        >
                          <Icon size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-fg truncate">{habit.title}</p>
                          <p className="text-[11px] text-fg-faint">
                            {prevM.total > 0 && `${prevM.label} ${prevM.pct}% → `}
                            {curM.label} {curM.pct}%<span className="mx-1">·</span>
                            last 7: {Math.round(rate7 * 100)}%
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="flex items-center gap-1 text-sm font-bold text-fg tabular-nums justify-end">
                            <Flame size={13} className="text-orange-400" />
                            {current}
                          </p>
                          <p className="text-[11px] text-fg-faint">best {longest}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function dayName(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

// "Jul 14 – Jul 20" — the full Mon..Sun span, even for the current
// (still-in-progress) week, so it's clear which week you're looking at
// regardless of how much of it has actually happened yet.
function weekRangeLabel(week: PeriodRange): string {
  const monday = new Date(week.start + "T00:00:00");
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}
