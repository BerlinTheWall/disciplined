import { UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { spring, tap } from '../lib/motion'

export type Page = 'meals' | 'workout' | 'schedule' | 'habits' | 'expenses'

const TABS: { id: Page; icon: React.ElementType; label: string }[] = [
  { id: 'meals',    icon: UtensilsCrossed, label: 'Meals' },
  { id: 'workout',  icon: Dumbbell,        label: 'Workout' },
  { id: 'schedule', icon: CalendarDays,    label: 'Schedule' },
  { id: 'habits',   icon: Flame,           label: 'Habits' },
  { id: 'expenses', icon: Wallet,          label: 'Expenses' },
]

interface BottomNavProps {
  active: Page
  onChange: (page: Page) => void
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center justify-around px-2 pb-safe z-50"
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = active === id
        return (
          <motion.button
            key={id}
            onClick={() => onChange(id)}
            whileTap={tap}
            className="relative flex flex-col items-center gap-1 flex-1 pt-3 pb-1"
          >
            <div className="relative flex items-center justify-center">
              {isActive && (
                <motion.div
                  layoutId="navPill"
                  transition={spring.snappy}
                  className="absolute -inset-x-3 -inset-y-1.5 rounded-full bg-gray-100"
                />
              )}
              <motion.span
                className="relative block"
                animate={{ scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }}
                transition={spring.snappy}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className={isActive ? 'text-gray-900' : 'text-gray-400'}
                />
              </motion.span>
            </div>
            <motion.span
              animate={{ color: isActive ? '#111827' : '#9ca3af' }}
              transition={{ duration: 0.2 }}
              className="text-[10px] font-medium"
            >
              {label}
            </motion.span>
          </motion.button>
        )
      })}
    </nav>
  )
}