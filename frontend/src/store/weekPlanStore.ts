import { create } from "zustand";

import { api, type PendingAction } from "@/lib/api";
import { refreshForActions } from "@/store/chatStore";

// State for the week auto-plan sheet — deliberately its own store, separate
// from chatStore, so a bug here can't affect the chat assistant. The only
// thing it borrows from chatStore is refreshForActions, already exported
// there specifically so other features can reuse the post-confirm refresh
// logic without duplicating it.

interface State {
  isOpen: boolean;
  busy: boolean;
  message: string | null;
  pendingActions: PendingAction[];
  resolved: boolean;
  error: string | null;
}

interface Actions {
  openAndGenerate: () => Promise<void>;
  close: () => void;
  removeProposal: (index: number) => void;
  confirm: () => Promise<void>;
  discard: () => void;
}

const initialState: State = {
  isOpen: false,
  busy: false,
  message: null,
  pendingActions: [],
  resolved: false,
  error: null,
};

export const useWeekPlanStore = create<State & Actions>()((set, get) => ({
  ...initialState,

  openAndGenerate: async () => {
    set({ ...initialState, isOpen: true, busy: true });
    try {
      const res = await api.weekPlan.generate();
      set({ busy: false, message: res.message, pendingActions: res.pendingActions });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Couldn't plan your week — please try again.",
      });
    }
  },

  close: () => set({ isOpen: false }),

  removeProposal: (index) => {
    set((state) => ({
      pendingActions: state.pendingActions.filter((_, i) => i !== index),
    }));
  },

  confirm: async () => {
    const { pendingActions } = get();
    if (!pendingActions.length || get().resolved) return;
    set({ busy: true });
    try {
      await api.confirmChatActions(pendingActions);
      await refreshForActions(pendingActions);
      set({ busy: false, resolved: true });
    } catch (e) {
      set({
        busy: false,
        error: e instanceof Error ? e.message : "Something went wrong confirming that.",
      });
    }
  },

  discard: () => set({ isOpen: false }),
}));
