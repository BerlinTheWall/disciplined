import type { FoodCategoryKey } from "./foodCategories";

export interface Nutrition {
  calories: number; // kcal
  protein: number; // g
  fat: number; // g
  carbs: number; // g
  sugar: number; // g
  fiber: number; // g
}

export type Unit = "g" | "kg" | "unit" | "ml" | "l";

export const UNITS: Unit[] = ["g", "kg", "unit", "ml", "l"];

// A nutrition profile expressed per 100 g, plus an assumed grams-per-unit used
// when the quantity is counted in pieces rather than weighed.
interface Profile extends Nutrition {
  gramsPerUnit: number;
}

// Per-category baseline (rough averages per 100 g). Used when the item name
// doesn't match anything in KNOWN_ITEMS. Values are approximate by design —
// they're a starting estimate the user can tweak.
const CATEGORY_BASELINE: Record<FoodCategoryKey, Profile> = {
  protein: { calories: 165, protein: 26, fat: 6, carbs: 1, sugar: 0, fiber: 0, gramsPerUnit: 120 },
  dairy: { calories: 120, protein: 8, fat: 7, carbs: 6, sugar: 6, fiber: 0, gramsPerUnit: 200 },
  vegetable: {
    calories: 35,
    protein: 2,
    fat: 0.3,
    carbs: 7,
    sugar: 3,
    fiber: 2.5,
    gramsPerUnit: 100,
  },
  fruit: {
    calories: 55,
    protein: 0.7,
    fat: 0.2,
    carbs: 14,
    sugar: 10,
    fiber: 2.4,
    gramsPerUnit: 150,
  },
  grain: { calories: 250, protein: 8, fat: 2, carbs: 50, sugar: 3, fiber: 4, gramsPerUnit: 60 },
  fat: { calories: 620, protein: 15, fat: 55, carbs: 15, sugar: 4, fiber: 5, gramsPerUnit: 15 },
  snack: { calories: 480, protein: 6, fat: 24, carbs: 60, sugar: 25, fiber: 3, gramsPerUnit: 40 },
  beverage: { calories: 40, protein: 0, fat: 0, carbs: 10, sugar: 9, fiber: 0, gramsPerUnit: 330 },
  other: { calories: 120, protein: 4, fat: 4, carbs: 16, sugar: 6, fiber: 1, gramsPerUnit: 100 },
};

// Common items override the category baseline when their name appears in the
// grocery item's name (e.g. "organic banana" matches "banana").
interface KnownItem extends Profile {
  category: FoodCategoryKey;
}

