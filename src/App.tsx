import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlignLeft, LayoutGrid, Menu, CalendarPlus } from 'lucide-react'
import Timeline from './components/timeline/Timeline'
import AddItemSheet from './components/timeline/AddItemSheet'
import PlanDaySheet from './components/timeline/PlanDaySheet'
import AddGroceryItemSheet from './components/expenses/AddGroceryItemSheet'
import WeekHeader from './components/timeline/WeekHeader'
import { WeekSwipeContext, useSwipeController } from './components/timeline/swipeController'
import BottomNav, { type Page } from './components/BottomNav'
import { useTaskStore } from './store/taskStore'
import { addDays, toISODate } from './lib/date'
import { useWorkoutFocusStore } from './store/workoutFocusStore'
import { useRecipeFocusStore } from './store/recipeFocusStore'
import SideMenu from './components/SideMenu'
import MealsPage from './pages/MealsPage'
import RecipesPage from './pages/RecipesPage'
import FoodPage from './pages/FoodPage'
import WorkoutPage from './pages/WorkoutPage'
import HabitsPage from './pages/HabitsPage'
import ExpensesPage from './pages/ExpensesPage'
import { spring, tap } from './lib/motion'

const PAGE_TITLES: Record<Page, string> = {
  meals: 'Meals',
  recipes: 'Recipes',
  food: 'Food & Products',
  workout: 'Workout',
  schedule: 'Today',
  habits: 'Habits',
  expenses: 'Expenses',
}

export type ViewMode = 'daily' | 'weekly'

const PAGE_ORDER: Page[] = ['meals', 'recipes', 'food', 'workout', 'schedule', 'habits', 'expenses']

const pageVariants = {
  enter:  (d: number) => ({ x: d > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: d > 0 ? -28 : 28, opacity: 0 }),
}

function App() {
  // [page, direction] — direction drives the slide
  const [[activePage, dir], setPage] = useState<[Page, number]>(['schedule', 0])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isPlanOpen, setIsPlanOpen] = useState(false)
  const [isGroceryAddOpen, setIsGroceryAddOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false)

  // In weekly view the week strip and the weekly grid share one drag controller
  // so swiping either moves both together. Reads the date at commit time via
  // getState so the handlers never go stale.
  const swipeToDate = useTaskStore((s) => s.swipeToDate)
  const shiftWeek = (delta: number) => {
    const cur = new Date(useTaskStore.getState().selectedDate + 'T00:00:00')
    swipeToDate(toISODate(addDays(cur, delta * 7)))
  }
  const weekController = useSwipeController(() => shiftWeek(-1), () => shiftWeek(1))

  function go(p: Page) {
    if (p === activePage) return
    const from = PAGE_ORDER.indexOf(activePage)
    setPage([p, PAGE_ORDER.indexOf(p) > from ? 1 : -1])
  }

  // A linked task asked to open a workout — jump to the Workout page; the page
  // itself consumes the pending id and opens that session's detail. Driven off
  // the store subscription (an external event) so we don't setState during render.
  useEffect(() => {
    return useWorkoutFocusStore.subscribe((state, prev) => {
      if (state.pendingSessionId && state.pendingSessionId !== prev.pendingSessionId) {
        setPage(([curr]) => {
          if (curr === 'workout') return [curr, 0]
          const from = PAGE_ORDER.indexOf(curr)
          return ['workout', PAGE_ORDER.indexOf('workout') > from ? 1 : -1]
        })
      }
    })
  }, [])

  // Same pattern for a linked task asking to open a recipe.
  useEffect(() => {
    return useRecipeFocusStore.subscribe((state, prev) => {
      if (state.pendingRecipeId && state.pendingRecipeId !== prev.pendingRecipeId) {
        setPage(([curr]) => {
          if (curr === 'recipes') return [curr, 0]
          const from = PAGE_ORDER.indexOf(curr)
          return ['recipes', PAGE_ORDER.indexOf('recipes') > from ? 1 : -1]
        })
      }
    })
  }, [])

  function openFab() {
    if (activePage === 'expenses') setIsGroceryAddOpen(true)
    else setIsAddOpen(true)
  }

  const fabOpen = activePage === 'expenses' ? isGroceryAddOpen : isAddOpen

  function renderPage() {
    switch (activePage) {
      case 'schedule':
        return (
          // Only weekly view shares the controller (strip + grid both move by
          // week); daily keeps them independent (strip = weeks, content = days).
          <WeekSwipeContext.Provider value={viewMode === 'weekly' ? weekController : null}>
            <WeekHeader leftGutter={viewMode === 'weekly' ? 32 : 0} />
            <Timeline viewMode={viewMode} />
          </WeekSwipeContext.Provider>
        )
      case 'meals':
        return <MealsPage />
      case 'recipes':
        return <RecipesPage />
      case 'food':
        return <FoodPage />
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
              <Menu size={26} />
            </motion.button>

            <div className="relative h-10 flex items-center overflow-hidden">
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                <motion.h1
                  key={activePage}
                  custom={dir}
                  initial={{ y: dir > 0 ? 24 : -24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: dir > 0 ? -24 : 24, opacity: 0 }}
                  transition={spring.snappy}
                  className="text-3xl font-bold whitespace-nowrap text-fg"
                >
                  {PAGE_TITLES[activePage]}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>

          {/* Plan day + Daily/Weekly toggle — only on schedule page */}
          <AnimatePresence>
            {activePage === 'schedule' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.snappy}
                className="flex items-center gap-2"
              >
                <motion.button
                  onClick={() => setIsPlanOpen(true)}
                  whileTap={tap}
                  className="flex items-center gap-1.5 bg-surface-raised rounded-lg px-3 py-2 text-base font-medium text-fg"
                >
                  <CalendarPlus size={17} />
                  Plan day
                </motion.button>
                <div className="flex items-center bg-surface-raised rounded-lg p-0.5">
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
                      {m === 'daily' ? <AlignLeft size={17} /> : <LayoutGrid size={17} />}
                    </span>
                  </button>
                ))}
                </div>
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
            data-scroll-lock
            className="absolute inset-0 overflow-y-auto px-4 pb-20"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </div>

      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <PlanDaySheet isOpen={isPlanOpen} onClose={() => setIsPlanOpen(false)} />
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
