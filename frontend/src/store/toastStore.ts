import { create } from "zustand";

// A brief, auto-dismissing confirmation message — e.g. "Google Calendar
// connected" after the OAuth redirect completes, where there's otherwise no
// visible feedback that anything happened. Deliberately not reused for the
// reminder/nudge banners (ReminderHost/NudgeHost) — those are scheduled,
// domain-specific alerts with their own actions (Done/Snooze); this is a
// generic, fire-and-forget toast for one-off confirmations.

// Success toasts are just a quick confirmation, so they clear fast; errors
// stay up longer since they're worth actually reading (often "try again").
const AUTO_DISMISS_MS = { success: 2000, error: 4000 };

interface ToastState {
  message: string | null;
  kind: "success" | "error";
  show: (message: string, kind?: "success" | "error") => void;
  dismiss: () => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  kind: "success",
  show: (message, kind = "success") => {
    window.clearTimeout(dismissTimer);
    set({ message, kind });
    dismissTimer = window.setTimeout(() => set({ message: null }), AUTO_DISMISS_MS[kind]);
  },
  dismiss: () => {
    window.clearTimeout(dismissTimer);
    set({ message: null });
  },
}));
