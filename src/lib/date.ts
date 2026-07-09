const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toISODate(date: Date) {
  // Local calendar date — never toISOString(), which converts to UTC and is
  // off by one from evening/early-morning depending on the timezone.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISODate() {
  return toISODate(new Date());
}

export function getWeekDates(anchorDate: Date) {
  const day = anchorDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchorDate);
  monday.setDate(anchorDate.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getDayLabel(date: Date) {
  return DAY_LABELS[(date.getDay() + 6) % 7];
}

export function isSameDay(a: Date, b: Date) {
  return toISODate(a) === toISODate(b);
}

// "Today" / "Tomorrow" / "Yesterday", or null when the day needs a real date.
export function relativeDayName(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return null;
}
