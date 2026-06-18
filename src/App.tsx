import { useState } from 'react'
import { Plus, AlignLeft, LayoutGrid } from 'lucide-react'
import Timeline from './components/timeline/Timeline'
import AddItemSheet from './components/timeline/AddItemSheet'
import WeekHeader from './components/timeline/WeekHeader'
import BottomNav, { type Page } from './components/BottomNav'
import MealsPage from './pages/MealsPage'
import WorkoutPage from './pages/WorkoutPage'
import HabitsPage from './pages/HabitsPage'
import ExpensesPage from './pages/ExpensesPage'

const PAGE_TITLES: Record<Page, string> = {
  meals: 'Meals',
  workout: 'Workout',
  schedule: 'Today',
  habits: 'Habits',
  expenses: 'Expenses',
}

export type ViewMode = 'daily' | 'weekly'

function App() {
  const [activePage, setActivePage] = useState<Page>('schedule')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Page content — scrollable, padded above bottom nav */}
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-28">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6 ml-16 mr-0">
          <h1 className="text-2xl font-bold">{PAGE_TITLES[activePage]}</h1>

          {/* Daily / Weekly icon toggle — only on schedule page */}
          {activePage === 'schedule' && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('daily')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'daily' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                aria-label="Daily view"
              >
                <AlignLeft size={15} />
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'weekly' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}
                aria-label="Weekly view"
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          )}
        </div>

        {activePage === 'schedule' && (
          <>
            <WeekHeader leftGutter={viewMode === 'weekly' ? 32 : 0} />
            <Timeline viewMode={viewMode} />
          </>
        )}
        {activePage === 'meals'    && <MealsPage />}
        {activePage === 'workout'  && <WorkoutPage />}
        {activePage === 'habits'   && <HabitsPage />}
        {activePage === 'expenses' && <ExpensesPage />}
      </div>

      {/* FAB — only shown on schedule page */}
      {activePage === 'schedule' && (
        <button
          onClick={() => setIsAddOpen(true)}
          className="fixed bottom-20 right-6 w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform z-40"
        >
          <Plus size={26} />
        </button>
      )}

      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />

      <BottomNav active={activePage} onChange={setActivePage} />
    </div>
  )
}

export default App