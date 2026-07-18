/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChefHat, Minus, Plus, Search, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { todayISODate } from "@/lib/date";
import { FALLBACK_FOOD_ICON, FOOD_CATEGORIES } from "@/lib/foodCategories";
import { formatAmount, indexItems, lineNutrition } from "@/lib/grocery";
import { tap } from "@/lib/motion";
import { addNutrition, emptyNutrition } from "@/lib/nutritions";
import { useGroceryStore } from "@/store/groceryStore";
import { useMealStore } from "@/store/mealStore";
import { useRecipeStore } from "@/store/recipeStore";
import type { Meal, MealComponent, MealType } from "@/types/meal";
import type { Recipe } from "@/types/recipe";
import BottomSheet from "../BottomSheet";
import { useConfirm } from "../ConfirmDialog";
import AddGroceryItemSheet from "../expenses/AddGroceryItemSheet";

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];

// Ingredients of a recipe are absolute amounts for the whole recipe. To log
// eating `eaten` of its `servings`, scale each ingredient by eaten / servings —
// otherwise a single plate of a 4-serving recipe would count 4× the nutrition.
function scaleIngredients(recipe: Recipe, eaten: number): MealComponent[] {
  const yld = Math.max(1, recipe.servings);
  return recipe.ingredients.map((i) => ({
    itemId: i.itemId,
    servings: Math.round((i.servings / yld) * eaten * 100) / 100,
  }));
}

interface AddMealSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editMeal?: Meal | null;
}

