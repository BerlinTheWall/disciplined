import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlignLeft, CalendarPlus, LayoutGrid, Menu } from "lucide-react";

import BottomNav from "./components/BottomNav";
import ChatSheet from "./components/chat/ChatSheet";
import AddGroceryItemSheet from "./components/expenses/AddGroceryItemSheet";
import ReminderHost from "./components/ReminderHost";
import SettingsSheet from "./components/SettingsSheet";
import SideMenu from "./components/SideMenu";
import AddItemSheet from "./components/timeline/AddItemSheet";
import PlanDaySheet from "./components/timeline/PlanDaySheet";
import { useSwipeController, WeekSwipeContext } from "./components/timeline/swipeController";
import Timeline from "./components/timeline/Timeline";
import WeekHeader from "./components/timeline/WeekHeader";
import VoiceAssistant from "./components/VoiceAssistant";
import { BACKGROUNDS } from "./lib/backgrounds";
import { addDays, relativeDayName, toISODate } from "./lib/date";
import { spring, tap } from "./lib/motion";
import { PAGE_ORDER, type Page } from "./lib/pages";
import ExpensesPage from "./pages/ExpensesPage";
import FoodPage from "./pages/FoodPage";
import HabitsPage from "./pages/HabitsPage";
import HomePage from "./pages/HomePage";
import MealsPage from "./pages/MealsPage";
import ProfilePage from "./pages/ProfilePage";
import RecipesPage from "./pages/RecipesPage";
import WorkoutPage from "./pages/WorkoutPage";
import { useProfileStore } from "./store/profileStore";
import { useRecipeFocusStore } from "./store/recipeFocusStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTaskStore } from "./store/taskStore";
import { useThemeStore } from "./store/themeStore";
import { useWorkoutFocusStore } from "./store/workoutFocusStore";

const PAGE_TITLES: Record<Page, string> = {
  home: "", // the Home page shows its own greeting header

  meals: "Meals",
  recipes: "Recipes",
  food: "Food & Products",
  workout: "Workout",
  schedule: "Today",
  habits: "Habits",
  expenses: "Expenses",
  profile: "Profile",
};

export type ViewMode = "daily" | "weekly";

const pageVariants = {
  enter: (d: number) => ({ x: d > 0 ? 28 : -28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -28 : 28, opacity: 0 }),
};

