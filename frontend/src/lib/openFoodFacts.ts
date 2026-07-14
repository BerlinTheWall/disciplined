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
  // false = the package size couldn't be read, so quantity/unit are the 100 g
  // fallback (which the nutrition below is scaled to). The UI says so rather
  // than passing the default off as scanned data.
  amountKnown: boolean;
  // null = OFF has no nutrition for this product; leave the app's own estimator
  // in charge instead of writing zeros.
  nutrition: Nutrition | null;
  // true = the label had no energy value, so calories were computed from the
  // macros (Atwater factors) instead of read off the product.
  caloriesDerived: boolean;
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  quantity?: string; // the raw label text, e.g. "12 x 33 cl", "16 oz"
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

// Every unit a label might use, as a multiplier into a base amount — grams for
// solids, millilitres for liquids. Nutrition is quoted per 100 g (per 100 ml
// for drinks), so the base is also what we scale it by.
const UNIT_FACTORS: Record<string, { base: number; liquid: boolean }> = {
  mg: { base: 0.001, liquid: false },
  g: { base: 1, liquid: false },
  gr: { base: 1, liquid: false },
  gram: { base: 1, liquid: false },
  grams: { base: 1, liquid: false },
  gramme: { base: 1, liquid: false },
  grammes: { base: 1, liquid: false },
  kg: { base: 1000, liquid: false },
  oz: { base: 28.3495, liquid: false },
  lb: { base: 453.592, liquid: false },
  lbs: { base: 453.592, liquid: false },
  ml: { base: 1, liquid: true },
  cl: { base: 10, liquid: true },
  dl: { base: 100, liquid: true },
  l: { base: 1000, liquid: true },
  liter: { base: 1000, liquid: true },
  litre: { base: 1000, liquid: true },
  liters: { base: 1000, liquid: true },
  litres: { base: 1000, liquid: true },
  "fl oz": { base: 29.5735, liquid: true },
  floz: { base: 29.5735, liquid: true },
};

// A package size, normalized: `base` is grams (or ml) — the thing nutrition
// scales by — while quantity/unit are how it's shown in the form.
interface Amount {
  quantity: number;
  unit: Unit;
  base: number;
}

// "g", "G e" (the estimated-weight sign), "fl. oz." → a known unit, or null.
function normalizeUnit(raw: string): { base: number; liquid: boolean } | null {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!clean) return null;
  if (UNIT_FACTORS[clean]) return UNIT_FACTORS[clean];
  // Trailing noise ("300 g e", "1 kg net"): the first token carries the unit,
  // unless the pair spells a two-word unit like "fl oz".
  const [first, second] = clean.split(" ");
  if (second && UNIT_FACTORS[`${first} ${second}`]) return UNIT_FACTORS[`${first} ${second}`];
  return UNIT_FACTORS[first] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Base grams/ml → what the amount field should read. Keeps big numbers
// readable: 1000 g becomes 1 kg, 1500 ml becomes 1.5 l.
function toAmount(base: number, liquid: boolean): Amount {
  if (liquid) {
    return base >= 1000
      ? { quantity: round2(base / 1000), unit: "l", base }
      : { quantity: round2(base), unit: "ml", base };
  }
  return base >= 1000
    ? { quantity: round2(base / 1000), unit: "kg", base }
    : { quantity: round2(base), unit: "g", base };
}

// OFF's own normalized size — present for ~98% of products, but its unit can
// be anything the contributor typed.
function amountFromProductQuantity(p: OffProduct): Amount | null {
  const qty = num(p.product_quantity);
  if (qty === null || qty <= 0) return null;
  const unit = normalizeUnit(p.product_quantity_unit ?? "g");
  if (!unit) return null;
  return toAmount(qty * unit.base, unit.liquid);
}

