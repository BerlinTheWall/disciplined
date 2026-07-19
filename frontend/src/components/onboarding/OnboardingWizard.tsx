import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Flame, Mic, Sun } from "lucide-react";

import logo from "@/assets/logo.svg";
import { COLOR_OPTIONS, DURATION_OPTIONS } from "@/components/timeline/addItemOptions";
import TimeWheel from "@/components/timeline/TimeWheel";
import { isLightColor } from "@/lib/color";
import { todayISODate } from "@/lib/date";
import { guessIcon, ICONS, type IconKey } from "@/lib/icons";
import { spring, tap } from "@/lib/motion";
import { formatTimeLabel, rangeLabel, timeStringToMinutes } from "@/lib/time";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useTaskStore } from "@/store/taskStore";
import { useThemeStore } from "@/store/themeStore";
import { useTutorialStore } from "@/store/tutorialStore";

// First-launch setup, in the spirit of the app's design reference: a progress
// bar, one question per screen, a task preview card that fills in as you
// answer, and a closing summary that creates the real plan (wake-up, the
// first task, wind-down) on today's timeline.

const ROSE = "#fb7185";
const BLUE = "#60a5fa";
const AMBER = "#fbbf24";
const VIOLET = "#a78bfa";

const WAKE_COLOR = AMBER;
const WIND_COLOR = VIOLET;

const SUGGESTIONS = ["Answer emails", "Eat lunch", "Go for a walk", "Clean up", "Read", "Workout"];

// Steps: 0 welcome · 1 value props · 2 wake · 3 task title · 4 task time ·
// 5 duration · 6 color · 7 bed · 8 summary
const STEP_COUNT = 9;
// Accent color per step (drives the highlighted title word, progress bar and
// primary button — alternating like the reference app).
const ACCENTS = [ROSE, ROSE, AMBER, ROSE, ROSE, ROSE, BLUE, VIOLET, BLUE];

const stepVariants = {
  enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
};

function taskIcon(title: string): IconKey {
  return guessIcon(title) ?? "default";
}

