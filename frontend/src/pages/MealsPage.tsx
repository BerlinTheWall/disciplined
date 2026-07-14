import { useState } from "react";
import { motion } from "framer-motion";
import {
  Coffee,
  Cookie,
  Droplet,
  Drumstick,
  Plus,
  Sandwich,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import AddMealSheet from "@/components/meals/AddMealSheet";
import MealDetailSheet from "@/components/meals/MealDetailSheet";
import { todayISODate } from "@/lib/date";
import { CALORIE_GOAL, MACRO_GOALS } from "@/lib/goals";
import { dayNutrition, indexItems, mealNutrition } from "@/lib/grocery";
import { press, spring, tap } from "@/lib/motion";
import { useGroceryStore } from "@/store/groceryStore";
import { useMealStore } from "@/store/mealStore";
import type { Meal, MealType } from "@/types/meal";

const TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

// Per-meal-type icon + soft tint, so each logged meal carries a glanceable
// colored avatar rather than a plain text chip.
const MEAL_META: Record<MealType, { icon: LucideIcon; bg: string; fg: string }> = {
  breakfast: { icon: Coffee, bg: "#fef3e2", fg: "#e0993a" },
  lunch: { icon: Sandwich, bg: "#e9f4ec", fg: "#6ba97a" },
  dinner: { icon: UtensilsCrossed, bg: "#e8eefb", fg: "#6b83c9" },
  snack: { icon: Cookie, bg: "#fbe9f0", fg: "#cf6d97" },
};

// Macro accent colors, shared with the calorie card's macro tints.
const MACRO_COLORS = { carbs: "#d98a63", protein: "#6ba97a", fat: "#d3a944" };

export default function MealsPage() {
  const meals = useMealStore((s) => s.meals);
  const addMeal = useMealStore((s) => s.addMeal);
  const logAgainDismissed = useMealStore((s) => s.logAgainDismissed);
  const clearLogAgain = useMealStore((s) => s.clearLogAgain);
  const groceryItems = useGroceryStore((s) => s.groceryItems);

  const [detailMeal, setDetailMeal] = useState<Meal | null>(null);
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const items = indexItems(groceryItems);
  const today = todayISODate();

  // Keep insertion order so the most recently logged meal sits at the bottom.
  const todaysMeals = meals.filter((m) => m.date === today);

  const total = dayNutrition(todaysMeals, items);

  // Recently logged meals (from earlier days), newest first and de-duped by
  // name, so you can re-log a regular meal in one tap.
  const recent: Meal[] = [];
  const seen = new Set<string>();
  const past = [...meals].filter((m) => m.date !== today).reverse();
  past.sort((a, b) => b.date.localeCompare(a.date));
  for (const m of past) {
    const key = m.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const dismissedAt = logAgainDismissed[key];
    if (dismissedAt && m.date <= dismissedAt) continue;
    recent.push(m);
    if (recent.length >= 8) break;
  }

  function clearRecent() {
    clearLogAgain(Object.fromEntries(recent.map((m) => [m.name.trim().toLowerCase(), m.date])));
  }

  function logAgain(m: Meal) {
    addMeal({
      name: m.name,
      type: m.type,
      date: today,
      components: m.components.map((c) => ({ ...c })),
      recipeId: m.recipeId,
      servingsEaten: m.servingsEaten,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- Today's diet ---------- */}
      <div className="rounded-3xl bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-muted">Today calorie</p>
            <p className="text-4xl font-bold text-fg mt-1 tracking-tight">
              {total.calories}
              <span className="text-lg font-semibold text-fg-faint"> kcal</span>
            </p>
          </div>
          <CalorieRing consumed={total.calories} goal={CALORIE_GOAL} />
        </div>

        <div className="flex gap-2.5 mt-5">
          <MacroCard
            icon={Wheat}
            label="Carbs"
            value={Math.round(total.carbs)}
            goal={MACRO_GOALS.carbs}
            bg="#fdeee7"
            fg="#d98a63"
          />
          <MacroCard
            icon={Drumstick}
            label="Protein"
            value={Math.round(total.protein)}
            goal={MACRO_GOALS.protein}
            bg="#e9f4ec"
            fg="#6ba97a"
          />
          <MacroCard
            icon={Droplet}
            label="Fat"
            value={Math.round(total.fat)}
            goal={MACRO_GOALS.fat}
            bg="#fbf3dc"
            fg="#d3a944"
          />
        </div>
      </div>

      {/* ---------- Log again ---------- */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-fg">Log again</h2>
            <motion.button
              onClick={clearRecent}
              whileTap={tap}
              className="text-sm font-medium text-fg-faint"
            >
              Clear
            </motion.button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {recent.map((m) => {
              const n = mealNutrition(m, items);
              const meta = MEAL_META[m.type];
              const Icon = meta.icon;
              return (
                <motion.button
                  key={m.id}
                  onClick={() => logAgain(m)}
                  whileTap={tap}
                  className="shrink-0 flex items-center gap-2.5 rounded-2xl bg-surface py-2 pl-2 pr-3 shadow-soft"
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: meta.bg }}
                  >
                    <Icon size={16} style={{ color: meta.fg }} />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block max-w-32 truncate text-sm font-medium text-fg leading-tight">
                      {m.name}
                    </span>
                    <span className="block text-[11px] text-fg-faint">{n.calories} kcal</span>
                  </span>
                  <Plus size={16} className="text-fg-faint shrink-0" />
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- Meals ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold text-fg">
            Today's meals
            {todaysMeals.length > 0 && (
              <span className="font-medium text-fg-faint"> · {todaysMeals.length}</span>
            )}
          </h2>
          <motion.button
            onClick={() => setAddOpen(true)}
            whileTap={tap}
            className="flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1.5 text-sm font-medium text-fg-muted"
          >
            <Plus size={15} />
            Log meal
          </motion.button>
        </div>

        {todaysMeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
              <UtensilsCrossed size={24} className="text-fg-faint" />
            </div>
            <p className="text-base font-medium text-fg">Nothing logged today</p>
            <p className="max-w-xs text-sm text-fg-faint text-center">
              Build a meal from the food you've saved to track your diet.
            </p>
            <motion.button
              onClick={() => setAddOpen(true)}
              whileTap={tap}
              className="mt-1 flex items-center gap-1.5 rounded-full bg-surface-inverse px-4 py-2.5 text-sm font-medium text-fg-inverse"
            >
              <Plus size={16} />
              Log a meal
            </motion.button>
          </div>
        ) : (
          todaysMeals.map((meal) => {
            const n = mealNutrition(meal, items);
            const parts = meal.components
              .map((c) => items[c.itemId]?.name)
              .filter(Boolean)
              .join(", ");
            const meta = MEAL_META[meal.type];
            const Icon = meta.icon;
            return (
              <motion.button
                key={meal.id}
                onClick={() => setDetailMeal(meal)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 p-3.5 rounded-3xl bg-surface text-left w-full shadow-card"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: meta.bg }}
                >
                  <Icon size={22} style={{ color: meta.fg }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide leading-none"
                    style={{ color: meta.fg }}
                  >
                    {TYPE_LABELS[meal.type]}
                  </p>
                  <p className="font-semibold text-fg leading-tight truncate mt-1">{meal.name}</p>
                  {parts && <p className="text-xs text-fg-faint truncate mt-0.5">{parts}</p>}
                  <div className="flex items-center gap-2.5 mt-1.5 text-[11px] font-medium text-fg-muted">
                    <MacroPip color={MACRO_COLORS.protein} value={n.protein} />
                    <MacroPip color={MACRO_COLORS.fat} value={n.fat} />
                    <MacroPip color={MACRO_COLORS.carbs} value={n.carbs} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-fg leading-none">{n.calories}</p>
                  <p className="text-[10px] font-medium text-fg-faint mt-1">kcal</p>
                </div>
              </motion.button>
            );
          })
        )}
      </div>

      <MealDetailSheet
        meal={detailMeal}
        onClose={() => setDetailMeal(null)}
        onEdit={(meal) => {
          setDetailMeal(null);
          setEditMeal(meal);
        }}
      />

      <AddMealSheet
        isOpen={addOpen || !!editMeal}
        editMeal={editMeal}
        onClose={() => {
          setAddOpen(false);
          setEditMeal(null);
        }}
      />
    </div>
  );
}

function MacroPip({ color, value }: { color: string; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {Math.round(value)}g
    </span>
  );
}

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const left = Math.max(goal - consumed, 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-raised)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2f6f7e"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={spring.snappy}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-fg leading-none">{left}</span>
        <span className="text-[10px] font-medium text-fg-faint mt-0.5">Left</span>
      </div>
    </div>
  );
}

function MacroCard({
  icon: Icon,
  label,
  value,
  goal,
  bg,
  fg,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  goal: number;
  bg: string;
  fg: string;
}) {
  return (
    <div className="flex-1 flex items-center gap-2.5 rounded-2xl bg-surface-alt px-3 py-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: bg }}
      >
        <Icon size={16} style={{ color: fg }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-fg-muted leading-none">{label}</p>
        <p className="text-sm font-bold text-fg mt-1 leading-none">
          {value}
          <span className="text-fg-faint font-medium"> /{goal}</span>
        </p>
      </div>
    </div>
  );
}