// The raw label text, for the products OFF never normalized: "1,5 L",
// "12 x 33 cl", "16 oz", "500g e".
function amountFromQuantityString(raw: string | undefined): Amount | null {
  if (!raw) return null;
  const text = raw.toLowerCase().replace(",", ".");
  const number = "\\d+(?:\\.\\d+)?";

  // Multipacks: the pack size is count × unit size.
  const multi = new RegExp(`(${number})\\s*[x×*]\\s*(${number})\\s*([a-z. ]+)`).exec(text);
  if (multi) {
    const unit = normalizeUnit(multi[3]);
    if (unit) {
      const count = parseFloat(multi[1]);
      const size = parseFloat(multi[2]);
      if (isFinite(count) && isFinite(size) && count > 0 && size > 0) {
        return toAmount(count * size * unit.base, unit.liquid);
      }
    }
  }

  const single = new RegExp(`(${number})\\s*([a-z. ]+)`).exec(text);
  if (single) {
    const unit = normalizeUnit(single[2]);
    const value = parseFloat(single[1]);
    if (unit && isFinite(value) && value > 0) return toAmount(value * unit.base, unit.liquid);
  }
  return null;
}

// The 100 g the nutrition is quoted against — a truthful reference amount when
// the package size is unknowable, rather than a guess at the package.
const FALLBACK_AMOUNT: Amount = { quantity: 100, unit: "g", base: 100 };

function mapAmount(p: OffProduct): { amount: Amount; known: boolean } {
  const amount = amountFromProductQuantity(p) ?? amountFromQuantityString(p.quantity);
  return amount ? { amount, known: true } : { amount: FALLBACK_AMOUNT, known: false };
}

// Atwater factors: the calories a gram of each macro carries. Used only when
// the label carries macros but no energy value (~6% of products) — better than
// the 0 kcal that reading a missing field would otherwise produce.
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

function mapNutrition(
  p: OffProduct,
  base: number
): { nutrition: Nutrition | null; caloriesDerived: boolean } {
  const n = p.nutriments ?? {};
  const protein100 = num(n["proteins_100g"]);
  const fat100 = num(n["fat_100g"]);
  const carbs100 = num(n["carbohydrates_100g"]);

  // Energy: kcal if the label has it, else the kJ figure converted, else
  // computed from the macros.
  const kj = num(n["energy_100g"]) ?? num(n["energy-kj_100g"]);
  const macroKcal =
    protein100 === null && fat100 === null && carbs100 === null
      ? null
      : (protein100 ?? 0) * KCAL_PER_G.protein +
        (carbs100 ?? 0) * KCAL_PER_G.carbs +
        (fat100 ?? 0) * KCAL_PER_G.fat;
  const labelKcal = num(n["energy-kcal_100g"]) ?? (kj === null ? null : kj / 4.184);
  const kcal100 = labelKcal ?? macroKcal;

  if (kcal100 === null && protein100 === null && fat100 === null && carbs100 === null) {
    return { nutrition: null, caloriesDerived: false };
  }

  const factor = base / 100;
  return {
    nutrition: {
      calories: Math.round((kcal100 ?? 0) * factor),
      protein: round1((protein100 ?? 0) * factor),
      fat: round1((fat100 ?? 0) * factor),
      carbs: round1((carbs100 ?? 0) * factor),
      sugar: round1((num(n["sugars_100g"]) ?? 0) * factor),
      fiber: round1((num(n["fiber_100g"]) ?? 0) * factor),
    },
    caloriesDerived: labelKcal === null && macroKcal !== null,
  };
}

// Exported for direct testing; lookupBarcode is the fetch wrapper around it.
export function mapProduct(p: OffProduct): ScannedProduct {
  const { amount, known } = mapAmount(p);
  const { nutrition, caloriesDerived } = mapNutrition(p, amount.base);
  const brand = (p.brands ?? "").split(",")[0].trim();
  return {
    name: (p.product_name ?? "").trim() || brand,
    category: mapCategory(p),
    quantity: amount.quantity,
    unit: amount.unit,
    amountKnown: known,
    nutrition,
    caloriesDerived,
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
  // A malformed code can get an HTML error page with a 200 — treat anything
  // that isn't JSON as "no such product" rather than letting the parse throw.
  let body: { status?: number; product?: OffProduct };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  if (body.status !== 1 || !body.product) return null;
  return mapProduct(body.product);
}
