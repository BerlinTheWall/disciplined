import {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Receipt,
  Film,
  Heart,
  Coffee,
  Circle,
} from 'lucide-react'

// Each expense category carries its own icon + color, the same way tasks and
// habits carry an `icon` + `color`. Picking a category sets both at once.
export const CATEGORIES = {
  food:          { label: 'Food',          icon: UtensilsCrossed, color: '#fbbf24' },
  coffee:        { label: 'Coffee',        icon: Coffee,          color: '#fb923c' },
  transport:     { label: 'Transport',     icon: Car,             color: '#60a5fa' },
  shopping:      { label: 'Shopping',      icon: ShoppingBag,     color: '#a78bfa' },
  bills:         { label: 'Bills',         icon: Receipt,         color: '#34d399' },
  entertainment: { label: 'Entertainment', icon: Film,            color: '#fb7185' },
  health:        { label: 'Health',        icon: Heart,           color: '#f87171' },
  other:         { label: 'Other',         icon: Circle,          color: '#9ca3af' },
} as const

export type CategoryKey = keyof typeof CATEGORIES

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as CategoryKey[]