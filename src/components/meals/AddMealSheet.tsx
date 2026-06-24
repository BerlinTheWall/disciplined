/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Minus, Plus, X, ChefHat } from "lucide-react";
import { useGroceryStore } from "../../store/groceryStore";
import { useMealStore } from "../../store/mealStore";
import { useRecipeStore } from "../../store/recipeStore";
import { FOOD_CATEGORIES, FALLBACK_FOOD_ICON } from "../../lib/foodCategories";
import {
  indexItems,
  lineNutrition,
  formatAmount,
} from "../../lib/grocery";
import { addNutrition, emptyNutrition } from "../../lib/nutritions";
import { todayISODate } from "../../lib/date";
import { spring, tap } from "../../lib/motion";
import { useScrollLock } from "../../hooks/useScrollLock";
import type { Meal, MealComponent, MealType } from "../../types/meal";

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

interface AddMealSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editMeal?: Meal | null;
}

export default function AddMealSheet({
  isOpen,
  onClose,
  editMeal,
}: AddMealSheetProps) {
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const recipes = useRecipeStore((s) => s.recipes);
  const addMeal = useMealStore((s) => s.addMeal);
  const updateMeal = useMealStore((s) => s.updateMeal);
  const deleteMeal = useMealStore((s) => s.deleteMeal);

  const isEditing = !!editMeal;
  useScrollLock(isOpen);
  const items = indexItems(groceryItems);

  const [name, setName] = useState("");
  const [type, setType] = useState<MealType>("lunch");
  const [date, setDate] = useState(todayISODate());
  const [components, setComponents] = useState<MealComponent[]>([]);
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (editMeal) {
      setName(editMeal.name);
      setType(editMeal.type);
      setDate(editMeal.date);
      setComponents(editMeal.components);
      setRecipeId(editMeal.recipeId);
    } else {
      setName("");
      setType("lunch");
      setDate(todayISODate());
      setComponents([]);
      setRecipeId(undefined);
    }
  }, [editMeal]);

  // Picking a recipe fills the meal in: its name and ingredients become the
  // meal's name and components, so nutrition rolls up automatically.
  function applyRecipe(id: string) {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    setRecipeId(id);
    setName(recipe.name);
    setComponents(recipe.ingredients.map((i) => ({ ...i })));
  }

  const chosen = new Map(components.map((c) => [c.itemId, c.servings]));

  function toggleItem(itemId: string) {
    setComponents((prev) =>
      prev.some((c) => c.itemId === itemId)
        ? prev.filter((c) => c.itemId !== itemId)
        : [...prev, { itemId, servings: 1 }],
    );
  }

  function bumpServings(itemId: string, delta: number) {
    setComponents((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? { ...c, servings: Math.max(0.25, Math.round((c.servings + delta) * 100) / 100) }
          : c,
      ),
    );
  }

  const total = components.reduce(
    (acc, c) => addNutrition(acc, lineNutrition(items[c.itemId], c.servings)),
    emptyNutrition(),
  );

  const canSave = name.trim().length > 0 && components.length > 0;

  function handleSubmit() {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      type,
      date,
      components,
      recipeId,
    };
    if (isEditing) updateMeal(editMeal!.id, payload);
    else addMeal(payload);
    onClose();
  }

  function handleDelete() {
    if (!editMeal) return;
    deleteMeal(editMeal.id);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[90vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">
                {isEditing ? "Edit meal" : "Log a meal"}
              </h2>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="p-2 -m-2 text-fg-faint"
              >
                <X size={22} />
              </motion.button>
            </div>

            {/* Name */}
            <label className="text-sm text-fg-muted mb-1 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chicken and rice"
              autoFocus
              className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-border-focus"
            />

            {/* From a recipe */}
            {recipes.length > 0 && (
              <>
                <label className="text-sm text-fg-muted mb-2 flex items-center gap-1.5">
                  <ChefHat size={14} />
                  From a recipe
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: "none" }}>
                  <motion.button
                    onClick={() => setRecipeId(undefined)}
                    whileTap={tap}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${!recipeId ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"}`}
                  >
                    None
                  </motion.button>
                  {recipes.map((r) => (
                    <motion.button
                      key={r.id}
                      onClick={() => applyRecipe(r.id)}
                      whileTap={tap}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${recipeId === r.id ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"}`}
                    >
                      <ChefHat size={14} />
                      {r.name}
                    </motion.button>
                  ))}
                </div>
              </>
            )}

            {/* Type */}
            <label className="text-sm text-fg-muted mb-2 block">Meal</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {MEAL_TYPES.map(({ key, label }) => (
                <motion.button
                  key={key}
                  onClick={() => setType(key)}
                  whileTap={tap}
                  className={`px-3.5 py-2 rounded-full text-sm font-medium ${
                    type === key
                      ? "bg-surface-inverse text-fg-inverse"
                      : "bg-surface-raised text-fg-muted"
                  }`}
                >
                  {label}
                </motion.button>
              ))}
            </div>

            {/* Date */}
            <label className="text-sm text-fg-muted mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-border-focus"
            />

            {/* Components from catalog */}
            <label className="text-sm text-fg-muted mb-2 block">
              What's in it
            </label>
            {groceryItems.length === 0 ? (
              <p className="text-sm text-fg-faint mb-4">
                Add items in the Food &amp; Products section first — meals are built
                from the same catalog.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {groceryItems.map((item) => {
                  const cat = FOOD_CATEGORIES[item.category];
                  const Icon = cat.icon ?? FALLBACK_FOOD_ICON;
                  const selected = chosen.has(item.id);
                  const servings = chosen.get(item.id) ?? 1;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-2.5 pr-3 rounded-2xl ${
                        selected ? "bg-surface-inverse" : "bg-surface-alt"
                      }`}
                    >
                      <motion.button
                        onClick={() => toggleItem(item.id)}
                        whileTap={tap}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      >
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          {selected ? (
                            <Check size={15} strokeWidth={3} />
                          ) : (
                            <Icon size={14} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block font-medium leading-tight truncate ${
                              selected ? "text-fg-inverse" : "text-fg"
                            }`}
                          >
                            {item.name}
                          </span>
                          <span
                            className={`block text-xs mt-0.5 ${
                              selected ? "text-fg-muted-inverse" : "text-fg-faint"
                            }`}
                          >
                            {selected
                              ? `${formatAmount(item, servings)} · ${lineNutrition(item, servings).calories} kcal`
                              : `${item.nutrition.calories} kcal per ${formatAmount(item, 1)}`}
                          </span>
                        </span>
                      </motion.button>

                      {selected && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <motion.button
                            onClick={() => bumpServings(item.id, -0.25)}
                            whileTap={tap}
                            className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                            aria-label="Less"
                          >
                            <Minus size={14} />
                          </motion.button>
                          <span className="w-9 text-center text-sm font-medium text-fg-inverse">
                            ×{servings}
                          </span>
                          <motion.button
                            onClick={() => bumpServings(item.id, 0.25)}
                            whileTap={tap}
                            className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                            aria-label="More"
                          >
                            <Plus size={14} />
                          </motion.button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Live nutrition preview */}
            {components.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                <NutriChip label={`${total.calories} kcal`} />
                <NutriChip label={`${total.protein}g protein`} />
                <NutriChip label={`${total.fat}g fat`} />
                <NutriChip label={`${total.carbs}g carbs`} />
              </div>
            )}

            <motion.button
              onClick={handleSubmit}
              whileTap={tap}
              disabled={!canSave}
              className="w-full bg-surface-inverse text-fg-inverse rounded-xl py-3.5 font-medium disabled:opacity-40"
            >
              {isEditing ? "Save changes" : "Log meal"}
            </motion.button>

            {isEditing && (
              <motion.button
                onClick={handleDelete}
                whileTap={tap}
                className="w-full mt-3 py-3.5 rounded-xl text-red-500 font-medium bg-red-50"
              >
                Delete meal
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function NutriChip({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-fg-muted bg-surface-raised rounded-full px-2.5 py-1">
      {label}
    </span>
  );
}
