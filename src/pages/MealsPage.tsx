import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, UtensilsCrossed } from "lucide-react";

import AddMealSheet from "@/components/meals/AddMealSheet";
import { todayISODate } from "@/lib/date";
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

export default function MealsPage() {
  const meals = useMealStore((s) => s.meals);
  const addMeal = useMealStore((s) => s.addMeal);
  const groceryItems = useGroceryStore((s) => s.groceryItems);

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
    recent.push(m);
    if (recent.length >= 8) break;
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
      <div className="rounded-2xl bg-surface-feature text-white p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Eaten today</p>
        <p className="text-3xl font-bold mt-1">
          {total.calories}
          <span className="text-base font-medium text-gray-500"> kcal</span>
        </p>
        <div className="flex gap-2 mt-4">
          <Macro label="Protein" value={`${total.protein}g`} />
          <Macro label="Fat" value={`${total.fat}g`} />
          <Macro label="Carbs" value={`${total.carbs}g`} />
        </div>
      </div>

      {/* ---------- Log again ---------- */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-fg px-1 mb-2">Log again</h2>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {recent.map((m) => {
              const n = mealNutrition(m, items);
              return (
                <motion.button
                  key={m.id}
                  onClick={() => logAgain(m)}
                  whileTap={tap}
                  className="shrink-0 flex flex-col items-start gap-0.5 bg-surface-alt rounded-2xl px-3.5 py-2.5 max-w-42.5"
                >
                  <span className="flex items-center gap-1 font-medium text-sm text-fg max-w-37.5 truncate">
                    <Plus size={13} className="text-fg-faint shrink-0" />
                    {m.name}
                  </span>
                  <span className="text-xs text-fg-faint">
                    {n.calories} kcal · {TYPE_LABELS[m.type]}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- Meals ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-fg">Today's meals</h2>
          <motion.button
            onClick={() => setAddOpen(true)}
            whileTap={tap}
            className="flex items-center gap-1 text-sm text-fg-muted"
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
            <p className="text-sm text-fg-faint text-center">
              Build a meal from the food you've saved to track your diet.
            </p>
          </div>
        ) : (
          todaysMeals.map((meal) => {
            const n = mealNutrition(meal, items);
            const parts = meal.components
              .map((c) => items[c.itemId]?.name)
              .filter(Boolean)
              .join(", ");
            return (
              <motion.button
                key={meal.id}
                onClick={() => setEditMeal(meal)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 p-4 rounded-2xl bg-surface-alt text-left w-full"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-fg leading-tight truncate">{meal.name}</p>
                    <span className="text-[11px] font-medium text-fg-muted bg-surface-subtle rounded-full px-2 py-0.5 shrink-0">
                      {TYPE_LABELS[meal.type]}
                    </span>
                  </div>
                  {parts && <p className="text-xs text-fg-faint mt-1 truncate">{parts}</p>}
                  <p className="text-xs text-fg-muted mt-1.5">
                    {n.protein}g protein · {n.fat}g fat · {n.carbs}g carbs
                  </p>
                </div>
                <p className="font-semibold text-fg shrink-0">
                  {n.calories}
                  <span className="text-xs font-medium text-fg-faint"> kcal</span>
                </p>
              </motion.button>
            );
          })
        )}
      </div>

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

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-surface-feature-alt px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold mt-0.5 text-white">{value}</p>
    </div>
  );
}
