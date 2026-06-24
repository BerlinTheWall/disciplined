import type { FoodCategoryKey } from '../lib/foodCategories'
import type { Nutrition, Unit } from '../lib/nutritions'

// A catalog item: a reusable definition of a food/product you've added before.
// It is the single source of truth that every other feature reads from — price
// (money) and nutrition (diet) — expressed for ONE reference amount (quantity +
// unit). Shopping-list lines and meal components reference this item by id and
// scale it by a multiplier, so the same item powers both spending and diet.
//
// Note: this no longer carries `checked`. Whether an item is selected for a
// given trip is per-trip state and now lives on the shopping list line.
export interface GroceryItem {
  id: string
  name: string
  category: FoodCategoryKey
  price: number // expected cost for the reference quantity below
  quantity: number // reference quantity (the "1" that trips/meals scale from)
  unit: Unit
  nutrition: Nutrition // for the reference quantity (estimated or hand-edited)
  autoNutrition: boolean // re-estimate on edits until the user overrides a value
  stock: number // how much you currently have on hand, in `unit` (inventory)
}