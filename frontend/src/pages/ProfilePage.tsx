import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Flame,
  LoaderCircle,
  LogOut,
  Pencil,
  ShieldOff,
  Trash2,
} from "lucide-react";

import Collapse from "@/components/Collapse";
import { useConfirm, usePrompt } from "@/components/ConfirmDialog";
import { Heatmap, Ring } from "@/components/profile/ProfileCharts";
import ProfileDetailSheet, {
  type ProfileDetailKind,
} from "@/components/profile/ProfileDetailSheet";
import { ApiError } from "@/lib/api";
import { addDays } from "@/lib/date";
import { ICONS } from "@/lib/icons";
import {
  consistencyByPeriod,
  habitStats,
  heatmapWeeks,
  recentScores,
  type DayScore,
} from "@/lib/insights";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";
import { useHabitStore } from "@/store/habitStore";
import { useProfileStore } from "@/store/profileStore";
import { useTaskStore } from "@/store/taskStore";
import { useToastStore } from "@/store/toastStore";

const ACCENT = "#9ec06a"; // the app's soft-green progress accent

// Aggregate completion rate (0-100) across a run of day-scores.
function pctOf(scores: DayScore[]): number {
  const done = scores.reduce((a, d) => a + d.done, 0);
  const total = scores.reduce((a, d) => a + d.total, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

// "+6 vs last month" style delta chip — green up, red down, nothing when
// there's no prior-period data to compare against.
function TrendChip({ delta, unit, label }: { delta: number | null; unit: string; label: string }) {
  if (delta === null) return null;
  const positive = delta >= 0;
  const Arrow = positive ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-bold ${positive ? "" : "text-red-400"}`}
        style={positive ? { color: ACCENT } : undefined}
      >
        <Arrow size={11} strokeWidth={3} />
        {positive ? "+" : ""}
        {delta}
        {unit}
      </span>
      <span className="text-[11px] text-fg-faint">{label}</span>
    </span>
  );
}

// Compact SVG sparkline for a short run of 0-100 values — no axes, just the
// trend line plus a dot marking the latest point.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return [x, y] as const;
  });
  const path = points.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block mt-2.5"
    >
      <polyline
        points={path}
        fill="none"
        stroke={ACCENT}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={3} fill={ACCENT} />
    </svg>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────

// Every card doubles as a button into its full-detail sheet (ProfileDetailSheet)
// when `onClick` is given — a chevron marks it as tappable so it doesn't read
// as a dead-end showcase.
function Card({
  title,
  action,
  onClick,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          {onClick && <ChevronRight size={16} className="text-fg-faint" />}
        </div>
      </div>
      {children}
    </>
  );
  if (!onClick) {
    return <section className="rounded-3xl bg-surface border border-border p-5">{content}</section>;
  }
  return (
    <motion.button
      onClick={onClick}
      whileTap={tap}
      className="w-full rounded-3xl bg-surface border border-border p-5 text-left"
    >
      {content}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const tagline = useProfileStore((s) => s.tagline);
  const account = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const logoutOtherDevices = useAuthStore((s) => s.logoutOtherDevices);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const confirm = useConfirm();
  const prompt = usePrompt();
  const name = account?.displayName ?? "";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleLogoutOtherDevices() {
    const ok = await confirm({
      title: "Log out of other devices?",
      message:
        "This device stays signed in. Any other device signed into this account will be signed out.",
      confirmLabel: "Log out others",
    });
    if (!ok) return;
    setLoggingOutOthers(true);
    try {
      await logoutOtherDevices();
      useToastStore.getState().show("Other devices signed out");
    } catch {
      useToastStore.getState().show("Couldn't do that — try again", "error");
    } finally {
      setLoggingOutOthers(false);
    }
  }
  async function handleDeleteAccount() {
    // Two steps on purpose. The first states plainly what is about to happen;
    // the second asks for the password, so an unlocked phone left on a table
    // is not one tap away from erasing someone's account.
    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently deletes your account and everything in it — your schedule, goals, habits and connected calendars. It cannot be undone.",
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!ok) return;

    const password = await prompt({
      title: "Confirm your password",
      message: "Enter your password to permanently delete this account.",
      placeholder: "Password",
      confirmLabel: "Delete account",
      secret: true,
      destructive: true,
    });
    if (!password) return;

    setDeleting(true);
    try {
      // On success this wipes local data and reloads, so nothing after it runs.
      await deleteAccount(password);
    } catch (e) {
      useToastStore
        .getState()
        .show(e instanceof ApiError ? e.message : "Couldn't delete your account", "error");
      setDeleting(false);
    }
  }

  // Which card's full-detail sheet is open — every showcase card below opens
  // one (see ProfileDetailSheet: month-over-month charts + a written summary).
  const [detail, setDetail] = useState<ProfileDetailKind | null>(null);
  const [draftName, setDraftName] = useState(name);

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const todayObj = useMemo(() => new Date(), []);

  const scores7 = useMemo(() => recentScores(7, tasks, habits), [tasks, habits]);
  const weekDone = scores7.reduce((a, d) => a + d.done, 0);
  const weekTotal = scores7.reduce((a, d) => a + d.total, 0);
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  // Overview trio at the top of the page: 30-day score vs the 30 days before
  // it, this week's task count vs last week's, and an 8-week completion-rate
  // sparkline — three different lenses on the same underlying day scores,
  // each with a "vs last period" delta the rest of the page doesn't show.
  const last30 = useMemo(
    () => recentScores(30, tasks, habits, todayObj),
    [tasks, habits, todayObj]
  );
  const prior30 = useMemo(
    () => recentScores(30, tasks, habits, addDays(todayObj, -30)),
    [tasks, habits, todayObj]
  );
  const score30 = pctOf(last30);
  const score30Delta = prior30.some((d) => d.total > 0) ? score30 - pctOf(prior30) : null;

  const prevWeekScores = useMemo(
    () => recentScores(7, tasks, habits, addDays(todayObj, -7)),
    [tasks, habits, todayObj]
  );
  const prevWeekDone = prevWeekScores.reduce((a, d) => a + d.done, 0);
  const weekDoneDelta =
    prevWeekDone > 0 ? Math.round(((weekDone - prevWeekDone) / prevWeekDone) * 100) : null;

  const weeklyPoints = useMemo(
    () => consistencyByPeriod("week", 8, tasks, habits, todayObj),
    [tasks, habits, todayObj]
  );
  const completionRate = weeklyPoints[weeklyPoints.length - 1]?.pct ?? 0;

  const heat = useMemo(() => heatmapWeeks(13, tasks, habits), [tasks, habits]);

  const habitRows = useMemo(() => habitStats(habits), [habits]);

  function startEditing() {
    setDraftName(name);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (saving) return;
    setSaveError(null);
    setEditing(false);
  }

  async function saveProfile() {
    const trimmedName = draftName.trim();
    if (trimmedName === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDisplayName(trimmedName || "You");
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save your name. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Profile header */}
      <section className="rounded-3xl bg-surface border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-fg flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-fg-inverse">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            {/* Only the name is editable. Name text and field share one
                fixed-height slot and crossfade in place — the field is
                outset by its own padding so the text doesn't shift when it
                appears — so toggling never moves the layout. */}
            <div className="relative h-9">
              <AnimatePresence initial={false}>
                {editing ? (
                  <motion.input
                    key="field"
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveProfile();
                      else if (e.key === "Escape") cancelEditing();
                    }}
                    placeholder="Your name"
                    disabled={saving}
                    aria-label="Your name"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute inset-y-0 -left-2.5 w-[calc(100%+0.625rem)] px-2.5 rounded-xl bg-surface-subtle text-xl font-bold text-fg placeholder-fg-faint outline-none disabled:opacity-60"
                  />
                ) : (
                  <motion.p
                    key="name"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute inset-0 text-xl font-bold leading-9 text-fg truncate"
                  >
                    {name}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <p className="text-sm text-fg-faint truncate">{tagline}</p>
            <Collapse open={editing && !!saveError}>
              <p className="text-xs text-red-400 pt-1">{saveError}</p>
            </Collapse>
          </div>
          {/* One button that morphs: pencil → check (→ spinner while saving). */}
          <motion.button
            whileTap={tap}
            onClick={() => (editing ? void saveProfile() : startEditing())}
            disabled={saving}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 disabled:opacity-60 ${
              editing ? "bg-fg text-fg-inverse" : "bg-surface-subtle text-fg-muted"
            }`}
            aria-label={editing ? "Save name" : "Edit name"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={saving ? "saving" : editing ? "check" : "pencil"}
                initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
                transition={{ duration: 0.15 }}
                className="flex"
              >
                {saving ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : editing ? (
                  <Check size={18} />
                ) : (
                  <Pencil size={16} />
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </section>

      {/* Overview: 30-day score + this week's numbers, each with a vs-last-period trend */}
      <motion.button
        onClick={() => setDetail("consistency")}
        whileTap={tap}
        className="w-full rounded-3xl bg-surface border border-border p-5 text-left"
      >
        <p className="text-sm font-semibold text-fg-muted uppercase tracking-wide">
          Consistency &middot; last 30 days
        </p>
        <div className="flex items-end justify-between mt-2">
          <p className="text-2xl font-bold text-fg tabular-nums leading-none">
            {score30}
            <span className="text-base font-medium text-fg-faint">/100</span>
          </p>
          <TrendChip delta={score30Delta} unit="" label="vs last month" />
        </div>
        <div className="h-2 rounded-full bg-surface-subtle overflow-hidden mt-4">
          <div
            className="h-full rounded-full"
            style={{ width: `${score30}%`, backgroundColor: ACCENT }}
          />
        </div>
      </motion.button>

      <div className="flex gap-3">
        <motion.button
          onClick={() => setDetail("consistency")}
          whileTap={tap}
          className="flex-1 rounded-3xl bg-surface border border-border p-4 text-left"
        >
          <p className="text-sm font-semibold text-fg-muted uppercase tracking-wide">
            Done this week
          </p>
          <p className="text-2xl font-bold text-fg tabular-nums leading-none mt-2">
            {weekDone}
            <span className="text-xs font-medium text-fg-faint ml-1">tasks</span>
          </p>
          <div className="mt-2">
            <TrendChip delta={weekDoneDelta} unit="%" label="vs last week" />
          </div>
        </motion.button>

        <motion.button
          onClick={() => setDetail("consistency")}
          whileTap={tap}
          className="flex-1 rounded-3xl bg-surface border border-border p-4 text-left"
        >
          <p className="text-sm font-semibold text-fg-muted uppercase tracking-wide">
            Completion rate
          </p>
          <p className="text-2xl font-bold text-fg tabular-nums leading-none mt-2">
            {completionRate}%
          </p>
          <Sparkline values={weeklyPoints.map((p) => p.pct)} />
        </motion.button>
      </div>

      {/* This week */}
      <Card title="This week" onClick={() => setDetail("consistency")}>
        <div className="flex items-center gap-5">
          <Ring percent={weekPct} />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-2xl font-bold text-fg tabular-nums leading-none">
                {weekDone}
                <span className="text-base font-medium text-fg-faint">/{weekTotal}</span>
              </p>
              <p className="text-xs text-fg-muted mt-1">commitments completed (last 7 days)</p>
            </div>
            <div className="flex gap-2">
              {scores7.map((d) => {
                const pct = d.total ? (d.score ?? 0) : 0;
                return (
                  <div key={d.date} className="flex-1">
                    <div className="h-12 rounded-md bg-surface-subtle flex items-end overflow-hidden">
                      <div
                        className="w-full rounded-md"
                        style={{
                          height: `${d.total ? Math.max(pct * 100, 8) : 0}%`,
                          backgroundColor: ACCENT,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-center text-fg-faint mt-1">
                      {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "narrow",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Consistency heatmap */}
      <Card title="Consistency" onClick={() => setDetail("consistency")}>
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
      </Card>

      {/* Habits */}
      {habitRows.length > 0 && (
        <Card title="Habit streaks" onClick={() => setDetail("habits")}>
          <div className="space-y-3">
            {habitRows.map(({ habit, current, longest, rate7 }) => {
              const Icon = ICONS[habit.icon] ?? ICONS.default;
              return (
                <div key={habit.id} className="flex items-center gap-3">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${habit.color}22`, color: habit.color }}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{habit.title}</p>
                    <div className="h-1.5 mt-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(rate7 * 100)}%`,
                          backgroundColor: habit.color,
                        }}
                      />
                    </div>
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
            })}
          </div>
        </Card>
      )}

      {/* Account */}
      <Card title="Account">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted truncate">{account?.email}</p>
          <motion.button
            whileTap={tap}
            onClick={logout}
            className="flex items-center gap-1.5 shrink-0 rounded-xl bg-surface-subtle px-3 py-2 text-sm font-medium text-red-400"
          >
            <LogOut size={15} />
            Log out
          </motion.button>
        </div>
        <motion.button
          whileTap={tap}
          onClick={handleLogoutOtherDevices}
          disabled={loggingOutOthers}
          className="mt-3 flex w-full items-center gap-1.5 rounded-xl bg-surface-subtle px-3 py-2 text-sm font-medium text-fg-muted disabled:opacity-60"
        >
          {loggingOutOthers ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <ShieldOff size={15} />
          )}
          Log out of other devices
        </motion.button>
        <motion.button
          whileTap={tap}
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="mt-3 flex w-full items-center gap-1.5 rounded-xl bg-surface-subtle px-3 py-2 text-sm font-medium text-red-400 disabled:opacity-60"
        >
          {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
          Delete account
        </motion.button>
        <p className="mt-2 text-[11px] text-fg-faint">
          Deleting removes your account and all of its data permanently.
        </p>
      </Card>

      <ProfileDetailSheet kind={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
