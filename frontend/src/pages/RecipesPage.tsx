/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChefHat,
  Clock,
  Coffee,
  Cookie,
  Flame,
  Plus,
  Sandwich,
  Search,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import PreferencesSheet from "@/components/recipes/PreferencesSheet";
import RecipeDetailSheet from "@/components/recipes/RecipeDetailSheet";
import RecipeSheet from "@/components/recipes/RecipeSheet";
import { indexItems } from "@/lib/grocery";
import { press, spring, tap } from "@/lib/motion";
import { perServingNutrition } from "@/lib/recipe";
import { useGroceryStore } from "@/store/groceryStore";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";
import { useRecipeStore } from "@/store/recipeStore";
import type { MealType } from "@/types/meal";
import type { Recipe } from "@/types/recipe";

const SLOT_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const CATEGORIES: { slot: MealType | null; label: string; icon: LucideIcon }[] = [
  { slot: null, label: "All", icon: Utensils },
  { slot: "breakfast", label: "Breakfast", icon: Coffee },
  { slot: "lunch", label: "Lunch", icon: Sandwich },
  { slot: "dinner", label: "Dinner", icon: UtensilsCrossed },
  { slot: "snack", label: "Snack", icon: Cookie },
];

export default function RecipesPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const items = indexItems(groceryItems);

  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSlot, setActiveSlot] = useState<MealType | null>(null);

  // Search + category filtering over the recipe library.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const matchesSlot = !activeSlot || (r.mealTypes ?? []).includes(activeSlot);
      return matchesQuery && matchesSlot;
    });
  }, [recipes, q, activeSlot]);

  // Consume a "jump to this recipe" intent from a linked task.
  const pendingRecipeId = useRecipeFocusStore((s) => s.pendingRecipeId);
  const clearRecipeFocus = useRecipeFocusStore((s) => s.clear);
  useEffect(() => {
    if (!pendingRecipeId) return;
    const target = recipes.find((r) => r.id === pendingRecipeId);
    if (target) setDetailRecipe(target);
    clearRecipeFocus();
  }, [pendingRecipeId, recipes, clearRecipeFocus]);

  const kcalOf = (recipe: Recipe) => perServingNutrition(recipe, items).calories;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- Search + new recipe ---------- */}
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-surface-alt px-3.5 py-3">
          <Search size={18} className="text-fg-faint shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search healthy recipes…"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none"
          />
        </div>
        <motion.button
          onClick={() => setAddOpen(true)}
          whileTap={tap}
          aria-label="New recipe"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-inverse text-fg-inverse"
        >
          <Plus size={22} />
        </motion.button>
      </div>

      {/* ---------- Category filter ---------- */}
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map(({ slot, label, icon: Icon }) => {
            const active = activeSlot === slot;
            return (
              <motion.button
                key={label}
                onClick={() => setActiveSlot(slot)}
                whileTap={tap}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${
                  active ? "bg-surface-inverse text-fg-inverse" : "bg-surface-alt text-fg-muted"
                }`}
              >
                <Icon size={15} />
                {label}
              </motion.button>
            );
          })}
        </div>

        {/* ---------- Recipe cards ---------- */}
        {recipes.length === 0 ? (
          <EmptyState onNew={() => setAddOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
              <Search size={20} className="text-fg-faint" />
            </div>
            <p className="text-sm font-medium text-fg">No recipes match</p>
            <p className="text-center text-sm text-fg-faint">Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                kcal={kcalOf(recipe)}
                onClick={() => setDetailRecipe(recipe)}
              />
            ))}
          </div>
        )}
      </div>

      <RecipeDetailSheet
        recipe={detailRecipe}
        onClose={() => setDetailRecipe(null)}
        onEdit={(recipe) => {
          setDetailRecipe(null);
          setEditRecipe(recipe);
        }}
      />

      <RecipeSheet
        isOpen={addOpen || !!editRecipe}
        editRecipe={editRecipe}
        onClose={() => {
          setAddOpen(false);
          setEditRecipe(null);
        }}
      />

      <PreferencesSheet isOpen={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}

function RecipeCard({
  recipe,
  kcal,
  onClick,
}: {
  recipe: Recipe;
  kcal: number;
  onClick: () => void;
}) {
  const slot = recipe.mealTypes?.[0];
  const meta =
    recipe.ingredients.length === 1 ? "1 ingredient" : `${recipe.ingredients.length} ingredients`;

  return (
    <motion.button
      onClick={onClick}
      whileTap={press}
      transition={spring.snappy}
      className="relative aspect-square w-full overflow-hidden rounded-3xl text-left shadow-card"
      style={{ backgroundColor: recipe.color }}
    >
      {recipe.image ? (
        <img src={recipe.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          {/* Depth + a decorative chef-hat watermark */}
          <div className="absolute inset-0 bg-linear-to-br from-white/15 to-black/25" />
          <ChefHat
            size={104}
            strokeWidth={1.5}
            className="absolute -right-5 -top-5 text-white/20"
          />
        </>
      )}

      {/* kcal badge */}
      {kcal > 0 && (
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 backdrop-blur-sm">
          <Flame size={12} className="text-white" />
          <span className="text-xs font-semibold text-white">{kcal} kcal</span>
        </span>
      )}

      {/* time pill */}
      {recipe.timeMin ? (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 backdrop-blur-sm">
          <Clock size={12} className="text-white" />
          <span className="text-xs font-semibold text-white">{recipe.timeMin} min</span>
        </span>
      ) : null}

      {/* title block over a legibility scrim */}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/30 to-transparent p-3.5 pt-8">
        {slot && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
            {SLOT_LABEL[slot]}
          </p>
        )}
        <p className="truncate text-base font-bold leading-tight text-white">{recipe.name}</p>
        <p className="mt-0.5 truncate text-xs text-white/75">{meta}</p>
      </div>
    </motion.button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised">
        <ChefHat size={24} className="text-fg-faint" />
      </div>
      <p className="text-base font-medium text-fg">No recipes yet</p>
      <p className="max-w-xs text-center text-sm text-fg-faint">
        Create a recipe with its ingredients and steps, then link it to a cooking task or use it
        when logging a meal.
      </p>
      <motion.button
        onClick={onNew}
        whileTap={tap}
        className="mt-1 flex items-center gap-1.5 rounded-full bg-surface-inverse px-4 py-2.5 text-sm font-medium text-fg-inverse"
      >
        <Plus size={16} />
        New recipe
      </motion.button>
    </div>
  );
}
