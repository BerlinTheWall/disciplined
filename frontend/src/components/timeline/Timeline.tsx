import { useContext, useState } from "react";
import { useShallow } from "zustand/shallow";

import AddItemSheet from "./AddItemSheet";
import DaySchedule from "./DaySchedule";
import DayScheduleCards from "./DayScheduleCards";
import ExternalCalendarStrip from "./ExternalCalendarStrip";
import QuickAddBar from "./QuickAddBar";
import { WeekSwipeContext } from "./swipeController";
import SwipePager from "./SwipePager";
import TaskDetailSheet from "./TaskDetailSheet";
import WeeklyTimeline from "./WeeklyTimeline";
import type { ViewMode } from "@/App";
import { addDays, getWeekDates, toISODate } from "@/lib/date";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

export type EditItem = { type: "task"; data: Task } | { type: "habit"; data: Habit };

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

  const [editItem, setEditItem] = useState<EditItem | null>(null);
  // Read-only detail popup, opened by tapping a row; its Edit button opens the editor.
  const [detailItem, setDetailItem] = useState<EditItem | null>(null);

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
      <QuickAddBar onEditDetails={setEditItem} />
      <ExternalCalendarStrip date={selectedDate} />

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
