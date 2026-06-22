import { UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { spring, tap } from '../lib/motion'
import { useThemeStore } from '../store/themeStore'
import { themeColors } from '../lib/theme'

export type Page = 'meals' | 'workout' | 'schedule' | 'habits' | 'expenses'

const TABS: { id: Page; icon: React.ElementType; label: string }[] = [
  { id: 'meals',    icon: UtensilsCrossed, label: 'Meals' },
  { id: 'workout',  icon: Dumbbell,        label: 'Workout' },
  { id: 'schedule', icon: CalendarDays,    label: 'Schedule' },
  { id: 'habits',   icon: Flame,           label: 'Habits' },
  { id: 'expenses', icon: Wallet,          label: 'Wallet' },
]

interface BottomNavProps {
  active: Page
  onChange: (page: Page) => void
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  const theme = useThemeStore((s) => s.theme)
  const colors = themeColors[theme]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface border-t border-be-border-focus flex items-center justify-around px-2 pb-safe z-30 rounded-t-3xl"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
    >
      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = active === id
        return (
          <motion.button
            key={id}
            onClick={() => onChange(id)}
            whileTap={tap}
            className="relative flex flex-col items-center gap-1 flex-1 pt-3 pb-0"
          >
            {isActive && (
              <motion.div
                layoutId="navLine"
                transition={spring.snappy}
                className="absolute -bottom-2.5 left-3 right-3 h-0.5 rounded-full bg-fg"
              />
            )}
            <div className="flex items-center justify-center">
              <motion.span
                className="block"
                animate={{ scale: isActive ? 1.08 : 1 }}
                transition={spring.snappy}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className={isActive ? 'text-fg' : 'text-fg-faint'}
                />
              </motion.span>
            </div>
            <motion.span
              animate={{ color: isActive ? colors.fg : colors.fgFaint }}
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
