import type { CategoryKey } from '../lib/categories'

export interface Expense {
  id: string
  amount: number // in dollars, e.g. 12.5
  note: string
  category: CategoryKey
  date: string // ISO date, e.g. "2026-06-17"
}