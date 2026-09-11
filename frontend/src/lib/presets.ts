import type { ConfirmOptions } from "@/components/ConfirmDialog";
import type { SubscriptionTier } from "@/lib/api";
import type { IconKey } from "@/lib/icons";
import type { Priority } from "@/types/task";

// A fully-configured task, one tap away from being added to the schedule —
// no title/time/duration decisions left for the user to make. Users create
// these from any task they add (see AddItemSheet's "Save as preset" star);
// there are no built-in ones.
export interface TaskPreset {
  id: string;
  title: string;
  icon: IconKey;
  color: string;
  durationMinutes: number;
  reminderMinutesBefore: number | null;
  priority: Priority | null;
}

// Presets are meant to be a short, hand-picked set of go-to tasks, not a
// second task list — a cap keeps Plan Your Day's one-tap row scannable.
export const MAX_PRESETS = 5;

// Presets are a Plus/Pro feature. They're device-local (never sent to the
// backend), so this is enforced in the UI and in presetStore.addPreset —
// check it with lib/tiers.ts's hasTier/useHasTier.
export const PRESETS_MIN_TIER: SubscriptionTier = "plus";

// What a free user sees when they reach for a preset (a star, the menu entry).
// Billing doesn't exist yet, so this explains rather than links to a purchase.
export const PRESETS_LOCKED_DIALOG: ConfirmOptions = {
  title: "Presets are a Plus feature",
  message:
    "Save your go-to tasks and habits and add them to your day in one tap. Available on the Plus and Pro plans.",
  confirmLabel: "Got it",
  hideCancel: true,
};
