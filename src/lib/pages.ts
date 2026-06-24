import { UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet, ChefHat, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Page = 'meals' | 'recipes' | 'food' | 'workout' | 'schedule' | 'habits' | 'expenses'

export const PAGE_ORDER: Page[] = ['meals', 'recipes', 'food', 'workout', 'schedule', 'habits', 'expenses']

export const FAB_PAGES: Page[] = ['schedule', 'expenses']

export const ALL_TABS: { id: Page; icon: LucideIcon; label: string }[] = [
  { id: 'meals',    icon: UtensilsCrossed, label: 'Meals' },
  { id: 'recipes',  icon: ChefHat,         label: 'Recipes' },
  { id: 'food',     icon: Package,         label: 'Food & Products' },
  { id: 'workout',  icon: Dumbbell,        label: 'Workout' },
  { id: 'schedule', icon: CalendarDays,    label: 'Schedule' },
  { id: 'habits',   icon: Flame,           label: 'Habits' },
  { id: 'expenses', icon: Wallet,          label: 'Expenses' },
]
