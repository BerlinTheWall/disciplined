// A meal is a dated log entry of what you actually ate, built from catalog items
// (by id) scaled by servings. Diet totals roll up from meals — what you
// consumed — which is deliberately distinct from what a shopping trip brought
// into the house. Both read the same catalog; meals read its nutrition column.
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealComponent {
  itemId: string
  servings: number // multiples of the catalog item's reference amount
}

export interface Meal {
  id: string
  name: string
  type: MealType
  date: string // ISO date
  components: MealComponent[]
  recipeId?: string // set when this meal was logged from a recipe
}