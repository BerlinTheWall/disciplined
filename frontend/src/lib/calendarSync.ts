import type { Task } from "@/types/task";

// A Task is ever linked to at most one connected-calendar provider — see
// lib/deviceCalendarSync.ts and backend outlook_graph.py/google_calendar.py's
// reconcile_* for how these fields get set. Mirrors the equivalent inline
// logic in TaskDetailSheet.tsx (which also needs each provider's logo, so it
// keeps its own copy rather than importing this).
export function syncedProviderName(
  task: Pick<Task, "googleEventId" | "outlookEventId" | "appleLinked">
): string | null {
  if (task.googleEventId) return "Google Calendar";
  if (task.outlookEventId) return "Outlook";
  if (task.appleLinked) return "Apple Calendar";
  return null;
}

// Appended to a delete-confirmation message for a calendar-linked task —
// deleting it in Disciplined also deletes the mirrored event on the real
// calendar (see routers/events.py's delete_event / tools.py's _delete_event),
// which is easy to forget since day-to-day edits sync silently.
export function deleteSyncWarning(
  task: Pick<Task, "googleEventId" | "outlookEventId" | "appleLinked">
): string {
  const provider = syncedProviderName(task);
  return provider ? ` This will also remove it from ${provider}.` : "";
}
