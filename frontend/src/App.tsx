import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlignLeft, CalendarPlus, LayoutGrid, List, Menu, Waypoints } from "lucide-react";

import BottomNav from "./components/BottomNav";
import ChatSheet from "./components/chat/ChatSheet";
import AddGroceryItemSheet from "./components/expenses/AddGroceryItemSheet";
import NotificationBell from "./components/NotificationBell";
import NudgeHost from "./components/NudgeHost";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";
import PullToRefreshIndicator from "./components/PullToRefreshIndicator";
import ReminderHost from "./components/ReminderHost";
import SettingsSheet from "./components/SettingsSheet";
import SideMenu from "./components/SideMenu";
import AddItemSheet from "./components/timeline/AddItemSheet";
import PlanDaySheet from "./components/timeline/PlanDaySheet";
import { useSwipeController, WeekSwipeContext } from "./components/timeline/swipeController";
import Timeline from "./components/timeline/Timeline";
import WeekHeader from "./components/timeline/WeekHeader";
import ToastHost from "./components/ToastHost";
import TutorialHost from "./components/TutorialHost";
import VoiceAssistant from "./components/VoiceAssistant";
import WeekPlanSheet from "./components/weekplan/WeekPlanSheet";
import { useDelayedFlag } from "./hooks/useDelayedFlag";
import { useLeftEdgeSwipe } from "./hooks/useEdgeSwipe";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { BACKGROUNDS } from "./lib/backgrounds";
import { addDays, relativeDayName, toISODate } from "./lib/date";
import { spring, tap } from "./lib/motion";
import { PAGE_ORDER, type Page } from "./lib/pages";
import { reloadAll } from "./lib/sync";
import ExpensesPage from "./pages/ExpensesPage";
import GoalsPage from "./pages/GoalsPage";
import HabitsPage from "./pages/HabitsPage";
import HomePage from "./pages/HomePage";
import KitchenPage from "./pages/KitchenPage";
import ProfilePage from "./pages/ProfilePage";
import WorkoutPage from "./pages/WorkoutPage";
import { useAuthStore } from "./store/authStore";
import { useGoalFocusStore } from "./store/goalFocusStore";
import { useGoalsViewStore } from "./store/goalsViewStore";
import { useOnboardingStore } from "./store/onboardingStore";
import { useProfileStore } from "./store/profileStore";
import { useRecipeFocusStore } from "./store/recipeFocusStore";
import { useSettingsStore } from "./store/settingsStore";
import { useSyncStatusStore } from "./store/syncStatusStore";
import { useTaskStore } from "./store/taskStore";
import { useThemeStore } from "./store/themeStore";
import { useToastStore } from "./store/toastStore";
import { useWorkoutFocusStore } from "./store/workoutFocusStore";

