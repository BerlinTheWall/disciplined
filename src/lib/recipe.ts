import type { GroceryItem } from '../types/grocery'
import type { Recipe, RecipeIngredient } from '../types/recipe'
import type { Nutrition } from './nutritions'
import { emptyNutrition, addNutrition } from './nutritions'
import { lineNutrition, scaleNutrition, formatUnit } from './grocery'

const round1 = (n: number) => Math.round(n * 10) / 10

// The absolute amount (in the item's unit) a recipe needs for one ingredient —
// the reference quantity scaled by the ingredient's servings multiplier.
export function requiredAmount(item: GroceryItem, servings: number): number {
  return round1(item.quantity * servings)
}

export interface IngredientAvailability {
  ingredient: RecipeIngredient
  item: GroceryItem | undefined
  required: number // amount needed, in item.unit
  have: number // amount on hand (stock), in item.unit
  requiredLabel: string
  haveLabel: string
  enough: boolean
  missingFromCatalog: boolean // item was deleted from the catalog entirely
}

export interface RecipeAvailability {
  ingredients: IngredientAvailability[]
  canCook: boolean
  missingCount: number
}

// Check whether the user has enough stock of each ingredient to cook the recipe.
export function recipeAvailability(
  recipe: Recipe,
  items: Record<string, GroceryItem>,
): RecipeAvailability {
  const ingredients = recipe.ingredients.map((ingredient) => {
    const item = items[ingredient.itemId]
    const required = item ? requiredAmount(item, ingredient.servings) : 0
    const have = item?.stock ?? 0
    const enough = !!item && have >= required
    return {
      ingredient,
      item,
      required,
      have,
      requiredLabel: item ? formatUnit(required, item.unit) : '—',
      haveLabel: item ? formatUnit(round1(have), item.unit) : '—',
      enough,
      missingFromCatalog: !item,
    }
  })
  const missingCount = ingredients.filter((i) => !i.enough).length
  return {
    ingredients,
    canCook: ingredients.length > 0 && missingCount === 0,
    missingCount,
  }
}

// Total nutrition of the whole recipe (all servings combined).
export function recipeNutrition(
  recipe: Recipe,
  items: Record<string, GroceryItem>,
): Nutrition {
  let n = emptyNutrition()
  for (const ing of recipe.ingredients) {
    n = addNutrition(n, lineNutrition(items[ing.itemId], ing.servings))
  }
  return n
}

// Nutrition for a single serving — what one plate of this contributes.
export function perServingNutrition(
  recipe: Recipe,
  items: Record<string, GroceryItem>,
): Nutrition {
  const total = recipeNutrition(recipe, items)
  const servings = recipe.servings > 0 ? recipe.servings : 1
  return scaleNutrition(total, 1 / servings)
}

// One-line summary for list cards, e.g. "5 ingredients · 25 min · 540 kcal/serving".
export function recipeSummary(
  recipe: Recipe,
  items: Record<string, GroceryItem>,
): string {
  const parts: string[] = []
  const n = recipe.ingredients.length
  parts.push(`${n} ${n === 1 ? 'ingredient' : 'ingredients'}`)
  if (recipe.timeMin) parts.push(`${recipe.timeMin} min`)
  const kcal = perServingNutrition(recipe, items).calories
  if (kcal > 0) parts.push(`${kcal} kcal/serving`)
  return parts.join(' · ')
}
