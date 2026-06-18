// import { useState } from 'react'
// import { Plus } from 'lucide-react'
// import Timeline from './components/timeline/Timeline'
// import AddItemSheet from './components/timeline/AddItemSheet'
// import WeekHeader from './components/timeline/WeekHeader'

// function App() {
//   const [isAddOpen, setIsAddOpen] = useState(false)

//   return (
//     <div className="min-h-screen bg-white py-8 px-4 pb-24">
//       <h1 className="text-2xl font-bold mb-6 ml-16">Today</h1>
//       <WeekHeader />
//       <Timeline />

//       <button
//         onClick={() => setIsAddOpen(true)}
//         className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
//       >
//         <Plus size={26} />
//       </button>

//       <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
//     </div>
//   )
// }

// export default App

import { useState } from 'react'
import { Plus } from 'lucide-react'
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

function App() {
  const [activePage, setActivePage] = useState<Page>('schedule')
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Page content — scrollable, padded above bottom nav */}
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-28">
        <h1 className="text-2xl font-bold mb-6 ml-16">{PAGE_TITLES[activePage]}</h1>

        {activePage === 'schedule' && (
          <>
            <WeekHeader />
            <Timeline />
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