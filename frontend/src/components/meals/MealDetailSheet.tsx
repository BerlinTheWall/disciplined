import { motion } from "framer-motion";
import {
  AlertCircle,
  Calendar,
  Coffee,
  Cookie,
  Pencil,
  Sandwich,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { todayISODate } from "@/lib/date";
import { FALLBACK_FOOD_ICON, FOOD_CATEGORIES } from "@/lib/foodCategories";
import { formatAmount, indexItems, lineNutrition, mealNutrition } from "@/lib/grocery";
import { tap } from "@/lib/motion";
import { useGroceryStore } from "@/store/groceryStore";
import type { Meal, MealType } from "@/types/meal";
import BottomSheet from "../BottomSheet";

const TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const MEAL_META: Record<MealType, { icon: LucideIcon; bg: string; fg: string }> = {
  breakfast: { icon: Coffee, bg: "#fef3e2", fg: "#e0993a" },
  lunch: { icon: Sandwich, bg: "#e9f4ec", fg: "#6ba97a" },
  dinner: { icon: UtensilsCrossed, bg: "#e8eefb", fg: "#6b83c9" },
  snack: { icon: Cookie, bg: "#fbe9f0", fg: "#cf6d97" },
};

interface MealDetailSheetProps {
  meal: Meal | null;
  onClose: () => void;
  onEdit: (meal: Meal) => void;
}

export default function MealDetailSheet({ meal, onClose, onEdit }: MealDetailSheetProps) {
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const items = indexItems(groceryItems);

  const meta = meal ? MEAL_META[meal.type] : null;
  const total = meal ? mealNutrition(meal, items) : null;
  const Icon = meta?.icon ?? Coffee;

  const dateLabel = meal
    ? meal.date === todayISODate()
      ? "Today"
      : new Date(meal.date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
    : "";

  return (
    <BottomSheet
      isOpen={!!(meal && meta && total)}
      onClose={onClose}
      className="bg-surface max-h-[92vh] overflow-y-auto"
    >
      {meal && meta && total && (
        <>
          {/* Tinted header */}
          <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: meta.bg }}>
            <div className="flex items-center justify-between">
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-black/10 text-fg"
              >
                <X size={20} />
              </motion.button>
              <motion.button
                onClick={() => onEdit(meal)}
                whileTap={tap}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium bg-black/10 text-fg"
              >
                <Pencil size={15} />
                Edit
              </motion.button>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shrink-0">
                <Icon size={30} style={{ color: meta.fg }} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: meta.fg }}
                >
                  {TYPE_LABELS[meal.type]}
                </p>
                <h2 className="text-2xl font-bold text-fg truncate leading-tight">{meal.name}</h2>
                <p className="flex items-center gap-1 text-sm text-fg-muted mt-0.5">
                  <Calendar size={13} />
                  {dateLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 pb-8">
            {/* Total nutrition */}
            {total.calories > 0 && (
              <div className="rounded-2xl bg-surface-feature text-white p-4 mb-5">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                  Total
                </p>
                <p className="text-2xl font-bold mt-0.5">
                  {total.calories}
                  <span className="text-sm font-medium text-gray-500"> kcal</span>
                </p>
                <div className="flex gap-2 mt-3">
                  <Macro label="Protein" value={`${total.protein}g`} />
                  <Macro label="Fat" value={`${total.fat}g`} />
                  <Macro label="Carbs" value={`${total.carbs}g`} />
                </div>
              </div>
            )}

            {/* Components */}
            <h3 className="text-sm font-semibold text-fg mb-2">What's in it</h3>
            {meal.components.length === 0 ? (
              <p className="text-sm text-fg-faint">No items in this meal.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {meal.components.map((c) => {
                  const item = items[c.itemId];
                  if (!item) {
                    return (
                      <div
                        key={c.itemId}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt"
                      >
                        <span className="w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center shrink-0">
                          <AlertCircle size={15} className="text-fg-faint" />
                        </span>
                        <p className="flex-1 text-sm text-fg-faint">
                          Item no longer in Food &amp; Products
                        </p>
                      </div>
                    );
                  }
                  const cat = FOOD_CATEGORIES[item.category];
                  const CatIcon = cat.icon ?? FALLBACK_FOOD_ICON;
                  const n = lineNutrition(item, c.servings);
                  return (
                    <div
                      key={c.itemId}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt"
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        <CatIcon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-fg leading-tight truncate">{item.name}</p>
                        <p className="text-xs text-fg-faint">{formatAmount(item, c.servings)}</p>
                      </div>
                      <p className="text-sm font-medium text-fg-muted shrink-0">
                        {n.calories} kcal
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </BottomSheet>
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
