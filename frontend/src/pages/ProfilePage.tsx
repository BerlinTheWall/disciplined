import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ChevronRight,
  Flame,
  LogOut,
  Pencil,
  TrendingDown,
  TrendingUp,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useChoose } from "@/components/ConfirmDialog";
import { CalorieBars, Heatmap, MacroBar, Ring, Stat } from "@/components/profile/ProfileCharts";
import ProfileDetailSheet, {
  type ProfileDetailKind,
} from "@/components/profile/ProfileDetailSheet";
import { fileToAvatar } from "@/lib/avatar";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { addDays, todayISODate, toISODate } from "@/lib/date";
import { CALORIE_GOAL, MACRO_GOALS } from "@/lib/goals";
import { money } from "@/lib/grocery";
import { ICONS } from "@/lib/icons";
import {
  averageNutrition,
  habitStats,
  heatmapWeeks,
  monthStartISO,
  prevMonthRangeISO,
  recentNutrition,
  recentScores,
  spendInRange,
  workoutStats,
} from "@/lib/insights";
import { tap } from "@/lib/motion";
import { WORKOUT_TYPE_META } from "@/lib/workout";
import { useAuthStore } from "@/store/authStore";
import { useExpenseStore } from "@/store/expenseStore";
import { useGroceryStore } from "@/store/groceryStore";
import { useHabitStore } from "@/store/habitStore";
import { useMealStore } from "@/store/mealStore";
import { useProfileStore } from "@/store/profileStore";
import { useTaskStore } from "@/store/taskStore";
import { useWorkoutStore } from "@/store/workoutStore";

