import { motion } from "framer-motion";
import { AlertCircle, Check, ChefHat, Clock, CookingPot, Pencil, Users, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { isLightColor } from "@/lib/color";
import { FALLBACK_FOOD_ICON, FOOD_CATEGORIES } from "@/lib/foodCategories";
import { indexItems } from "@/lib/grocery";
import { tap } from "@/lib/motion";
import { perServingNutrition, recipeAvailability, requiredAmount } from "@/lib/recipe";
import { useGroceryStore } from "@/store/groceryStore";
import type { Recipe } from "@/types/recipe";
import BottomSheet from "../BottomSheet";

interface RecipeDetailSheetProps {
  recipe: Recipe | null;
  onClose: () => void;
  onEdit: (recipe: Recipe) => void;
}

export default function RecipeDetailSheet({ recipe, onClose, onEdit }: RecipeDetailSheetProps) {
  const [groceryItems, adjustStock] = useGroceryStore(
    useShallow((state) => [state.groceryItems, state.adjustStock])
  );
  const items = indexItems(groceryItems);

  const availability = recipe ? recipeAvailability(recipe, items) : null;

  // Cook the recipe: deduct each ingredient's required amount from on-hand stock.
  function cook() {
    if (!recipe) return;
    for (const ing of recipe.ingredients) {
      const item = items[ing.itemId];
      if (item) adjustStock(item.id, -requiredAmount(item, ing.servings));
    }
  }

  const isOpen = !!recipe;
  const color = recipe?.color ?? "#000";
  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const headerBtn = {
    backgroundColor: isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)",
    color: onColor,
  };
  const perServing = recipe ? perServingNutrition(recipe, items) : null;

  // With a cover photo the header becomes the photo under a dark scrim, so the
  // chrome flips to white regardless of the accent color.
  const hasImage = !!recipe?.image;
  const headerFg = hasImage ? "#ffffff" : onColor;
  const headerBtnStyle = hasImage
    ? { backgroundColor: "rgba(0,0,0,0.4)", color: "#ffffff" }
    : headerBtn;
  const headerMeta = hasImage
    ? "rgba(255,255,255,0.85)"
    : isLightColor(color)
      ? "rgba(17,24,39,0.7)"
      : "rgba(255,255,255,0.85)";

  return (
    <BottomSheet
      isOpen={!!(isOpen && recipe)}
      onClose={onClose}
      className="bg-surface max-h-[92vh] overflow-y-auto"
    >
      {isOpen && recipe && (
        <>
          {/* Header — cover photo, falling back to the accent color */}
          <div
            className={`relative flex flex-col overflow-hidden px-4 pt-3 pb-5 rounded-t-2xl ${
              hasImage ? "min-h-52" : ""
            }`}
            style={hasImage ? undefined : { backgroundColor: color }}
          >
            {hasImage && (
              <>
                <img
                  src={recipe.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40" />
              </>
            )}

            <div className="relative flex items-center justify-between">
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={headerBtnStyle}
              >
                <X size={20} />
              </motion.button>
              <motion.button
                onClick={() => onEdit(recipe)}
                whileTap={tap}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium"
                style={headerBtnStyle}
              >
                <Pencil size={15} />
                Edit
              </motion.button>
            </div>
            <div
              className={`relative flex items-center gap-4 ${hasImage ? "mt-auto pt-6" : "mt-3"}`}
            >
              {!hasImage && (
                <div
                  className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#2f2f33" }}
                >
                  <ChefHat size={28} style={{ color }} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-2xl font-bold truncate" style={{ color: headerFg }}>
                  {recipe.name}
                </h2>
                <div className="flex items-center gap-3 mt-0.5" style={{ color: headerMeta }}>
                  <span className="flex items-center gap-1 text-sm">
                    <Users size={14} />
                    {recipe.servings} servings
                  </span>
                  {recipe.timeMin && (
                    <span className="flex items-center gap-1 text-sm">
                      <Clock size={14} />
                      {recipe.timeMin} min
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 pb-8">
            {recipe.description && (
              <p className="text-sm text-fg-muted mb-5">{recipe.description}</p>
            )}

            {/* Per-serving nutrition */}
            {perServing && perServing.calories > 0 && (
              <div className="rounded-2xl bg-surface-feature text-white p-4 mb-5">
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                  Per serving
                </p>
                <p className="text-2xl font-bold mt-0.5">
                  {perServing.calories}
                  <span className="text-sm font-medium text-gray-500"> kcal</span>
                </p>
                <div className="flex gap-2 mt-3">
                  <Macro label="Protein" value={`${perServing.protein}g`} />
                  <Macro label="Fat" value={`${perServing.fat}g`} />
                  <Macro label="Carbs" value={`${perServing.carbs}g`} />
                </div>
              </div>
            )}

            {/* Ingredients + availability */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-fg">Ingredients</h3>
              {availability && recipe.ingredients.length > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium ${availability.canCook ? "text-emerald-500" : "text-amber-500"}`}
                >
                  {availability.canCook ? (
                    <>
                      <Check size={13} /> You have everything
                    </>
                  ) : (
                    <>
                      <AlertCircle size={13} /> Missing {availability.missingCount}
                    </>
                  )}
                </span>
              )}
            </div>
            {recipe.ingredients.length === 0 ? (
              <p className="text-sm text-fg-faint mb-5">No ingredients listed.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {availability!.ingredients.map((a) => {
                  const ing = a.ingredient;
                  if (a.missingFromCatalog) {
                    return (
                      <div
                        key={ing.itemId}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt"
                      >
                        <span className="w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center shrink-0">
                          <AlertCircle size={15} className="text-fg-faint" />
                        </span>
                        <p className="flex-1 text-sm text-fg-faint">
                          Item no longer in your pantry
                        </p>
                      </div>
                    );
                  }
                  const item = a.item!;
                  const cat = FOOD_CATEGORIES[item.category];
                  const Icon = cat.icon ?? FALLBACK_FOOD_ICON;
                  return (
                    <div
                      key={ing.itemId}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-surface-alt"
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        <Icon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-fg leading-tight truncate">{item.name}</p>
                        <p className="text-xs text-fg-faint">
                          Need {a.requiredLabel} · have {a.haveLabel}
                        </p>
                      </div>
                      <span className="shrink-0">
                        {a.enough ? (
                          <Check size={18} className="text-emerald-500" />
                        ) : (
                          <span className="text-xs font-medium text-amber-500">short</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cook — consumes ingredients from your stock */}
            {recipe.ingredients.length > 0 && (
              <motion.button
                onClick={cook}
                whileTap={availability!.canCook ? tap : undefined}
                disabled={!availability!.canCook}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-medium mb-6 disabled:opacity-40"
                style={{ backgroundColor: color, color: onColor }}
              >
                <CookingPot size={18} />
                {availability!.canCook ? "Cook — use up ingredients" : "Not enough in stock"}
              </motion.button>
            )}

            {/* Steps */}
            {recipe.steps.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-fg mb-2">Steps</h3>
                <div className="flex flex-col gap-3">
                  {recipe.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ backgroundColor: color, color: onColor }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-sm text-fg leading-relaxed pt-0.5">{step}</p>
                    </div>
                  ))}
                </div>
              </>
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
