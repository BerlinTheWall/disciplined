import { motion, AnimatePresence } from 'framer-motion'
import { X, Flame, Dumbbell, UtensilsCrossed, ListChecks, Palette, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProfileStore } from '../store/profileStore'
import { useHabitStore } from '../store/habitStore'
import { useTaskStore } from '../store/taskStore'
import { useMealStore } from '../store/mealStore'
import { useThemeStore } from '../store/themeStore'
import { getHabitStreak } from '../lib/habits'
import { getWeekDates, toISODate } from '../lib/date'
import { spring, tap } from '../lib/motion'
import { useScrollLock } from '../hooks/useScrollLock'

interface ProfileSheetProps {
  isOpen: boolean
  onClose: () => void
}

export default function ProfileSheet({ isOpen, onClose }: ProfileSheetProps) {
  useScrollLock(isOpen)

  const name = useProfileStore((s) => s.name)
  const tagline = useProfileStore((s) => s.tagline)
  const setName = useProfileStore((s) => s.setName)
  const setTagline = useProfileStore((s) => s.setTagline)

  const habits = useHabitStore((s) => s.habits)
  const tasks = useTaskStore((s) => s.tasks)
  const meals = useMealStore((s) => s.meals)
  const { theme, toggleTheme } = useThemeStore()

  // This week's dates (Mon–Sun) as an ISO set, for "… this week" stats.
  const weekSet = new Set(getWeekDates(new Date()).map(toISODate))

  const longestStreak = habits.reduce(
    (max, h) => Math.max(max, getHabitStreak(h)),
    0,
  )
  const tasksDone = tasks.filter((t) => t.completed && weekSet.has(t.date)).length
  const workoutsDone = tasks.filter(
    (t) => t.completed && t.workoutSessionId && weekSet.has(t.date),
  ).length
  const mealsLogged = meals.filter((m) => weekSet.has(m.date)).length

  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 shadow-xl max-h-[92vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-sm font-medium text-fg-faint">Profile</span>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-fg-muted"
              >
                <X size={18} />
              </motion.button>
            </div>

            {/* Identity */}
            <div className="flex flex-col items-center px-5 pt-2 pb-6">
              <div className="w-20 h-20 rounded-full bg-fg flex items-center justify-center shrink-0">
                <span className="text-3xl font-bold text-fg-inverse">{initial}</span>
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-3 w-full text-center text-2xl font-bold bg-transparent text-fg placeholder-fg-faint focus:outline-none"
              />
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Add a tagline"
                className="mt-1 w-full text-center text-sm bg-transparent text-fg-faint placeholder-fg-faint focus:outline-none"
              />
            </div>

            {/* Stats */}
            <div className="px-4">
              <h3 className="text-xs font-semibold text-fg-muted mb-2 px-1">
                This week
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Flame}
                  accent="#fb923c"
                  value={longestStreak}
                  label="day streak"
                />
                <StatCard
                  icon={ListChecks}
                  accent="#34d399"
                  value={tasksDone}
                  label="tasks completed"
                />
                <StatCard
                  icon={Dumbbell}
                  accent="#60a5fa"
                  value={workoutsDone}
                  label="workouts done"
                />
                <StatCard
                  icon={UtensilsCrossed}
                  accent="#a78bfa"
                  value={mealsLogged}
                  label="meals logged"
                />
              </div>
            </div>

            {/* Settings */}
            <div className="px-4 pt-6 pb-8">
              <h3 className="text-xs font-semibold text-fg-muted mb-2 px-1">
                Settings
              </h3>
              <motion.button
                onClick={toggleTheme}
                whileTap={tap}
                className="flex items-center justify-between w-full px-4 py-3 rounded-2xl bg-surface-raised mb-2"
              >
                <div className="flex items-center gap-3">
                  <Palette size={20} className="text-fg-muted" strokeWidth={1.8} />
                  <span className="font-medium text-fg">Theme</span>
                </div>
                <div
                  className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
                    theme === 'dark' ? 'bg-fg' : 'bg-surface-subtle'
                  }`}
                >
                  <motion.div
                    className="w-5 h-5 rounded-full bg-surface shadow-sm"
                    animate={{ x: theme === 'dark' ? 16 : 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  />
                </div>
              </motion.button>
              <motion.button
                whileTap={tap}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={20} strokeWidth={1.8} />
                <span className="font-medium">Log out</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function StatCard({
  icon: Icon,
  accent,
  value,
  label,
}: {
  icon: LucideIcon
  accent: string
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface-raised p-4">
      <Icon size={18} style={{ color: accent }} />
      <span className="text-2xl font-bold text-fg tabular-nums mt-2">{value}</span>
      <span className="text-xs text-fg-faint leading-tight">{label}</span>
    </div>
  )
}
