import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

import { api, type CalendarEventOut } from "@/lib/api";
import { formatTimeLabel } from "@/lib/time";

interface ExternalCalendarStripProps {
  date: string; // ISO date, e.g. "2026-08-04"
}

// Read-only strip of the day's events from connected device calendars
// (Apple/Google/Outlook — see Settings > Connected calendars). Deliberately
// separate from DaySchedule's Task/Habit layout engine rather than merged
// into it: these items aren't toggleable or editable in Disciplined, and
// DaySchedule's connector/overlap layout assumes both.
export default function ExternalCalendarStrip({ date }: ExternalCalendarStripProps) {
  // Keyed by date rather than reset-then-refetch: switching days just reads
  // (and lazily fills) a different cache entry, so there's nothing to clear
  // synchronously on date change.
  const [byDate, setByDate] = useState<Record<string, CalendarEventOut[]>>({});

  useEffect(() => {
    if (byDate[date] !== undefined) return;
    let cancelled = false;
    const start = new Date(`${date}T00:00:00`).toISOString();
    const end = new Date(`${date}T23:59:59.999`).toISOString();
    api.calendarEvents
      .list(start, end)
      .then((result) => {
        if (!cancelled) setByDate((prev) => ({ ...prev, [date]: result }));
      })
      .catch(() => {
        if (!cancelled) setByDate((prev) => ({ ...prev, [date]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [date, byDate]);

  const events = byDate[date];
  if (!events || events.length === 0) return null;

  return (
    <div className="px-5 pt-2 pb-1 flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide px-1">
        From your calendars
      </p>
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-raised/60 border border-dashed border-border"
        >
          <CalendarDays size={14} className="text-fg-faint shrink-0" />
          <span className="flex-1 min-w-0 text-sm text-fg-muted truncate">{e.title}</span>
          <span className="text-xs text-fg-faint shrink-0">
            {e.allDay
              ? "All day"
              : formatTimeLabel(
                  new Date(e.startAt).getHours() * 60 + new Date(e.startAt).getMinutes()
                )}
          </span>
        </div>
      ))}
    </div>
  );
}
