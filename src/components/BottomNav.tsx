import { Plus, UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet } from 'lucide-react'
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
  onAdd?: () => void
  fabOpen?: boolean
}

export default function BottomNav({ active, onChange, onAdd, fabOpen }: BottomNavProps) {
  const theme = useThemeStore((s) => s.theme)
  const colors = themeColors[theme]

  return (
    <div
      className="fixed left-4 right-4 flex items-center gap-3 z-30"
      style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}
    >
      {/* Pill */}
      <nav className="flex-1 bg-surface rounded-full shadow-xl border border-border-strong flex items-center px-2 py-3.5">
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = active === id
          return (
            <motion.button
              key={id}
              onClick={() => onChange(id)}
              whileTap={tap}
              className="flex flex-col items-center gap-1 flex-1"
            >
              <Icon
                size={26}
                strokeWidth={isActive ? 2.3 : 1.6}
                className={isActive ? 'text-fg' : 'text-fg-faint'}
              />
              <motion.span
                animate={{ color: isActive ? colors.fg : colors.fgFaint }}
                transition={{ duration: 0.15 }}
                className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}
              >
                {label}
              </motion.span>
            </motion.button>
          )
        })}
      </nav>

      {/* Plus circle — always visible */}
      <motion.button
        onClick={onAdd}
        whileTap={tap}
        animate={{ rotate: fabOpen ? 135 : 0 }}
        transition={spring.snappy}
        className="w-16 h-16 rounded-full bg-fg text-fg-inverse flex items-center justify-center shadow-xl shrink-0"
      >
        <Plus size={26} strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}
