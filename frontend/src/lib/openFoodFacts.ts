import type { FoodCategoryKey } from "./foodCategories";
import type { Nutrition, Unit } from "./nutritions";

// Barcode → product lookup against Open Food Facts (free, no API key, CORS
// enabled). The response is mapped straight onto the app's GroceryItem fields:
// the reference amount becomes the package size when OFF knows it (that's the
// "1" that shopping lines and meals scale from), else 100 g, with nutrition
// scaled to that amount. Kept free of React/store imports so it can be
// exercised on its own.

export interface ScannedProduct {
  name: string;
  category: FoodCategoryKey | null; // null = no confident mapping
  quantity: number;
  unit: Unit;
  // null = OFF has no per-100g nutrition for this product; leave the app's
  // own estimator in charge instead of writing zeros.
  nutrition: Nutrition | null;
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  nutriments?: Record<string, number | string | undefined>;
  pnns_groups_1?: string;
  pnns_groups_2?: string;
  categories_tags?: string[];
}

const FIELDS = [
  "product_name",
  "brands",
  // OFF quirk: product_quantity comes back null unless the raw `quantity`
  // string is requested alongside it.
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "nutriments",
  "pnns_groups_1",
  "pnns_groups_2",
  "categories_tags",
].join(",");

const LOOKUP_TIMEOUT_MS = 10_000;

// Open Food Facts' top-level food groups (pnns_groups_1) → app category.
// "Fruits and vegetables" is resolved via pnns_groups_2 below.
const PNNS_TO_CATEGORY: Record<string, FoodCategoryKey> = {
  beverages: "beverage",
  "cereals and potatoes": "grain",
  "fish meat eggs": "protein",
  "milk and dairy products": "dairy",
  "fat and sauces": "fat",
  "salty snacks": "snack",
  "sugary snacks": "snack",
};

// Fallback keyword scan over categories_tags (entries like "en:orange-juices").
// Order matters: first hit wins, so the more specific words come first.
const TAG_KEYWORDS: [string, FoodCategoryKey][] = [
  ["juice", "beverage"],
  ["beverage", "beverage"],
  ["water", "beverage"],
  ["cheese", "dairy"],
  ["yogurt", "dairy"],
  ["milk", "dairy"],
  ["dairy", "dairy"],
  ["meat", "protein"],
  ["fish", "protein"],
  ["seafood", "protein"],
  ["egg", "protein"],
  ["poultry", "protein"],
  ["chocolate", "snack"],
  ["candy", "snack"],
  ["candies", "snack"],
  ["biscuit", "snack"],
  ["cookie", "snack"],
  ["chip", "snack"],
  ["snack", "snack"],
  ["bread", "grain"],
  ["cereal", "grain"],
  ["pasta", "grain"],
  ["rice", "grain"],
  ["grain", "grain"],
  ["oil", "fat"],
  ["butter", "fat"],
  ["margarine", "fat"],
  ["nut", "fat"],
  ["fruit", "fruit"],
  ["vegetable", "vegetable"],
];

function num(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return isFinite(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function mapCategory(p: OffProduct): FoodCategoryKey | null {
  const g1 = (p.pnns_groups_1 ?? "").toLowerCase();
  if (g1 === "fruits and vegetables") {
    return (p.pnns_groups_2 ?? "").toLowerCase().includes("fruit") ? "fruit" : "vegetable";
  }
  if (PNNS_TO_CATEGORY[g1]) return PNNS_TO_CATEGORY[g1];

  const tags = (p.categories_tags ?? []).join(" ").toLowerCase();
  for (const [word, category] of TAG_KEYWORDS) {
    if (tags.includes(word)) return category;
  }
  return null;
}

// Package size as a reference amount. OFF normalizes product_quantity to g/ml
// for most products; anything it can't express in the app's units falls back
// to 100 g (the per-100g basis the nutrition comes in).
function mapAmount(p: OffProduct): { quantity: number; unit: Unit } {
  const qty = num(p.product_quantity);
  if (qty === null || qty <= 0) return { quantity: 100, unit: "g" };
  switch ((p.product_quantity_unit ?? "g").toLowerCase()) {
    case "g":
      return { quantity: qty, unit: "g" };
    case "kg":
      return { quantity: qty, unit: "kg" };
    case "ml":
      return { quantity: qty, unit: "ml" };
    case "cl":
      return { quantity: qty * 10, unit: "ml" };
    case "l":
      return { quantity: qty, unit: "l" };
    default:
      return { quantity: 100, unit: "g" };
  }
}

// Grams (≈ ml) represented by the reference amount, for scaling per-100g values.
function amountInGrams(quantity: number, unit: Unit): number {
  switch (unit) {
    case "kg":
    case "l":
      return quantity * 1000;
    default:
      return quantity;
  }
}

function mapNutrition(p: OffProduct, grams: number): Nutrition | null {
  const n = p.nutriments ?? {};
  // OFF reports kcal directly or only energy in kJ, depending on the product.
  const kcal100 =
    num(n["energy-kcal_100g"]) ??
    (() => {
      const kj = num(n["energy_100g"]);
      return kj === null ? null : kj / 4.184;
    })();
  const protein100 = num(n["proteins_100g"]);
  const fat100 = num(n["fat_100g"]);
  const carbs100 = num(n["carbohydrates_100g"]);
  if (kcal100 === null && protein100 === null && fat100 === null && carbs100 === null) {
    return null;
  }
  const factor = grams / 100;
  return {
    calories: Math.round((kcal100 ?? 0) * factor),
    protein: round1((protein100 ?? 0) * factor),
    fat: round1((fat100 ?? 0) * factor),
    carbs: round1((carbs100 ?? 0) * factor),
    sugar: round1((num(n["sugars_100g"]) ?? 0) * factor),
    fiber: round1((num(n["fiber_100g"]) ?? 0) * factor),
  };
}

// Exported for direct testing; lookupBarcode is the fetch wrapper around it.
export function mapProduct(p: OffProduct): ScannedProduct {
  const { quantity, unit } = mapAmount(p);
  const brand = (p.brands ?? "").split(",")[0].trim();
  return {
    name: (p.product_name ?? "").trim() || brand,
    category: mapCategory(p),
    quantity,
    unit,
    nutrition: mapNutrition(p, amountInGrams(quantity, unit)),
  };
}

// Resolves to null when the barcode isn't in the database; throws on network
// or server failures (the UI tells those cases apart).
export async function lookupBarcode(code: string): Promise<ScannedProduct | null> {
  const digits = code.replace(/\D/g, "");
  if (!digits) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${digits}?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`product lookup failed (${res.status})`);
  const body = (await res.json()) as { status?: number; product?: OffProduct };
  if (body.status !== 1 || !body.product) return null;
  return mapProduct(body.product);
}
