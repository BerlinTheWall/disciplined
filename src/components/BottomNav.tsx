import { UtensilsCrossed, Dumbbell, CalendarDays, Flame, Wallet } from 'lucide-react'

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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center justify-around px-2 pb-safe z-50"
         style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      {TABS.map(({ id, icon: Icon, label }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-col items-center gap-1 flex-1 pt-3 pb-1"
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 2.2 : 1.6}
              className={isActive ? 'text-gray-900' : 'text-gray-400'}
            />
            <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}