// The little plan card that accumulates the task being built.
function PlanRow({
  icon,
  color,
  title,
  startMinutes,
  durationMinutes,
  done,
  accent,
}: {
  icon: IconKey;
  color: string;
  title: string;
  startMinutes?: number;
  durationMinutes?: number;
  done?: boolean;
  accent: string;
}) {
  const Icon = ICONS[icon] ?? ICONS.default;
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-3 py-3 bg-surface-alt"
      style={{ borderColor: `${accent}55` }}
    >
      <span
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: color, color: isLightColor(color) ? "#111827" : "#fff" }}
      >
        <Icon size={19} />
      </span>
      <div className="flex-1 min-w-0">
        {startMinutes !== undefined && (
          <p className="text-xs text-fg-faint tabular-nums">
            {durationMinutes
              ? `${rangeLabel(startMinutes, durationMinutes)} (${durationMinutes} mins)`
              : formatTimeLabel(startMinutes)}
          </p>
        )}
        <p className={`font-semibold truncate ${done ? "line-through text-fg-faint" : "text-fg"}`}>
          {title}
        </p>
      </div>
      <span
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
          done ? "text-fg-inverse" : "border-border-strong text-transparent"
        }`}
        style={done ? { backgroundColor: accent, borderColor: accent } : undefined}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    </div>
  );
}

export default function OnboardingWizard() {
  const finishOnboarding = useOnboardingStore((s) => s.finish);
  const theme = useThemeStore((s) => s.theme);

  const [[step, dir], setStep] = useState<[number, number]>([0, 1]);
  const [wakeTime, setWakeTime] = useState("08:00");
  const [title, setTitle] = useState("");
  const [taskTime, setTaskTime] = useState("11:00");
  const [duration, setDuration] = useState(15);
  const [color, setColor] = useState(BLUE);
  const [bedTime, setBedTime] = useState("22:00");

  const accent = ACCENTS[step];
  const wakeMin = timeStringToMinutes(wakeTime);
  const taskMin = timeStringToMinutes(taskTime);
  const bedMin = timeStringToMinutes(bedTime);

  const go = (next: number) => setStep(([cur]) => [next, next >= cur ? 1 : -1]);
  const canContinue = step !== 3 || title.trim().length > 0;

  // Done either way — the spotlight tour is superseded (still replayable from
  // Settings), so a new user sees exactly one guided flow.
  function close() {
    useTutorialStore.getState().finish();
    finishOnboarding();
  }

  function finishSetup() {
    const add = useTaskStore.getState().addTask;
    const date = todayISODate();
    add({
      title: "Wake up",
      startMinutes: wakeMin,
      durationMinutes: 15,
      color: WAKE_COLOR,
      icon: taskIcon("wake up alarm"),
      date,
    });
    add({
      title: title.trim(),
      startMinutes: taskMin,
      durationMinutes: duration,
      color,
      icon: taskIcon(title),
      date,
    });
    add({
      title: "Wind down",
      startMinutes: bedMin,
      durationMinutes: 15,
      color: WIND_COLOR,
      icon: taskIcon("sleep"),
      date,
    });
    close();
  }

  const plannedRows = [
    {
      key: "wake",
      icon: taskIcon("wake up alarm"),
      color: WAKE_COLOR,
      title: "Wake up",
      startMinutes: wakeMin,
      done: true,
    },
    {
      key: "task",
      icon: taskIcon(title),
      color,
      title: title.trim(),
      startMinutes: taskMin,
      durationMinutes: duration,
    },
    {
      key: "bed",
      icon: taskIcon("sleep"),
      color: WIND_COLOR,
      title: "Wind down",
      startMinutes: bedMin,
    },
  ].sort((a, b) => a.startMinutes - b.startMinutes);

  // The in-progress task card shown on the build steps.
  const preview = (withTime: boolean, withDuration: boolean) =>
    title.trim() ? (
      <div className="mb-6">
        <PlanRow
          icon={taskIcon(title)}
          color={step >= 6 ? color : accent}
          title={title.trim()}
          startMinutes={withTime ? taskMin : undefined}
          durationMinutes={withDuration ? duration : undefined}
          done
          accent={accent}
        />
      </div>
    ) : null;

  const heading = (plain: string, highlighted: string, tail = "?") => (
    <h1 className="text-4xl font-extrabold text-fg leading-tight mb-3">
      {plain} <span style={{ color: accent }}>{highlighted}</span>
      {tail}
    </h1>
  );

  const primaryButton = (label: string, onClick: () => void, disabled = false) => (
    <motion.button
      onClick={onClick}
      whileTap={tap}
      disabled={disabled}
      className="w-full h-14 rounded-full text-lg font-semibold disabled:opacity-40"
      style={{ backgroundColor: accent, color: isLightColor(accent) ? "#111827" : "#fff" }}
    >
      {label}
    </motion.button>
  );

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col overflow-hidden"
      style={{
        background:
          theme === "dark"
            ? `radial-gradient(80% 55% at 50% -10%, ${accent}2e, transparent 70%), var(--surface)`
            : `radial-gradient(80% 55% at 50% -10%, ${accent}26, transparent 70%), var(--surface)`,
      }}
    >
      {/* Top bar: back · progress · skip */}
      <div
        className="flex items-center gap-4 px-5 pb-2"
        style={{ paddingTop: "calc(16px + env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => go(Math.max(0, step - 1))}
          aria-label="Back"
          className={`p-1 -m-1 text-fg-muted ${step === 0 ? "invisible" : ""}`}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 h-2 rounded-full bg-surface-subtle overflow-hidden">
          <motion.div
            animate={{ width: `${((step + 1) / STEP_COUNT) * 100}%`, backgroundColor: accent }}
            transition={spring.gentle}
            className="h-full rounded-full"
          />
        </div>
        <button onClick={close} className="text-base font-medium text-fg-muted">
          Skip
        </button>
      </div>

      {/* Step content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.gentle}
            className="absolute inset-0 flex flex-col px-6 pt-6 overflow-y-auto"
          >
            {step === 0 && (
              <>
                {heading("Welcome to", "Disciplined", "")}
                <p className="text-lg text-fg-muted">
                  Your day, your habits, your goals — one calm place. Let's plan your first day.
                </p>
                <div className="flex-1 flex items-center justify-center">
                  <motion.img
                    src={logo}
                    alt=""
                    className={`w-36 h-36 object-contain ${theme === "light" ? "brightness-0" : ""}`}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                {heading("Disciplined", "helps you…", "")}
                <div className="flex-1 flex flex-col justify-center gap-5">
                  {[
                    { icon: Sun, color: ROSE, text: "plan your day on a clear timeline" },
                    { icon: Flame, color: AMBER, text: "build habits and hit weekly goals" },
                    { icon: Mic, color: BLUE, text: "talk to it — briefings and voice control" },
                  ].map(({ icon: Icon, color: c, text }) => (
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={spring.gentle}
                      className="flex items-center gap-4 rounded-2xl bg-surface-alt px-4 py-4"
                    >
                      <span
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${c}33`, color: c }}
                      >
                        <Icon size={20} />
                      </span>
                      <p className="text-[15px] font-medium text-fg">{text}</p>
                    </motion.div>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {heading("When did you", "wake up")}
                <p className="text-fg-muted mb-8">Your day starts here.</p>
                <div className="flex-1 flex items-center">
                  <div className="w-full">
                    <TimeWheel
                      value={wakeTime}
                      durationMinutes={15}
                      color={accent}
                      onChange={setWakeTime}
                      visibleRows={5}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                {heading("What's up", "next")}
                <p className="text-fg-muted mb-6">Enter something you want to do today.</p>
                {preview(false, false)}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Create a task"
                  className="w-full bg-surface-alt rounded-2xl px-4 py-4 text-lg text-fg placeholder-fg-faint focus:outline-none mb-6"
                />
                <p className="text-sm text-fg-faint mb-3">Here are some suggestions:</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {SUGGESTIONS.map((s) => {
                    const Icon = ICONS[taskIcon(s)] ?? ICONS.default;
                    return (
                      <motion.button
                        key={s}
                        onClick={() => setTitle(s)}
                        whileTap={tap}
                        className="flex items-center gap-2.5 rounded-xl bg-surface-alt px-3.5 py-3 text-left"
                      >
                        <Icon size={17} style={{ color: accent }} />
                        <span className="text-sm font-medium text-fg truncate">{s}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                {heading("At what", "time")}
                <p className="text-fg-muted mb-6">Choose a start time for your task.</p>
                {preview(true, false)}
                <div className="flex-1 flex items-center">
                  <div className="w-full">
                    <TimeWheel
                      value={taskTime}
                      durationMinutes={duration}
                      color={accent}
                      onChange={setTaskTime}
                      visibleRows={5}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                {heading("How", "long")}
                <p className="text-fg-muted mb-6">Set a duration for your task.</p>
                {preview(true, true)}
                <div className="flex-1 flex items-center">
                  <div className="w-full flex items-center bg-surface-alt rounded-full p-1.5">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className="relative flex-1 h-11 rounded-full text-sm font-semibold"
                      >
                        {duration === d && (
                          <motion.span
                            layoutId="onbDuration"
                            transition={spring.snappy}
                            className="absolute inset-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                        )}
                        <span
                          className="relative z-10"
                          style={{
                            color:
                              duration === d
                                ? isLightColor(accent)
                                  ? "#111827"
                                  : "#fff"
                                : "var(--fg-muted)",
                          }}
                        >
                          {d < 60 ? `${d}min` : `${d / 60}h`.replace(".5", ".5")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 6 && (
              <>
                {heading("What", "color")}
                <p className="text-fg-muted mb-6">Pick a color for your task.</p>
                {preview(true, true)}
                <div className="flex-1 flex items-center">
                  <div className="w-full flex items-center justify-between bg-surface-alt rounded-full px-4 py-3.5">
                    {COLOR_OPTIONS.slice(0, 7).map((c) => (
                      <motion.button
                        key={c}
                        onClick={() => setColor(c)}
                        whileTap={tap}
                        aria-label={`Color ${c}`}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={
                          color === c
                            ? { boxShadow: `0 0 0 2.5px var(--surface), 0 0 0 5px ${c}` }
                            : undefined
                        }
                      >
                        <span
                          className="w-full h-full rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 7 && (
              <>
                {heading("When will you", "go to bed")}
                <p className="text-fg-muted mb-8">
                  A clear sleep goal helps regulate your body's internal clock.
                </p>
                <div className="flex-1 flex items-center">
                  <div className="w-full">
                    <TimeWheel
                      value={bedTime}
                      durationMinutes={15}
                      color={accent}
                      onChange={setBedTime}
                      visibleRows={5}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 8 && (
              <>
                <h1 className="text-4xl font-extrabold leading-tight mb-3">
                  <span style={{ color: accent }}>Awesome!</span>{" "}
                  <span className="text-fg">That's a great plan.</span>
                </h1>
                <p className="text-fg-muted mb-8">You're all set — time to make it happen.</p>
                <p className="text-sm font-semibold text-fg-muted mb-3">Your plan for today:</p>
                <div className="flex flex-col gap-2.5">
                  {plannedRows.map(({ key, ...r }) => (
                    <PlanRow key={key} {...r} accent={accent} />
                  ))}
                </div>
              </>
            )}

            <div className="h-6 shrink-0" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action */}
      <div className="px-6" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        {step === 0 && (
          <div className="flex justify-end">
            <motion.button
              onClick={() => go(1)}
              whileTap={tap}
              aria-label="Next"
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: accent, color: "#fff" }}
            >
              <ArrowRight size={24} />
            </motion.button>
          </div>
        )}
        {step === 1 && primaryButton("Start planning", () => go(2))}
        {step >= 2 && step <= 7 && primaryButton("Continue", () => go(step + 1), !canContinue)}
        {step === 8 && primaryButton("Finish Setup", finishSetup)}
      </div>
    </div>
  );
}
