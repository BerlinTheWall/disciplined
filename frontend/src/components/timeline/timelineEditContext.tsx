/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";

import type { EditItem } from "./Timeline";

// Shared between the fixed quick-add bar (rendered in App's header area, so
// it stays put while the schedule scrolls) and the schedule body below it —
// both need to open the same edit/detail sheets.
interface TimelineEditState {
  editItem: EditItem | null;
  setEditItem: (item: EditItem | null) => void;
  detailItem: EditItem | null;
  setDetailItem: (item: EditItem | null) => void;
}

const TimelineEditContext = createContext<TimelineEditState | null>(null);

export function TimelineEditProvider({ children }: { children: ReactNode }) {
  const [editItem, setEditItem] = useState<EditItem | null>(null);
  const [detailItem, setDetailItem] = useState<EditItem | null>(null);
  return (
    <TimelineEditContext.Provider value={{ editItem, setEditItem, detailItem, setDetailItem }}>
      {children}
    </TimelineEditContext.Provider>
  );
}

export function useTimelineEdit() {
  const ctx = useContext(TimelineEditContext);
  if (!ctx) throw new Error("useTimelineEdit must be used within a TimelineEditProvider");
  return ctx;
}
