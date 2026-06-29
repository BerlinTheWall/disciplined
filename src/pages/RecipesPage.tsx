/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, ChevronRight, Plus } from "lucide-react";

import RecipeDetailSheet from "@/components/recipes/RecipeDetailSheet";
import RecipeSheet from "@/components/recipes/RecipeSheet";
import { indexItems } from "@/lib/grocery";
import { press, spring, tap } from "@/lib/motion";
import { recipeSummary } from "@/lib/recipe";
import { useGroceryStore } from "@/store/groceryStore";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";
import { useRecipeStore } from "@/store/recipeStore";
import type { Recipe } from "@/types/recipe";

function isLightColor(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

export default function RecipesPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const items = indexItems(groceryItems);

  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Consume a "jump to this recipe" intent from a linked task.
  const pendingRecipeId = useRecipeFocusStore((s) => s.pendingRecipeId);
  const clearRecipeFocus = useRecipeFocusStore((s) => s.clear);
  useEffect(() => {
    if (!pendingRecipeId) return;
    const target = recipes.find((r) => r.id === pendingRecipeId);
    if (target) setDetailRecipe(target);
    clearRecipeFocus();
  }, [pendingRecipeId, recipes, clearRecipeFocus]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-fg">Your recipes</h2>
        <motion.button
          onClick={() => setAddOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm text-fg-muted"
        >
          <Plus size={15} />
          New recipe
        </motion.button>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
            <ChefHat size={24} className="text-fg-faint" />
          </div>
          <p className="text-base font-medium text-fg">No recipes yet</p>
          <p className="text-sm text-fg-faint text-center">
            Create a recipe with its ingredients and steps, then link it to a cooking task or use it
            when logging a meal.
          </p>
        </div>
      ) : (
        recipes.map((recipe) => (
          <motion.button
            key={recipe.id}
            onClick={() => setDetailRecipe(recipe)}
            whileTap={press}
            transition={spring.snappy}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-alt text-left w-full"
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: recipe.color,
                color: isLightColor(recipe.color) ? "#111827" : "#fff",
              }}
            >
              <ChefHat size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-fg leading-tight truncate">{recipe.name}</p>
              <p className="text-xs text-fg-faint mt-1 truncate">{recipeSummary(recipe, items)}</p>
            </div>
            <ChevronRight size={18} className="text-fg-faint shrink-0" />
          </motion.button>
        ))
      )}

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
    </div>
  );
}