const PAGE_TITLES: Record<Page, string> = {
  home: "", // the Home page shows its own greeting header

  goals: "Goals & Plans",
  kitchen: "Kitchen",
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
  // [page, direction] — direction drives the slide. Starts on whatever page
  // was active when the app was last closed/reloaded, so reopening it
  // continues where the user left off instead of always landing on Home.
  const [[activePage, dir], setPage] = useState<[Page, number]>([
    useSettingsStore.getState().lastActivePage,
    0,
  ]);
  useEffect(() => {
    useSettingsStore.getState().setLastActivePage(activePage);
  }, [activePage]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isGroceryAddOpen, setIsGroceryAddOpen] = useState(false);
  // Schedule view style (daily timeline vs weekly grid) is a persisted setting,
  // toggled from the header and the Settings sheet.
  const viewMode = useSettingsStore((s) => s.scheduleView) as ViewMode;
  const setViewMode = useSettingsStore((s) => s.setScheduleView);
  // Goals & Plans' own view toggle — period-browsing overview vs a flat list
  // of every goal — same header-pill pattern as the schedule page's own
  // daily/weekly toggle just above.
  const goalsView = useGoalsViewStore((s) => s.view);
  const setGoalsView = useGoalsViewStore((s) => s.setView);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const onboardingDone = useOnboardingStore((s) => s.done);
  // A small dot on the menu button when there's something to say about sync
  // (pending changes, or actively pushing) — full detail lives in SideMenu,
  // reached the same way this dot is seen. Debounced so a normal, quick sync
  // or a momentary connectivity blip never flashes it — only a genuinely
  // stuck/offline state (5s+) does.
  const syncPendingRaw = useSyncStatusStore((s) => s.pendingCount > 0 || s.syncing);
  const syncPending = useDelayedFlag(syncPendingRaw, 5000);

  // Pull-to-refresh on the page body — re-syncs data from the backend rather
  // than reloading the webview, confirming with a toast once it actually
  // reached the server (silent while offline — the sync-pending dot already
  // covers that case).
  async function handlePullToRefresh() {
    const reachedServer = await reloadAll();
    if (reachedServer) useToastStore.getState().show("Everything is updated");
  }
  const {
    attach: attachPullToRefresh,
    distance: pullDistance,
    progress: pullProgress,
    dragging: pullDragging,
    refreshing: pullRefreshing,
  } = usePullToRefresh(handlePullToRefresh);

  // Swiping in from the very left edge opens the side menu (standard drawer
  // gesture). Off while the menu or any sheet is already up, or during setup.
  const anySheetOpen = isAddOpen || isPlanOpen || isGroceryAddOpen || isSettingsOpen;
  useLeftEdgeSwipe(() => setIsSideMenuOpen(true), {
    enabled: onboardingDone && !isSideMenuOpen && !anySheetOpen,
  });

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
  // Yesterday by name, any other day as month + day only — the year already
  // shows in the month header right below, and the short form keeps the title
  // at the full size the other pages use.
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const relDayName = activePage === "schedule" ? relativeDayName(selectedDate) : null;
  const titleDate = new Date(selectedDate + "T00:00:00");
  const pageTitle =
    activePage !== "schedule"
      ? PAGE_TITLES[activePage]
      : (relDayName ?? (
          <span className="flex flex-col items-start">
            <span className="leading-none">
              <span className="text-rose-400">
                {titleDate.toLocaleDateString(undefined, { month: "short" })}
              </span>{" "}
              {titleDate.getDate()}
            </span>
            <span className="mt-1 text-[10px] font-semibold leading-none tracking-wide text-fg-faint">
              {titleDate.getFullYear()}
            </span>
          </span>
        ));

  // Avatar in the home header — the way into the profile page. Shows the
  // profile photo when one is set, the initial letter otherwise.
  const profileName = useAuthStore((s) => s.user?.displayName ?? "");
  const profileAvatar = useProfileStore((s) => s.avatar);
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
          if (curr === "kitchen") return [curr, 0];
          const from = PAGE_ORDER.indexOf(curr);
          return ["kitchen", PAGE_ORDER.indexOf("kitchen") > from ? 1 : -1];
        });
      }
    });
  }, []);

  // "Add task" from a goal opens the add sheet; AddItemSheet consumes the
  // pending goal id on open and links the new task back to it.
  useEffect(() => {
    return useGoalFocusStore.subscribe((state, prev) => {
      if (state.pendingLinkGoalId && state.pendingLinkGoalId !== prev.pendingLinkGoalId) {
        setIsAddOpen(true);
      }
    });
  }, []);

  function goToSchedule(date: string) {
    useTaskStore.getState().setSelectedDate(date);
    go("schedule");
  }

  function openFab() {
    if (activePage === "expenses") setIsGroceryAddOpen(true);
    else setIsAddOpen(true);
  }

  const fabOpen = activePage === "expenses" ? isGroceryAddOpen : isAddOpen;

  function renderPage() {
    switch (activePage) {
      case "home":
        return <HomePage onViewAll={() => go("schedule")} onOpenGoals={() => go("goals")} />;
      case "goals":
        return <GoalsPage onOpenSchedule={() => go("schedule")} />;
      case "schedule":
        return (
          // Only weekly view shares the controller (strip + grid both move by
          // week); daily keeps them independent (strip = weeks, content = days).
          <WeekSwipeContext.Provider value={viewMode === "weekly" ? weekController : null}>
            <WeekHeader leftGutter={viewMode === "weekly" ? 32 : 0} />
            <Timeline viewMode={viewMode} />
          </WeekSwipeContext.Provider>
        );
      case "kitchen":
        return <KitchenPage />;
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
    // h-dvh (not min-h-screen/100vh) + overflow-hidden: the shell must never
    // exceed the true visible screen. 100vh is unreliable specifically in iOS
    // standalone (Add to Home Screen) mode — it can render taller than the
    // real viewport there even when a plain Safari tab renders it correctly,
    // which silently turns the whole document into a second, unintended
    // scroll region on top of the one deliberate scroller (data-scroll-lock;
    // see useScrollLock's doc comment).
    <div className="h-dvh flex flex-col overflow-hidden">
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        activePage={activePage}
        onNavigate={go}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Title row — stays mounted; its contents animate. Top padding adds the
          iOS safe-area inset (0 on devices without a notch) so the header clears
          the status bar / Dynamic Island. */}
      <div className="px-4" style={{ paddingTop: "calc(16px + env(safe-area-inset-top))" }}>
        <div className="relative flex items-center mb-6">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <motion.button
              onClick={() => setIsSideMenuOpen(true)}
              data-tour="menu"
              whileTap={tap}
              className="relative p-1 -ml-1 text-fg-faint"
            >
              <Menu size={26} />
              {syncPending && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500" />
              )}
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
                  className={`${activePage === "schedule" ? "text-[23px]" : "text-2xl"} font-bold whitespace-nowrap text-fg`}
                >
                  {pageTitle}
                </motion.h1>
              </AnimatePresence>
            </div>
          </div>

          {/* Right side of the header: profile avatar on Home, plan-day +
              daily/weekly toggle on the schedule page. Pinned to the right edge
              (absolute, out of the flex flow) so its position never depends on
              the title width. popLayout pops the exiting element out of the
              layout immediately — otherwise, during a Home->Calendar switch, the
              outgoing profile button still occupied space for a few frames and
              pushed the incoming controls past the right edge until it
              unmounted (they visibly snapped back in). */}
          <div className="absolute right-0 inset-y-0 flex items-center">
            <AnimatePresence mode="popLayout">
              {activePage === "home" && (
                <motion.button
                  key="profile"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  // Instant exit: the profile section vanishes as soon as the
                  // page changes rather than lingering with a fade.
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={spring.snappy}
                  onClick={() => go("profile")}
                  whileTap={tap}
                  aria-label="Open profile"
                  style={{ transformOrigin: "right center" }}
                  className="flex items-center gap-2.5"
                >
                  <span className="text-base font-semibold text-fg max-w-36 truncate">
                    {profileName}
                  </span>
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-fg flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-fg-inverse">{profileInitial}</span>
                    </span>
                  )}
                </motion.button>
              )}
              {activePage === "schedule" && (
                <motion.div
                  key="schedule-controls"
                  // Opacity-only entrance/exit: a scale transform here made
                  // WKWebView re-round the toggle icons' subpixel positions when
                  // it finished (~1px hop on page open) — same fix as BottomNav.
                  // Instant exit (like the profile button below) so it vanishes
                  // as soon as the page changes instead of crossfading with the
                  // incoming page's controls, which briefly showed both at once.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={spring.snappy}
                  className="flex items-center gap-2"
                >
                  <motion.button
                    onClick={() => setIsPlanOpen(true)}
                    whileTap={tap}
                    className="flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-surface-raised rounded-lg h-10 px-3 text-base font-medium text-fg"
                  >
                    <CalendarPlus size={18} />
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
                        {/* Even icon size (18) centers on whole pixels and
                            transform-gpu isolates the icon's layer so the
                            layoutId pill morphing next to it can't re-round its
                            position (WKWebView subpixel quirk). */}
                        <span
                          className={`relative z-10 block transform-gpu ${
                            viewMode === m ? "text-fg" : "text-fg-faint"
                          }`}
                        >
                          {m === "daily" ? <AlignLeft size={18} /> : <LayoutGrid size={18} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              {activePage === "goals" && (
                <motion.div
                  key="goals-controls"
                  // Opacity-only, instant-exit — same reasoning as
                  // schedule-controls above.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={spring.snappy}
                >
                  <div className="flex items-center bg-surface-raised rounded-lg h-10 p-1">
                    {(["overview", "all"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setGoalsView(m)}
                        className="relative h-full px-2 rounded-md flex items-center justify-center"
                        aria-label={m === "overview" ? "Overview" : "All goals"}
                      >
                        {goalsView === m && (
                          <motion.div
                            layoutId="goalsViewToggle"
                            transition={spring.snappy}
                            className="absolute inset-0 bg-surface rounded-md shadow-sm"
                          />
                        )}
                        <span
                          className={`relative z-10 block transform-gpu ${
                            goalsView === m ? "text-fg" : "text-fg-faint"
                          }`}
                        >
                          {m === "overview" ? <Waypoints size={18} /> : <List size={18} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              {activePage === "profile" && (
                <motion.div
                  key="profile-controls"
                  // Instant exit — see schedule-controls above.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={spring.snappy}
                >
                  <NotificationBell onOpenSchedule={goToSchedule} onOpenGoals={() => go("goals")} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
            ref={attachPullToRefresh}
            className="absolute inset-0 overflow-y-auto px-4"
            // Clear the floating nav (its height + offset) plus a gap, so the
            // last card never hides behind it. Uses --nav-bottom so the gap is
            // consistent across notch / non-notch devices.
            style={{ paddingBottom: "calc(88px + var(--nav-bottom))" }}
          >
            <PullToRefreshIndicator
              distance={pullDistance}
              progress={pullProgress}
              dragging={pullDragging}
              refreshing={pullRefreshing}
            />
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </div>

      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      <PlanDaySheet isOpen={isPlanOpen} onClose={() => setIsPlanOpen(false)} />
      <AddGroceryItemSheet isOpen={isGroceryAddOpen} onClose={() => setIsGroceryAddOpen(false)} />
      <ChatSheet />
      <WeekPlanSheet />

      {/* Reminder scheduler + foreground banners; tapping one jumps to that day */}
      <ReminderHost
        onOpen={(date) => {
          useTaskStore.getState().setSelectedDate(date);
          go("schedule");
        }}
      />

      {/* Proactive assistant nudges — checks in on app open/foreground, at
          most one banner a day */}
      <NudgeHost onOpenGoals={() => go("goals")} />

      {/* Generic one-off confirmation toast (e.g. "Google Calendar connected") */}
      <ToastHost />

      <BottomNav active={activePage} onChange={go} onAdd={openFab} fabOpen={fabOpen} />

      {/* Global push-to-talk — floats above the nav on every page */}
      <VoiceAssistant />

      {/* First-launch setup wizard (plan your first day), then the spotlight
          tour — gated so the tour can't react to the wizard's task creation.
          Completing/skipping the wizard marks the tour done; it stays
          available from Settings → Replay the tutorial. */}
      {!onboardingDone && <OnboardingWizard />}
      {onboardingDone && (
        <TutorialHost
          activePage={activePage}
          isAddOpen={isAddOpen}
          isSideMenuOpen={isSideMenuOpen}
        />
      )}
    </div>
  );
}

export default App;
