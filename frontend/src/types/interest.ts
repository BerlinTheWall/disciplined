import type { IconKey } from "@/lib/icons";

// A loose, unscheduled activity the user wants to make time for (e.g.
// "Reading") — lighter than a Habit (no fixed days/time). The nudge engine
// watches for it via completed-event title matches, not a linked id.
export interface Interest {
  id: string;
  title: string;
  icon: IconKey;
  createdAt: number; // epoch ms
}