const ACCENT = "#9ec06a"; // the app's soft-green progress accent

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
  const meals = useMealStore((s) => s.meals);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const sessions = useWorkoutStore((s) => s.sessions);
  const expenses = useExpenseStore((s) => s.expenses);
  const monthlyBudget = useExpenseStore((s) => s.monthlyBudget);
  const [name, tagline, avatar, setName, setTagline, setAvatar] = useProfileStore(
    useShallow((state) => [
      state.name,
      state.tagline,
      state.avatar,
      state.setName,
      state.setTagline,
      state.setAvatar,
    ])
  );
  const choose = useChoose();
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Tap the avatar to set a photo; with one already set, offer replace/remove.
  async function onAvatarTap() {
    if (avatar) {
      const action = await choose({
        title: "Profile photo",
        options: [
          { label: "Choose a new photo", value: "change" },
          { label: "Remove photo", value: "remove", destructive: true },
        ],
      });
      if (action === "remove") {
        setAvatar(null);
        return;
      }
      if (action !== "change") return;
    }
    avatarFileRef.current?.click();
  }

  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    try {
      // Downscaled + center-cropped to a small square, so even a huge camera
      // photo stores as a few dozen KB.
      setAvatar(await fileToAvatar(file));
    } catch (err) {
      console.warn("avatar import failed", err);
    }
  }
  const account = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [editing, setEditing] = useState(false);
  // Which card's full-detail sheet is open — every showcase card below opens
  // one (see ProfileDetailSheet: month-over-month charts + a written summary).
  const [detail, setDetail] = useState<ProfileDetailKind | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftTagline, setDraftTagline] = useState(tagline);

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  // Everything derives off one "now" so all ranges line up.
  const today = todayISODate();

  const scores7 = useMemo(() => recentScores(7, tasks, habits), [tasks, habits]);
  const weekDone = scores7.reduce((a, d) => a + d.done, 0);
  const weekTotal = scores7.reduce((a, d) => a + d.total, 0);
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const heat = useMemo(() => heatmapWeeks(13, tasks, habits), [tasks, habits]);

  const habitRows = useMemo(() => habitStats(habits), [habits]);

  const weekStart = toISODate(addDays(new Date(), -6));
  const woWeek = useMemo(
    () => workoutStats(tasks, sessions, weekStart, today),
    [tasks, sessions, weekStart, today]
  );
  const woMonth = useMemo(
    () => workoutStats(tasks, sessions, monthStartISO(), today),
    [tasks, sessions, today]
  );

  const nutrition14 = useMemo(
    () => recentNutrition(14, meals, groceryItems),
    [meals, groceryItems]
  );
  const nutritionAvg = useMemo(() => averageNutrition(nutrition14), [nutrition14]);

  const spendThisMonth = useMemo(
    () => spendInRange(expenses, monthStartISO(), today),
    [expenses, today]
  );
  const spendLastMonth = useMemo(() => {
    const { start, endISO } = prevMonthRangeISO();
    return spendInRange(expenses, start, endISO);
  }, [expenses]);
  const spendDelta = spendThisMonth.total - spendLastMonth.total;
  const topCategories = Object.entries(spendThisMonth.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = topCategories.length ? topCategories[0][1] : 1;

  function saveProfile() {
    setName(draftName.trim() || "You");
    setTagline(draftTagline.trim());
    setEditing(false);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Profile header */}
      <section className="rounded-3xl bg-surface border border-border p-5">
        <div className="flex items-center gap-4">
          <motion.button
            onClick={() => void onAvatarTap()}
            whileTap={tap}
            aria-label="Change profile photo"
            className="relative w-16 h-16 rounded-full bg-fg flex items-center justify-center shrink-0"
          >
            {avatar ? (
              <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-fg-inverse">{initial}</span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface border border-border-strong flex items-center justify-center text-fg-muted">
              <Camera size={13} />
            </span>
          </motion.button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onAvatarPicked(e)}
          />
          {editing ? (
            <div className="flex-1 space-y-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-surface-subtle rounded-xl px-3 py-2 text-fg font-semibold outline-none"
              />
              <input
                value={draftTagline}
                onChange={(e) => setDraftTagline(e.target.value)}
                placeholder="A short tagline"
                className="w-full bg-surface-subtle rounded-xl px-3 py-2 text-sm text-fg-muted outline-none"
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-fg truncate">{name}</p>
              <p className="text-sm text-fg-faint truncate">{tagline}</p>
            </div>
          )}
          {editing ? (
            <motion.button
              whileTap={tap}
              onClick={saveProfile}
              className="w-10 h-10 rounded-full bg-fg text-fg-inverse flex items-center justify-center shrink-0"
              aria-label="Save profile"
            >
              <Check size={18} />
            </motion.button>
          ) : (
            <motion.button
              whileTap={tap}
              onClick={() => {
                setDraftName(name);
                setDraftTagline(tagline);
                setEditing(true);
              }}
              className="w-10 h-10 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center shrink-0"
              aria-label="Edit profile"
            >
              <Pencil size={16} />
            </motion.button>
          )}
        </div>
      </section>

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

      {/* Workouts */}
      <Card title="Workouts" onClick={() => setDetail("workouts")}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat value={woWeek.total} label="this week" />
          <Stat value={woMonth.total} label="this month" />
          <Stat
            value={woWeek.daysSince ?? "—"}
            label={woWeek.daysSince === null ? "none yet" : "days since last"}
          />
        </div>
        {Object.keys(woMonth.byType).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(woMonth.byType).map(([type, count]) => {
              const meta = WORKOUT_TYPE_META[type as keyof typeof WORKOUT_TYPE_META];
              const TypeIcon = meta.icon as LucideIcon;
              return (
                <span
                  key={type}
                  className="flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
                >
                  <TypeIcon size={13} />
                  {meta.label}
                  <span className="text-fg tabular-nums">{count}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-fg-faint">No workouts completed this month yet.</p>
        )}
      </Card>

      {/* Nutrition */}
      <Card title="Nutrition" onClick={() => setDetail("nutrition")}>
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-sm text-fg-muted">Avg daily calories (14d)</p>
          <p className="text-lg font-bold text-fg tabular-nums">
            {nutritionAvg.avg.calories}
            <span className="text-xs font-medium text-fg-faint"> / {CALORIE_GOAL}</span>
          </p>
        </div>
        <CalorieBars
          days={nutrition14.map((d) => ({
            date: d.date,
            calories: d.nutrition.calories,
            logged: d.logged,
          }))}
          goal={CALORIE_GOAL}
        />
        <p className="text-[11px] text-fg-faint mt-2 mb-4 flex items-center gap-1">
          <Utensils size={11} /> {nutritionAvg.loggedDays} of 14 days logged
        </p>
        <div className="space-y-2.5">
          <MacroBar
            label="Protein"
            value={nutritionAvg.avg.protein}
            goal={MACRO_GOALS.protein}
            color="#f87171"
          />
          <MacroBar
            label="Carbs"
            value={nutritionAvg.avg.carbs}
            goal={MACRO_GOALS.carbs}
            color="#fbbf24"
          />
          <MacroBar
            label="Fat"
            value={nutritionAvg.avg.fat}
            goal={MACRO_GOALS.fat}
            color="#60a5fa"
          />
        </div>
      </Card>

      {/* Spending */}
      <Card title="Spending" onClick={() => setDetail("spending")}>
        <div className="flex items-baseline justify-between mb-1">
          <div>
            <p className="text-2xl font-bold text-fg tabular-nums leading-none">
              {money(spendThisMonth.total)}
            </p>
            <p className="text-xs text-fg-muted mt-1">this month / {money(monthlyBudget)} budget</p>
          </div>
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              spendDelta > 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {spendDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {money(Math.abs(spendDelta))} vs last month
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-subtle overflow-hidden my-3">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min((spendThisMonth.total / (monthlyBudget || 1)) * 100, 100)}%`,
              backgroundColor: spendThisMonth.total > monthlyBudget ? "#f87171" : ACCENT,
            }}
          />
        </div>
        {topCategories.length > 0 ? (
          <div className="space-y-2.5 mt-4">
            {topCategories.slice(0, 5).map(([cat, amount]) => {
              const meta = CATEGORIES[cat as CategoryKey] ?? CATEGORIES.other;
              const CatIcon = meta.icon as LucideIcon;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                  >
                    <CatIcon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-fg-muted">{meta.label}</span>
                      <span className="text-fg font-medium tabular-nums">{money(amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(amount / maxCat) * 100}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-fg-faint">No spending logged this month.</p>
        )}
      </Card>

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
      </Card>

      <ProfileDetailSheet kind={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
