import { CALORIE_GOAL } from "./goals";
import { perServingNutrition, recipeAvailability } from "./recipe";
import type { GroceryItem } from "@/types/grocery";
import type { Meal, MealType } from "@/types/meal";
import type { Preferences } from "@/types/preferences";
import type { Recipe } from "@/types/recipe";

// Rough share of the daily calorie budget each slot is expected to cover, used
// to judge how well a recipe's per-serving calories "fit" a slot.
const SLOT_CALORIE_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.1,
};

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  reason: string; // short human explanation of why it's suggested
}

function norm(tags: string[] | undefined): string[] {
  return (tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
}

// How often this recipe has been logged in the given slot in the past — the
// implicit "you tend to eat this for breakfast" signal.
function slotAffinity(recipe: Recipe, meals: Meal[], slot: MealType): number {
  return meals.filter((m) => m.recipeId === recipe.id && m.type === slot).length;
}

// Score a single recipe for a slot. Returns null when the recipe is excluded
// outright (violates a preference), so it never surfaces.
function scoreRecipe(
  recipe: Recipe,
  slot: MealType,
  meals: Meal[],
  items: Record<string, GroceryItem>,
  prefs: Preferences,
  remainingCalories: number,
  eatenTodayRecipeIds: Set<string>
): ScoredRecipe | null {
  const tags = norm(recipe.tags);

  // Hard filters: avoided tags and too-slow recipes are never suggested.
  const avoid = norm(prefs.avoidTags);
  if (avoid.some((a) => tags.includes(a))) return null;
  if (prefs.maxCookMinutes && recipe.timeMin && recipe.timeMin > prefs.maxCookMinutes) {
    return null;
  }

  let score = 1; // small base so every eligible recipe can appear on a cold start
  const reasons: string[] = [];

  // Slot fit — explicit tag, then learned history.
  if (recipe.mealTypes?.includes(slot)) {
    score += 4;
    reasons.push(`Great for ${slot}`);
  }
  const affinity = slotAffinity(recipe, meals, slot);
  if (affinity > 0) {
    score += Math.min(affinity, 3) * 1.5;
    reasons.push("You eat this often");
  }

  // Preference fit — liked tags boost.
  const liked = norm(prefs.likedTags);
  const likedHits = tags.filter((t) => liked.includes(t));
  if (likedHits.length > 0) {
    score += likedHits.length * 2;
    reasons.push(`Matches ${likedHits[0]}`);
  }

  // Availability — can you cook it right now?
  const avail = recipeAvailability(recipe, items);
  if (avail.canCook) {
    score += 3;
    reasons.push("You have everything");
  } else if (avail.missingCount <= 2 && recipe.ingredients.length > 0) {
    score += 1;
    reasons.push(`Missing ${avail.missingCount}`);
  }

  // Calorie fit — how close per-serving calories are to this slot's share of
  // whatever budget is left for the day.
  const kcal = perServingNutrition(recipe, items).calories;
  if (kcal > 0 && remainingCalories > 0) {
    const target = Math.max(remainingCalories, CALORIE_GOAL) * SLOT_CALORIE_SHARE[slot];
    const closeness = 1 - Math.min(Math.abs(kcal - target) / target, 1);
    score += closeness * 2;
    if (closeness > 0.6) reasons.push("Fits your budget");
  }

  // Freshness — don't recommend something already eaten today.
  if (eatenTodayRecipeIds.has(recipe.id)) score -= 3;

  return {
    recipe,
    score,
    reason: reasons.slice(0, 2).join(" · ") || "Worth a try",
  };
}

// Top suggestions for a single meal slot, best first.
export function suggestForSlot(
  slot: MealType,
  recipes: Recipe[],
  meals: Meal[],
  items: Record<string, GroceryItem>,
  prefs: Preferences,
  remainingCalories: number,
  eatenTodayRecipeIds: Set<string>,
  limit = 3
): ScoredRecipe[] {
  return recipes
    .map((r) => scoreRecipe(r, slot, meals, items, prefs, remainingCalories, eatenTodayRecipeIds))
    .filter((s): s is ScoredRecipe => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
