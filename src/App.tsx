import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlignLeft, LayoutGrid, Menu } from 'lucide-react'
import Timeline from './components/timeline/Timeline'
import AddItemSheet from './components/timeline/AddItemSheet'
import AddGroceryItemSheet from './components/expenses/AddGroceryItemSheet'
import WeekHeader from './components/timeline/WeekHeader'
import BottomNav, { type Page } from './components/BottomNav'
import SideMenu from './components/SideMenu'
import MealsPage from './pages/MealsPage'
import WorkoutPage from './pages/WorkoutPage'
import HabitsPage from './pages/HabitsPage'
import ExpensesPage from './pages/ExpensesPage'
import { spring, tap } from './lib/motion'

const PAGE_TITLES: Record<Page, string> = {
  meals: 'Meals',
  workout: 'Workout',
  schedule: 'Today',
  habits: 'Habits',
  expenses: 'Expenses',
}

export type ViewMode = 'daily' | 'weekly'

const PAGE_ORDER: Page[] = ['meals', 'workout', 'schedule', 'habits', 'expenses']

const pageVariants = {
  enter:  (d: number) => ({ x: d > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: d > 0 ? -28 : 28, opacity: 0 }),
}

function App() {
  // [page, direction] — direction drives the slide
  const [[activePage, dir], setPage] = useState<[Page, number]>(['schedule', 0])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isGroceryAddOpen, setIsGroceryAddOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false)


  function go(p: Page) {
    if (p === activePage) return
    const from = PAGE_ORDER.indexOf(activePage)
    setPage([p, PAGE_ORDER.indexOf(p) > from ? 1 : -1])
  }

  function openFab() {
    if (activePage === 'expenses') setIsGroceryAddOpen(true)
    else setIsAddOpen(true)
  }

  const fabOpen = activePage === 'expenses' ? isGroceryAddOpen : isAddOpen

  function renderPage() {
    switch (activePage) {
      case 'schedule':
        return (
          <>
            <WeekHeader leftGutter={viewMode === 'weekly' ? 32 : 0} />
            <Timeline viewMode={viewMode} />
          </>
        )
      case 'meals':
        return <MealsPage />
      case 'workout':
        return <WorkoutPage />
      case 'habits':
        return <HabitsPage />
      case 'expenses':
        return <ExpensesPage />
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        activePage={activePage}
        onNavigate={go}
      />

      {/* Title row — stays mounted; its contents animate */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <motion.button
              onClick={() => setIsSideMenuOpen(true)}
              whileTap={tap}
              className="p-1 -ml-1 text-fg-faint"
            >
              <Menu size={22} />
            </motion.button>

            <div className="relative h-8 flex items-center overflow-hidden">
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                <motion.h1
                  key={activePage}
                  custom={dir}
                  initial={{ y: dir > 0 ? 22 : -22, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: dir > 0 ? -22 : 22, opacity: 0 }}
                  transition={spring.snappy}
                  className="text-2xl font-bold whitespace-nowrap text-fg"
                >
                  {PAGE_TITLES[activePage]}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>

          {/* Daily / Weekly toggle — only on schedule page */}
          <AnimatePresence>
            {activePage === 'schedule' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.snappy}
                className="flex items-center bg-surface-raised rounded-lg p-0.5"
              >
                {(['daily', 'weekly'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className="relative p-1.5 rounded-md"
                    aria-label={`${m} view`}
                  >
                    {viewMode === m && (
                      <motion.div
                        layoutId="viewToggle"
                        transition={spring.snappy}
                        className="absolute inset-0 bg-surface rounded-md shadow-sm"
                      />
                    )}
                    <span
                      className={`relative z-10 block ${
                        viewMode === m ? 'text-fg' : 'text-fg-faint'
                      }`}
                    >
                      {m === 'daily' ? <AlignLeft size={15} /> : <LayoutGrid size={15} />}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Page body — slides between pages */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={activePage}
            custom={dir}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.gentle}
            className="absolute inset-0 overflow-y-auto px-4 pb-28"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </div>

      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <AddGroceryItemSheet
        isOpen={isGroceryAddOpen}
        onClose={() => setIsGroceryAddOpen(false)}
      />

      <BottomNav
        active={activePage}
        onChange={go}
        onAdd={openFab}
        fabOpen={fabOpen}
      />
    </div>
  )
}

export default App