function App() {
  // [page, direction] — direction drives the slide
  const [[activePage, dir], setPage] = useState<[Page, number]>(["home", 0]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isGroceryAddOpen, setIsGroceryAddOpen] = useState(false);
  // Schedule view style (daily timeline vs weekly grid) is a persisted setting,
  // toggled from the header and the Settings sheet.
  const viewMode = useSettingsStore((s) => s.scheduleView) as ViewMode;
  const setViewMode = useSettingsStore((s) => s.setScheduleView);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Apply the chosen ambient background preset (per theme) to the app's --app-bg.
  const background = useSettingsStore((s) => s.background);
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const preset = BACKGROUNDS.find((b) => b.key === background) ?? BACKGROUNDS[0];
    document.documentElement.style.setProperty(
      "--app-bg",
      theme === "dark" ? preset.dark : preset.light
    );
  }, [background, theme]);

  // In weekly view the week strip and the weekly grid share one drag controller
  // so swiping either moves both together. Reads the date at commit time via
  // getState so the handlers never go stale.
  const swipeToDate = useTaskStore((s) => s.swipeToDate);
  const shiftWeek = (delta: number) => {
    const cur = new Date(useTaskStore.getState().selectedDate + "T00:00:00");
    swipeToDate(toISODate(addDays(cur, delta * 7)));
  };
  const weekController = useSwipeController(
    () => shiftWeek(-1),
    () => shiftWeek(1)
  );

  // The schedule page is titled by the day being viewed: Today/Tomorrow/
  // Yesterday by name, any other day as a date with the month tinted.
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const relDayName = activePage === "schedule" ? relativeDayName(selectedDate) : null;
  const titleDate = new Date(selectedDate + "T00:00:00");
  const pageTitle =
    activePage !== "schedule"
      ? PAGE_TITLES[activePage]
      : (relDayName ?? (
          <>
            <span className="text-rose-400">
              {titleDate.toLocaleDateString(undefined, { month: "short" })}
            </span>{" "}
            {titleDate.getDate()}, {titleDate.getFullYear()}
          </>
        ));

  // Initial-letter avatar in the home header — the way into the profile page.
  const profileName = useProfileStore((s) => s.name);
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || "?";

  function go(p: Page) {
    if (p === activePage) return;
    const from = PAGE_ORDER.indexOf(activePage);
    setPage([p, PAGE_ORDER.indexOf(p) > from ? 1 : -1]);
  }

  // A linked task asked to open a workout — jump to the Workout page; the page
  // itself consumes the pending id and opens that session's detail. Driven off
  // the store subscription (an external event) so we don't setState during render.
  useEffect(() => {
    return useWorkoutFocusStore.subscribe((state, prev) => {
      if (state.pendingSessionId && state.pendingSessionId !== prev.pendingSessionId) {
        setPage(([curr]) => {
          if (curr === "workout") return [curr, 0];
          const from = PAGE_ORDER.indexOf(curr);
          return ["workout", PAGE_ORDER.indexOf("workout") > from ? 1 : -1];
        });
      }
    });
  }, []);

  // Same pattern for a linked task asking to open a recipe.
  useEffect(() => {
    return useRecipeFocusStore.subscribe((state, prev) => {
      if (state.pendingRecipeId && state.pendingRecipeId !== prev.pendingRecipeId) {
        setPage(([curr]) => {
          if (curr === "recipes") return [curr, 0];
          const from = PAGE_ORDER.indexOf(curr);
          return ["recipes", PAGE_ORDER.indexOf("recipes") > from ? 1 : -1];
        });
      }
    });
  }, []);

  function openFab() {
    if (activePage === "expenses") setIsGroceryAddOpen(true);
    else setIsAddOpen(true);
  }

  const fabOpen = activePage === "expenses" ? isGroceryAddOpen : isAddOpen;

  function renderPage() {
    switch (activePage) {
      case "home":
        return <HomePage onViewAll={() => go("schedule")} onNavigate={go} />;
      case "schedule":
        return (
          // Only weekly view shares the controller (strip + grid both move by
          // week); daily keeps them independent (strip = weeks, content = days).
          <WeekSwipeContext.Provider value={viewMode === "weekly" ? weekController : null}>
            <WeekHeader leftGutter={viewMode === "weekly" ? 32 : 0} />
            <Timeline viewMode={viewMode} />
          </WeekSwipeContext.Provider>
        );
      case "meals":
        return <MealsPage />;
      case "recipes":
        return <RecipesPage />;
      case "food":
        return <FoodPage />;
      case "workout":
        return <WorkoutPage />;
      case "habits":
        return <HabitsPage />;
      case "expenses":
        return <ExpensesPage />;
      case "profile":
        return <ProfilePage />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        activePage={activePage}
        onNavigate={go}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

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
                  key={
                    activePage === "schedule"
                      ? `schedule-${relDayName ?? selectedDate}`
                      : activePage
                  }
                  custom={dir}
                  initial={{ y: dir > 0 ? 24 : -24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: dir > 0 ? -24 : 24, opacity: 0 }}
                  transition={spring.snappy}
                  className={`${activePage === "schedule" ? "text-xl" : "text-2xl"} font-bold whitespace-nowrap text-fg`}
                >
                  {pageTitle}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>

          {/* Right side of the header: profile avatar on Home, plan-day +
              daily/weekly toggle on the schedule page */}
          <AnimatePresence>
            {activePage === "home" && (
              <motion.button
                key="profile"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.snappy}
                onClick={() => go("profile")}
                whileTap={tap}
                aria-label="Open profile"
                className="flex items-center gap-2.5"
              >
                <span className="text-base font-semibold text-fg max-w-36 truncate">
                  {profileName}
                </span>
                <span className="w-10 h-10 rounded-full bg-fg flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-fg-inverse">{profileInitial}</span>
                </span>
              </motion.button>
            )}
            {activePage === "schedule" && (
              <motion.div
                key="schedule-controls"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={spring.snappy}
                className="flex items-center gap-2"
              >
                <motion.button
                  onClick={() => setIsPlanOpen(true)}
                  whileTap={tap}
                  className="flex items-center gap-1.5 bg-surface-raised rounded-lg h-10 px-3 text-base font-medium text-fg"
                >
                  <CalendarPlus size={17} />
                  Day Plan
                </motion.button>
                <div className="flex items-center bg-surface-raised rounded-lg h-10 p-1">
                  {(["daily", "weekly"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setViewMode(m)}
                      className="relative h-full px-2 rounded-md flex items-center justify-center"
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
                          viewMode === m ? "text-fg" : "text-fg-faint"
                        }`}
                      >
                        {m === "daily" ? <AlignLeft size={17} /> : <LayoutGrid size={17} />}
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
      <AddGroceryItemSheet isOpen={isGroceryAddOpen} onClose={() => setIsGroceryAddOpen(false)} />
      <ChatSheet />

      {/* Reminder scheduler + foreground banners; tapping one jumps to that day */}
      <ReminderHost
        onOpen={(date) => {
          useTaskStore.getState().setSelectedDate(date);
          go("schedule");
        }}
      />

      <BottomNav active={activePage} onChange={go} onAdd={openFab} fabOpen={fabOpen} />

      {/* Global push-to-talk — floats above the nav on every page */}
      <VoiceAssistant />
    </div>
  );
}

export default App;
