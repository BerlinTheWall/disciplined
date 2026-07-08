import { create } from "zustand";

// Editing mode for the schedule page. Tapping a row only opens the edit sheet
// while this is on; it's toggled by the pencil button in the page header and
// switched off when navigating away. Not persisted — a fresh session starts
// in normal mode.

interface State {
  editMode: boolean;
  toggleEditMode: () => void;
  setEditMode: (on: boolean) => void;
}

export const useScheduleEditStore = create<State>((set) => ({
  editMode: false,
  toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
  setEditMode: (editMode) => set({ editMode }),
}));