export default function AddMealSheet({ isOpen, onClose, editMeal }: AddMealSheetProps) {
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const recipes = useRecipeStore((s) => s.recipes);
  const [meals, addMeal, updateMeal, deleteMeal] = useMealStore(
    useShallow((state) => [state.meals, state.addMeal, state.updateMeal, state.deleteMeal])
  );
  const confirm = useConfirm();

  const [newItemOpen, setNewItemOpen] = useState(false);

  const isEditing = !!editMeal;
  const nameRef = useRef<HTMLInputElement>(null);
  const items = indexItems(groceryItems);

  const [name, setName] = useState("");
  const [type, setType] = useState<MealType>("lunch");
  const [date, setDate] = useState(todayISODate());
  const [components, setComponents] = useState<MealComponent[]>([]);
  const [recipeId, setRecipeId] = useState<string | undefined>(undefined);
  const [servingsEaten, setServingsEaten] = useState(1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
    if (editMeal) {
      setName(editMeal.name);
      setType(editMeal.type);
      setDate(editMeal.date);
      setComponents(editMeal.components);
      setRecipeId(editMeal.recipeId);
      setServingsEaten(editMeal.servingsEaten ?? 1);
    } else {
      setName("");
      setType("lunch");
      setDate(todayISODate());
      setComponents([]);
      setRecipeId(undefined);
      setServingsEaten(1);
    }
  }, [editMeal]);

  // Picking a recipe fills the meal in: its name and (per-serving-scaled)
  // ingredients become the meal's name and components, so nutrition rolls up
  // automatically. Defaults to one serving eaten.
  function applyRecipe(id: string) {
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    setRecipeId(id);
    setName(recipe.name);
    setServingsEaten(1);
    setComponents(scaleIngredients(recipe, 1));
  }

  // Adjust how many of the recipe's servings this meal logged, re-scaling its
  // components from the recipe.
  function changeServingsEaten(next: number) {
    const eaten = Math.max(0.25, Math.round(next * 100) / 100);
    setServingsEaten(eaten);
    const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
    if (recipe) setComponents(scaleIngredients(recipe, eaten));
  }

  const chosen = new Map(components.map((c) => [c.itemId, c.servings]));

  // How often each catalog item has been used across logged meals — the common
  // foods float to the top of the picker.
  const usage = new Map<string, number>();
  for (const m of meals) {
    for (const c of m.components) usage.set(c.itemId, (usage.get(c.itemId) ?? 0) + 1);
  }

  // Filter the catalog by the search box (but always keep already-chosen items
  // visible), then sort most-used first.
  const q = query.trim().toLowerCase();
  const shownItems = groceryItems
    .filter((it) => chosen.has(it.id) || it.name.toLowerCase().includes(q))
    .sort(
      (a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name)
    );

  function toggleItem(itemId: string) {
    setComponents((prev) =>
      prev.some((c) => c.itemId === itemId)
        ? prev.filter((c) => c.itemId !== itemId)
        : [...prev, { itemId, servings: 1 }]
    );
  }

  function bumpServings(itemId: string, delta: number) {
    setComponents((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? { ...c, servings: Math.max(0.25, Math.round((c.servings + delta) * 100) / 100) }
          : c
      )
    );
  }

  const total = components.reduce(
    (acc, c) => addNutrition(acc, lineNutrition(items[c.itemId], c.servings)),
    emptyNutrition()
  );

  const canSave = name.trim().length > 0 && components.length > 0;

  async function handleSubmit() {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      type,
      date,
      components,
      recipeId,
      servingsEaten: recipeId ? servingsEaten : undefined,
    };
    if (isEditing) {
      const ok = await confirm({
        title: "Save changes?",
        message: `Update "${payload.name}" with your edits.`,
        confirmLabel: "Save",
      });
      if (!ok) return;
      updateMeal(editMeal!.id, payload);
    } else {
      addMeal(payload);
    }
    onClose();
  }

  async function handleDelete() {
    if (!editMeal) return;
    const ok = await confirm({
      title: "Delete meal?",
      message: `"${editMeal.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteMeal(editMeal.id);
    onClose();
  }

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        className="bg-surface p-5 pb-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg">
            {isEditing ? "Edit meal" : "Log a meal"}
          </h2>
          <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
            <X size={22} />
          </motion.button>
        </div>

        {/* Name */}
        <label className="text-sm text-fg-muted mb-1 block">Name</label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chicken and rice"
          className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-border-focus"
        />

        {/* From a recipe */}
        {recipes.length > 0 && (
          <>
            <label className="text-sm text-fg-muted mb-2 flex items-center gap-1.5">
              <ChefHat size={14} />
              From a recipe
            </label>
            <div
              className="flex gap-2 overflow-x-auto pb-1 mb-4"
              style={{ scrollbarWidth: "none" }}
            >
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

            {/* How much of the recipe you actually ate — scales the nutrition. */}
            {recipeId && (
              <div className="flex items-center justify-between bg-surface-alt rounded-2xl px-4 py-2.5 mb-4">
                <span className="text-sm text-fg-muted">Servings eaten</span>
                <div className="flex items-center gap-1.5">
                  <motion.button
                    onClick={() => changeServingsEaten(servingsEaten - 0.5)}
                    whileTap={tap}
                    className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                    aria-label="Fewer servings"
                  >
                    <Minus size={14} />
                  </motion.button>
                  <span className="w-9 text-center text-sm font-medium text-fg tabular-nums">
                    {servingsEaten}
                  </span>
                  <motion.button
                    onClick={() => changeServingsEaten(servingsEaten + 0.5)}
                    whileTap={tap}
                    className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                    aria-label="More servings"
                  >
                    <Plus size={14} />
                  </motion.button>
                </div>
              </div>
            )}
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
        <label className="text-sm text-fg-muted mb-2 block">What's in it</label>
        <motion.button
          onClick={() => setNewItemOpen(true)}
          whileTap={tap}
          className="flex items-center gap-2 w-full mb-2 px-4 py-2.5 rounded-xl border border-dashed border-border-strong text-fg-muted text-sm font-medium"
        >
          <Plus size={16} />
          New item
        </motion.button>
        {groceryItems.length === 0 ? (
          <p className="text-sm text-fg-faint mb-4">
            No foods yet — add your first one above, then it's reusable everywhere.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {groceryItems.length > 6 && (
              <div className="flex items-center gap-2 bg-surface-alt rounded-xl px-3 py-2">
                <Search size={15} className="text-fg-faint shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search items…"
                  className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none"
                />
              </div>
            )}
            {shownItems.length === 0 && (
              <p className="text-sm text-fg-faint py-2">No items match "{query}".</p>
            )}
            {shownItems.map((item) => {
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
                      {selected ? <Check size={15} strokeWidth={3} /> : <Icon size={14} />}
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
      </BottomSheet>

      {/* Create a food inline and auto-select it, without leaving the meal. */}
      <AddGroceryItemSheet
        isOpen={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onCreated={(id) => toggleItem(id)}
      />
    </>
  );
}

function NutriChip({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-fg-muted bg-surface-raised rounded-full px-2.5 py-1">
      {label}
    </span>
  );
}