const KNOWN_ITEMS: Record<string, KnownItem> = {
  "chicken breast": {
    category: "protein",
    calories: 165,
    protein: 31,
    fat: 3.6,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 170,
  },
  chicken: {
    category: "protein",
    calories: 215,
    protein: 27,
    fat: 11,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 170,
  },
  beef: {
    category: "protein",
    calories: 250,
    protein: 26,
    fat: 15,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 150,
  },
  salmon: {
    category: "protein",
    calories: 208,
    protein: 20,
    fat: 13,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 150,
  },
  tofu: {
    category: "protein",
    calories: 76,
    protein: 8,
    fat: 4.8,
    carbs: 1.9,
    sugar: 0.6,
    fiber: 0.3,
    gramsPerUnit: 100,
  },
  egg: {
    category: "protein",
    calories: 143,
    protein: 13,
    fat: 9.5,
    carbs: 1.1,
    sugar: 1.1,
    fiber: 0,
    gramsPerUnit: 50,
  },
  milk: {
    category: "dairy",
    calories: 61,
    protein: 3.2,
    fat: 3.3,
    carbs: 4.8,
    sugar: 5,
    fiber: 0,
    gramsPerUnit: 240,
  },
  yogurt: {
    category: "dairy",
    calories: 97,
    protein: 9,
    fat: 5,
    carbs: 4,
    sugar: 4,
    fiber: 0,
    gramsPerUnit: 170,
  },
  cheese: {
    category: "dairy",
    calories: 402,
    protein: 25,
    fat: 33,
    carbs: 1.3,
    sugar: 0.5,
    fiber: 0,
    gramsPerUnit: 30,
  },
  butter: {
    category: "fat",
    calories: 717,
    protein: 0.9,
    fat: 81,
    carbs: 0.1,
    sugar: 0.1,
    fiber: 0,
    gramsPerUnit: 14,
  },
  banana: {
    category: "fruit",
    calories: 89,
    protein: 1.1,
    fat: 0.3,
    carbs: 23,
    sugar: 12,
    fiber: 2.6,
    gramsPerUnit: 120,
  },
  apple: {
    category: "fruit",
    calories: 52,
    protein: 0.3,
    fat: 0.2,
    carbs: 14,
    sugar: 10,
    fiber: 2.4,
    gramsPerUnit: 180,
  },
  orange: {
    category: "fruit",
    calories: 47,
    protein: 0.9,
    fat: 0.1,
    carbs: 12,
    sugar: 9,
    fiber: 2.4,
    gramsPerUnit: 130,
  },
  berries: {
    category: "fruit",
    calories: 57,
    protein: 0.7,
    fat: 0.3,
    carbs: 14,
    sugar: 10,
    fiber: 2.4,
    gramsPerUnit: 100,
  },
  rice: {
    category: "grain",
    calories: 130,
    protein: 2.7,
    fat: 0.3,
    carbs: 28,
    sugar: 0.1,
    fiber: 0.4,
    gramsPerUnit: 50,
  },
  oats: {
    category: "grain",
    calories: 389,
    protein: 17,
    fat: 7,
    carbs: 66,
    sugar: 1,
    fiber: 11,
    gramsPerUnit: 40,
  },
  bread: {
    category: "grain",
    calories: 265,
    protein: 9,
    fat: 3.2,
    carbs: 49,
    sugar: 5,
    fiber: 2.7,
    gramsPerUnit: 30,
  },
  pasta: {
    category: "grain",
    calories: 131,
    protein: 5,
    fat: 1.1,
    carbs: 25,
    sugar: 0.6,
    fiber: 1.8,
    gramsPerUnit: 60,
  },
  broccoli: {
    category: "vegetable",
    calories: 34,
    protein: 2.8,
    fat: 0.4,
    carbs: 7,
    sugar: 1.7,
    fiber: 2.6,
    gramsPerUnit: 90,
  },
  spinach: {
    category: "vegetable",
    calories: 23,
    protein: 2.9,
    fat: 0.4,
    carbs: 3.6,
    sugar: 0.4,
    fiber: 2.2,
    gramsPerUnit: 30,
  },
  potato: {
    category: "vegetable",
    calories: 77,
    protein: 2,
    fat: 0.1,
    carbs: 17,
    sugar: 0.8,
    fiber: 2.1,
    gramsPerUnit: 170,
  },
  tomato: {
    category: "vegetable",
    calories: 18,
    protein: 0.9,
    fat: 0.2,
    carbs: 3.9,
    sugar: 2.6,
    fiber: 1.2,
    gramsPerUnit: 120,
  },
  almonds: {
    category: "fat",
    calories: 579,
    protein: 21,
    fat: 50,
    carbs: 22,
    sugar: 4,
    fiber: 12,
    gramsPerUnit: 28,
  },
  "peanut butter": {
    category: "fat",
    calories: 588,
    protein: 25,
    fat: 50,
    carbs: 20,
    sugar: 9,
    fiber: 6,
    gramsPerUnit: 32,
  },
  "olive oil": {
    category: "fat",
    calories: 884,
    protein: 0,
    fat: 100,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 14,
  },
  chocolate: {
    category: "snack",
    calories: 535,
    protein: 7.6,
    fat: 30,
    carbs: 59,
    sugar: 48,
    fiber: 7,
    gramsPerUnit: 40,
  },
  chips: {
    category: "snack",
    calories: 536,
    protein: 7,
    fat: 35,
    carbs: 53,
    sugar: 0.6,
    fiber: 4.4,
    gramsPerUnit: 50,
  },
  juice: {
    category: "beverage",
    calories: 45,
    protein: 0.5,
    fat: 0.1,
    carbs: 11,
    sugar: 9,
    fiber: 0.2,
    gramsPerUnit: 250,
  },
  soda: {
    category: "beverage",
    calories: 41,
    protein: 0,
    fat: 0,
    carbs: 11,
    sugar: 11,
    fiber: 0,
    gramsPerUnit: 330,
  },
  coffee: {
    category: "beverage",
    calories: 2,
    protein: 0.1,
    fat: 0,
    carbs: 0,
    sugar: 0,
    fiber: 0,
    gramsPerUnit: 240,
  },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function emptyNutrition(): Nutrition {
  return { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, fiber: 0 };
}

function findKnownItem(name: string): KnownItem | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const key of Object.keys(KNOWN_ITEMS)) {
    if (n.includes(key)) return KNOWN_ITEMS[key];
  }
  return null;
}

// Suggest a food category from a typed name (used to auto-select while typing).
export function suggestCategory(name: string): FoodCategoryKey | null {
  return findKnownItem(name)?.category ?? null;
}

// The grams (≈ ml) an amount comes to — the basis every per-100g figure scales
// against. Null for counted units, where no weight is implied on its own.
export function amountInBase(quantity: number, unit: Unit): number | null {
  if (!isFinite(quantity) || quantity <= 0) return null;
  switch (unit) {
    case "g":
    case "ml":
      return quantity;
    case "kg":
    case "l":
      return quantity * 1000;
    case "unit":
      return null;
  }
}

function toGrams(quantity: number, unit: Unit, gramsPerUnit: number): number {
  switch (unit) {
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "ml":
      return quantity; // approx 1 g per ml
    case "l":
      return quantity * 1000;
    case "unit":
      return quantity * gramsPerUnit;
  }
}

export function estimateNutrition(
  name: string,
  category: FoodCategoryKey,
  quantity: number,
  unit: Unit
): Nutrition {
  const known = findKnownItem(name);
  const profile: Profile = known ?? CATEGORY_BASELINE[category];
  const grams = toGrams(
    isFinite(quantity) && quantity > 0 ? quantity : 0,
    unit,
    profile.gramsPerUnit
  );
  const factor = grams / 100;
  return {
    calories: Math.round(profile.calories * factor),
    protein: round1(profile.protein * factor),
    fat: round1(profile.fat * factor),
    carbs: round1(profile.carbs * factor),
    sugar: round1(profile.sugar * factor),
    fiber: round1(profile.fiber * factor),
  };
}

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    calories: a.calories + b.calories,
    protein: round1(a.protein + b.protein),
    fat: round1(a.fat + b.fat),
    carbs: round1(a.carbs + b.carbs),
    sugar: round1(a.sugar + b.sugar),
    fiber: round1(a.fiber + b.fiber),
  };
}

// Field metadata for rendering nutrition inputs/chips in a consistent order.
export const NUTRITION_FIELDS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
];
