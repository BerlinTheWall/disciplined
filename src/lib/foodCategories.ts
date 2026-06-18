import {
  Beef,
  Milk,
  Carrot,
  Apple,
  Wheat,
  Nut,
  Cookie,
  CupSoda,
  ShoppingBasket,
  Circle,
} from 'lucide-react'

// Grocery/food categories. These are separate from the expense categories in
// `categories.ts` — those classify spending (food, transport, bills…); these
// classify what a grocery item *is*, which also drives its nutrition estimate.
export const FOOD_CATEGORIES = {
  protein:   { label: 'Protein',   icon: Beef,           color: '#f87171' },
  dairy:     { label: 'Dairy',     icon: Milk,           color: '#93c5fd' },
  vegetable: { label: 'Vegetable', icon: Carrot,         color: '#34d399' },
  fruit:     { label: 'Fruit',     icon: Apple,          color: '#fb923c' },
  grain:     { label: 'Grain',     icon: Wheat,          color: '#fbbf24' },
  fat:       { label: 'Fats & oils', icon: Nut,          color: '#a78bfa' },
  snack:     { label: 'Snack',     icon: Cookie,         color: '#f472b6' },
  beverage:  { label: 'Beverage',  icon: CupSoda,        color: '#38bdf8' },
  other:     { label: 'Other',     icon: ShoppingBasket, color: '#9ca3af' },
} as const

export type FoodCategoryKey = keyof typeof FOOD_CATEGORIES

export const FOOD_CATEGORY_KEYS = Object.keys(FOOD_CATEGORIES) as FoodCategoryKey[]

// Render-time fallback in case an icon name is unavailable in the installed
// lucide build (mirrors the `ICONS[icon] ?? ICONS.default` pattern).
export const FALLBACK_FOOD_ICON = Circle