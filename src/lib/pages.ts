import { UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Page = 'meals' | 'workout' | 'schedule' | 'habits' | 'expenses'

export const PAGE_ORDER: Page[] = ['meals', 'workout', 'schedule', 'habits', 'expenses']

export const FAB_PAGES: Page[] = ['schedule', 'expenses']

export const ALL_TABS: { id: Page; icon: LucideIcon; label: string }[] = [
  { id: 'meals',    icon: UtensilsCrossed, label: 'Meals' },
  { id: 'workout',  icon: Dumbbell,        label: 'Workout' },
  { id: 'schedule', icon: CalendarDays,    label: 'Schedule' },
  { id: 'habits',   icon: Flame,           label: 'Habits' },
  { id: 'expenses', icon: Wallet,          label: 'Expenses' },
]
