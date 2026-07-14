import type { Nutrition, Unit } from "./nutritions";
import { addNutrition, emptyNutrition } from "./nutritions";
import type { GroceryItem } from "@/types/grocery";
import type { Meal } from "@/types/meal";
import type { ShoppingList } from "@/types/shopping";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// "$4.75" — the app-wide currency format.
export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

// Scale a catalog item's nutrition by a multiplier — e.g. 2 packs of an item,
// or 0.4 of a serving in a meal. This is what lets a single catalog entry feed
// both a shopping trip and a meal at different amounts.
export function scaleNutrition(n: Nutrition, factor: number): Nutrition {
  const f = isFinite(factor) && factor > 0 ? factor : 0;
  return {
    calories: Math.round(n.calories * f),
    protein: round1(n.protein * f),
    fat: round1(n.fat * f),
    carbs: round1(n.carbs * f),
    sugar: round1(n.sugar * f),
    fiber: round1(n.fiber * f),
  };
}

// Build an id -> item lookup so list/meal rollups don't scan the catalog each line.
export function indexItems(items: GroceryItem[]): Record<string, GroceryItem> {
  const map: Record<string, GroceryItem> = {};
  for (const it of items) map[it.id] = it;
  return map;
}

export function lineCost(item: GroceryItem | undefined, qty: number): number {
  if (!item) return 0;
  return round2(item.price * qty);
}

export function lineNutrition(item: GroceryItem | undefined, qty: number): Nutrition {
  if (!item) return emptyNutrition();
  return scaleNutrition(item.nutrition, qty);
}

// Human-readable amount for a line/component, scaled by its multiplier.
export function formatAmount(item: GroceryItem | undefined, multiplier: number): string {
  if (!item) return "";
  const qty = round1(item.quantity * multiplier);
  return formatUnit(qty, item.unit);
}

export function formatUnit(quantity: number, unit: Unit): string {
  if (unit === "unit") return `${quantity} ${quantity === 1 ? "pc" : "pcs"}`;
  return `${quantity} ${unit}`;
}

export interface ListTotals {
  count: number;
  cost: number;
  nutrition: Nutrition;
}

// Roll up a shopping list against the catalog. `onlyChecked` sums just the
// ticked lines — i.e. what you're actually buying on this trip.
export function listTotals(
  list: ShoppingList,
  items: Record<string, GroceryItem>,
  onlyChecked = false
): ListTotals {
  const lines = onlyChecked ? list.lines.filter((l) => l.checked) : list.lines;
  let cost = 0;
  let nutrition = emptyNutrition();
  for (const line of lines) {
    const item = items[line.itemId];
    cost += lineCost(item, line.qty);
    nutrition = addNutrition(nutrition, lineNutrition(item, line.qty));
  }
  return { count: lines.length, cost: round2(cost), nutrition };
}

// Total nutrition for a single meal — the diet contribution of what was eaten.
export function mealNutrition(meal: Meal, items: Record<string, GroceryItem>): Nutrition {
  let nutrition = emptyNutrition();
  for (const c of meal.components) {
    nutrition = addNutrition(nutrition, lineNutrition(items[c.itemId], c.servings));
  }
  return nutrition;
}

// Total nutrition consumed across a set of meals (e.g. one day's diet).
export function dayNutrition(meals: Meal[], items: Record<string, GroceryItem>): Nutrition {
  let nutrition = emptyNutrition();
  for (const m of meals) nutrition = addNutrition(nutrition, mealNutrition(m, items));
  return nutrition;
}
