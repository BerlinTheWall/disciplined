import { AlarmClock, Dumbbell, ShowerHead, UtensilsCrossed, Bike, BookOpen, Coffee, Briefcase, Heart, ShoppingCart, Circle } from 'lucide-react'

export const ICONS = {
  alarm: AlarmClock,
  workout: Dumbbell,
  shower: ShowerHead,
  meal: UtensilsCrossed,
  bike: Bike,
  reading: BookOpen,
  coffee: Coffee,
  work: Briefcase,
  health: Heart,
  shopping: ShoppingCart,
  default: Circle,
} as const

export type IconKey = keyof typeof ICONS