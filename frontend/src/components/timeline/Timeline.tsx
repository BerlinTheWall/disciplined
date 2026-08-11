import { useContext } from "react";
import { useShallow } from "zustand/shallow";

import AddItemSheet from "./AddItemSheet";
import DaySchedule from "./DaySchedule";
import DayScheduleCards from "./DayScheduleCards";
import QuickAddBar from "./QuickAddBar";
import { WeekSwipeContext } from "./swipeController";
import SwipePager from "./SwipePager";
import TaskDetailSheet from "./TaskDetailSheet";
import { useTimelineEdit } from "./timelineEditContext";
import WeeklyTimeline from "./WeeklyTimeline";
import type { ViewMode } from "@/App";
import { addDays, getWeekDates, toISODate } from "@/lib/date";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

export type EditItem = { type: "task"; data: Task } | { type: "habit"; data: Habit };

// The quick-add bar, rendered separately (in App's fixed header area, above
// the scrollable schedule) so it stays put while the day's tasks scroll. Only
// meaningful in daily view — weekly view never rendered it.
export function TimelineQuickAdd() {
  const { setEditItem } = useTimelineEdit();
  return <QuickAddBar onEditDetails={setEditItem} />;
}

interface TimelineProps {
  viewMode: ViewMode;
}

export default function Timeline({ viewMode }: TimelineProps) {
  const [selectedDate, swipeToDate, navNonce] = useTaskStore(
    useShallow((state) => [state.selectedDate, state.swipeToDate, state.navNonce])
  );
  // Alternate (card) style for the tasks section, toggled in Settings.
  const altStyle = useSettingsStore((s) => s.altStyle);
  // In weekly view, share the drag with the week strip above so they move together.
  const sharedController = useContext(WeekSwipeContext);

  // Shared with TimelineQuickAdd (rendered outside this component, in the
  // fixed header) so either one can open the same edit/detail sheets.
  const { editItem, setEditItem, detailItem, setDetailItem } = useTimelineEdit();

  const selectedDateObj = new Date(selectedDate + "T00:00:00");

  // A swipe moves the day without bumping navNonce, so the daily pageKey only
  // changes its date part — the neighbour panel is reused and doesn't re-animate.
  function shiftSelectedDate(deltaDays: number) {
    swipeToDate(toISODate(addDays(selectedDateObj, deltaDays)));
  }

  if (viewMode === "weekly") {
    // Swipe the week grid to move a whole week at a time; the pager reveals the
    // neighbouring weeks as you drag.
    // Keyed by the week's Monday, not the exact selected day — selecting a
    // different day within the same week (e.g. tapping a task on another day)
    // must not remount the panel, or it loses whatever it just opened.
    return (
      <SwipePager
        controller={sharedController}
        onPrev={() => shiftSelectedDate(-7)}
        onNext={() => shiftSelectedDate(7)}
        pageKey={(offset) => toISODate(getWeekDates(addDays(selectedDateObj, offset * 7))[0])}
        renderPage={(offset) => (
          <WeeklyTimeline anchorDate={addDays(selectedDateObj, offset * 7)} />
        )}
      />
    );
  }

  return (
    <>
      {/* Swipe the day's schedule to move one day at a time. */}
      <SwipePager
        onPrev={() => shiftSelectedDate(-1)}
        onNext={() => shiftSelectedDate(1)}
        pageKey={(offset) => `${navNonce}-${toISODate(addDays(selectedDateObj, offset))}`}
        renderPage={(offset) => {
          const d = toISODate(addDays(selectedDateObj, offset));
          return altStyle ? (
            <DayScheduleCards date={d} active={offset === 0} onDetail={setDetailItem} />
          ) : (
            <DaySchedule date={d} active={offset === 0} onDetail={setDetailItem} />
          );
        }}
      />

      <TaskDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null);
          setEditItem(item);
        }}
      />

      <AddItemSheet isOpen={!!editItem} onClose={() => setEditItem(null)} editItem={editItem} />
    </>
  );
}
