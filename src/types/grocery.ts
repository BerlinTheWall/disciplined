import type { FoodCategoryKey } from '../lib/foodCategories'
import type { Nutrition, Unit } from '../lib/nutritions'

export interface GroceryItem {
  id: string
  name: string
  category: FoodCategoryKey
  price: number // expected cost for the quantity below
  quantity: number
  unit: Unit
  nutrition: Nutrition // for the quantity above (estimated or hand-edited)
  autoNutrition: boolean // re-estimate on edits until the user overrides a value
  checked: boolean // selected for the current shopping trip
}