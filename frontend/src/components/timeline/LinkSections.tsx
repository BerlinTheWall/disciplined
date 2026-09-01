import { motion } from "framer-motion";
import { ArrowUpRight, ChefHat } from "lucide-react";

import { chipCls } from "./addItemOptions";
import { formatAmount, indexItems } from "@/lib/grocery";
import { tap } from "@/lib/motion";
import { useGroceryStore } from "@/store/groceryStore";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";
import { useRecipeStore } from "@/store/recipeStore";
import Collapse from "../Collapse";

// The "link a recipe" picker of the add/edit sheet: a chip row to choose the
// linked recipe plus a collapsible preview of what it contains. Renders
// nothing when there are no recipes. `onSheetClose` closes the hosting sheet
// when the user jumps to the linked page.

export function RecipeLinkSection({
  recipeId,
  onLink,
  color,
  onSheetClose,
}: {
  recipeId: string | undefined;
  onLink: (id: string | undefined) => void;
  color: string;
  onSheetClose: () => void;
}) {
  const recipes = useRecipeStore((s) => s.recipes);
  const openRecipe = useRecipeFocusStore((s) => s.openRecipe);
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const catalog = indexItems(groceryItems);
  const linkedRecipe = recipes.find((r) => r.id === recipeId);

  if (recipes.length === 0) return null;

  return (
    <div>
      <label className="text-xs font-medium text-fg-muted mb-2 flex items-center gap-1.5">
        <ChefHat size={13} />
        Link a recipe (optional)
      </label>
      <div className="wheel-col flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <motion.button
          onClick={() => onLink(undefined)}
          whileTap={tap}
          className={chipCls(!recipeId)}
        >
          None
        </motion.button>
        {recipes.map((r) => (
          <motion.button
            key={r.id}
            onClick={() => onLink(r.id)}
            whileTap={tap}
            className={`flex items-center gap-1.5 ${chipCls(recipeId === r.id)}`}
          >
            <ChefHat size={14} />
            {r.name}
          </motion.button>
        ))}
      </div>

      <Collapse open={!!linkedRecipe}>
        {linkedRecipe && (
          <div className="mt-3 rounded-2xl bg-surface-alt p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-fg-muted">What to make</p>
              <motion.button
                onClick={() => {
                  openRecipe(linkedRecipe.id);
                  onSheetClose();
                }}
                whileTap={tap}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color }}
              >
                Open in Recipes
                <ArrowUpRight size={14} />
              </motion.button>
            </div>

            {linkedRecipe.ingredients.length > 0 && (
              <p className="text-sm text-fg mb-2">
                {linkedRecipe.ingredients
                  .map((ing) => {
                    const item = catalog[ing.itemId];
                    if (!item) return null;
                    return `${item.name} (${formatAmount(item, ing.servings)})`;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}

            {linkedRecipe.steps.length === 0 ? (
              <p className="text-sm text-fg-faint">No steps added to this recipe yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {linkedRecipe.steps.map((step, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="text-xs text-fg-faint tabular-nums shrink-0 w-4">
                      {i + 1}.
                    </span>
                    <p className="text-sm text-fg leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Collapse>
    </div>
  );
}
