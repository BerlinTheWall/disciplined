import { describe, expect, it } from "vitest";

import {
  addDaysISO,
  getDayLabel,
  getWeekDates,
  isSameDay,
  parseISODate,
  relativeDayName,
  todayISODate,
  toISODate,
} from "@/lib/date";

describe("parseISODate / toISODate", () => {
  it("round-trips a date without shifting the day", () => {
    expect(toISODate(parseISODate("2026-08-10"))).toBe("2026-08-10");
  });

  it("parses as local midnight, not UTC", () => {
    // `new Date("2026-08-10")` parses as UTC and lands on the 9th anywhere
    // west of Greenwich. This is the bug the helper exists to avoid, so it is
    // worth asserting rather than assuming.
    const parsed = parseISODate("2026-08-10");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7); // zero-based: August
    expect(parsed.getDate()).toBe(10);
    expect(parsed.getHours()).toBe(0);
  });

  it("pads single-digit months and days", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("uses the local calendar date late in the evening", () => {
    // toISOString() would roll this forward to the next day in any timezone
    // behind UTC.
    expect(toISODate(new Date(2026, 7, 10, 23, 30))).toBe("2026-08-10");
  });
});

describe("addDaysISO", () => {
  it("advances within a month", () => {
    expect(addDaysISO("2026-08-10", 5)).toBe("2026-08-15");
  });

  it("crosses a month boundary", () => {
    expect(addDaysISO("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("crosses a year boundary", () => {
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("goes backwards", () => {
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("getWeekDates", () => {
  it("returns Monday through Sunday for a midweek date", () => {
    // Wednesday 2026-08-12.
    const week = getWeekDates(new Date(2026, 7, 12));
    expect(week).toHaveLength(7);
    expect(toISODate(week[0])).toBe("2026-08-10"); // Monday
    expect(toISODate(week[6])).toBe("2026-08-16"); // Sunday
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // Sunday 2026-08-16 belongs to the week beginning Monday the 10th — the
    // off-by-one that a naive `day - 1` offset gets wrong.
    const week = getWeekDates(new Date(2026, 7, 16));
    expect(toISODate(week[0])).toBe("2026-08-10");
    expect(toISODate(week[6])).toBe("2026-08-16");
  });

  it("normalises to midnight so times don't leak in", () => {
    const week = getWeekDates(new Date(2026, 7, 12, 17, 45));
    expect(week[0].getHours()).toBe(0);
    expect(week[0].getMinutes()).toBe(0);
  });
});

describe("getDayLabel", () => {
  it("is Monday-first", () => {
    expect(getDayLabel(new Date(2026, 7, 10))).toBe("Mon");
    expect(getDayLabel(new Date(2026, 7, 16))).toBe("Sun");
  });
});

describe("isSameDay", () => {
  it("ignores the time of day", () => {
    expect(isSameDay(new Date(2026, 7, 10, 1), new Date(2026, 7, 10, 23))).toBe(true);
  });

  it("separates adjacent days", () => {
    expect(isSameDay(new Date(2026, 7, 10, 23, 59), new Date(2026, 7, 11, 0, 1))).toBe(false);
  });
});

describe("relativeDayName", () => {
  it("names today, tomorrow and yesterday", () => {
    const today = todayISODate();
    expect(relativeDayName(today)).toBe("Today");
    expect(relativeDayName(addDaysISO(today, 1))).toBe("Tomorrow");
    expect(relativeDayName(addDaysISO(today, -1))).toBe("Yesterday");
  });

  it("returns null when a real date is needed", () => {
    expect(relativeDayName(addDaysISO(todayISODate(), 5))).toBeNull();
  });
});
