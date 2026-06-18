import type { IconKey } from '../lib/icons'

export interface Task {
  id: string
  title: string
  startMinutes: number
  durationMinutes: number
  color: string
  icon: IconKey
  completed: boolean
  date: string // ISO date, e.g. "2026-06-17"
}