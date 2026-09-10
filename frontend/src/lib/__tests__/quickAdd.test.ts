import { describe, expect, it } from "vitest";

import { parseQuickAdd } from "@/lib/quickAdd";

// Wednesday 12 August 2026, 10:15 local. Every expectation below is relative
// to this, so the suite does not change meaning with the wall clock.
const NOW = new Date(2026, 7, 12, 10, 15);

const parse = (input: string) => parseQuickAdd(input, NOW);

describe("times", () => {
  it("reads a 12-hour time", () => {
    expect(parse("gym 6am")).toMatchObject({ startMinutes: 6 * 60, timeGiven: "exact" });
  });

  it("reads a 12-hour time with minutes", () => {
    expect(parse("standup 9:30am")).toMatchObject({ startMinutes: 9 * 60 + 30 });
  });

  it("puts pm in the afternoon", () => {
    expect(parse("dentist 3pm")).toMatchObject({ startMinutes: 15 * 60 });
  });

  it("keeps 12am at midnight and 12pm at noon", () => {
    expect(parse("thing 12am")).toMatchObject({ startMinutes: 0 });
    expect(parse("thing 12pm")).toMatchObject({ startMinutes: 12 * 60 });
  });

  it("reads a 24-hour time", () => {
    expect(parse("meeting 14:30")).toMatchObject({
      startMinutes: 14 * 60 + 30,
      timeGiven: "exact",
    });
  });

  it("accepts a dot as the minute separator", () => {
    expect(parse("call 7.45pm")).toMatchObject({ startMinutes: 19 * 60 + 45 });
  });

  it("marks a bare hour as a guess needing confirmation", () => {
    // "at 7" is ambiguous — the UI asks rather than silently picking.
    expect(parse("wake up at 7")).toMatchObject({ startMinutes: 7 * 60, timeGiven: "vague" });
  });

  it("maps time-of-day words", () => {
    expect(parse("read evening")).toMatchObject({ startMinutes: 19 * 60, timeGiven: "vague" });
    expect(parse("run morning")).toMatchObject({ startMinutes: 8 * 60, timeGiven: "vague" });
  });

  it("prefers an explicit clock time over a vague word", () => {
    expect(parse("run morning 6am")).toMatchObject({ startMinutes: 6 * 60, timeGiven: "exact" });
  });

  it("defaults an undated task to the next round hour", () => {
    // 10:15 now -> 11:00.
    expect(parse("email bob")).toMatchObject({ startMinutes: 11 * 60, timeGiven: "none" });
  });
});

describe("dates", () => {
  it("resolves tomorrow", () => {
    expect(parse("dentist tomorrow 3pm")).toMatchObject({ date: "2026-08-13", dateGiven: true });
  });

  it("resolves today", () => {
    expect(parse("dentist today 3pm")).toMatchObject({ date: "2026-08-12", dateGiven: true });
  });

  it("treats tonight as today evening", () => {
    expect(parse("read tonight")).toMatchObject({
      date: "2026-08-12",
      startMinutes: 19 * 60,
      timeGiven: "vague",
    });
  });

  it("resolves a single weekday to the next such day", () => {
    // Next Friday from Wednesday the 12th is the 14th.
    expect(parse("dentist friday 3pm")).toMatchObject({ date: "2026-08-14", dateGiven: true });
  });

  it("counts today as the soonest match for its own weekday", () => {
    // NOW is a Wednesday, so "wednesday" means today, not next week.
    expect(parse("dentist wednesday 3pm")).toMatchObject({ date: "2026-08-12" });
  });

  it("wraps to next week for a weekday already past", () => {
    // Tuesday has gone; the next one is the 18th.
    expect(parse("dentist tuesday 3pm")).toMatchObject({ date: "2026-08-18" });
  });

  it("flags an undated task so the UI can ask", () => {
    expect(parse("email bob")).toMatchObject({ dateGiven: false });
  });
});

describe("tasks vs habits", () => {
  it("treats a single day as a one-off task", () => {
    expect(parse("dentist friday 3pm")).toMatchObject({ kind: "task" });
  });

  it("treats two or more weekdays as a habit", () => {
    expect(parse("gym mon wed fri 6am")).toMatchObject({
      kind: "habit",
      daysOfWeek: [1, 3, 5],
      startMinutes: 6 * 60,
    });
  });

  it("treats 'every <weekday>' as a habit even with one day", () => {
    expect(parse("every monday standup 9am")).toMatchObject({
      kind: "habit",
      daysOfWeek: [1],
    });
  });

  it("expands daily and everyday to all seven days", () => {
    expect(parse("meditate daily 7am")).toMatchObject({
      kind: "habit",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("expands weekdays and weekends", () => {
    expect(parse("standup weekdays 9am")).toMatchObject({ daysOfWeek: [1, 2, 3, 4, 5] });
    expect(parse("brunch weekends 11am")).toMatchObject({ daysOfWeek: [0, 6] });
  });

  it("reads 'every morning' as a daily habit at the morning default", () => {
    expect(parse("stretch every morning")).toMatchObject({
      kind: "habit",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startMinutes: 8 * 60,
    });
  });

  it("lets an explicit time override the time-of-day word", () => {
    expect(parse("stretch every morning at 6:15am")).toMatchObject({
      kind: "habit",
      startMinutes: 6 * 60 + 15,
    });
  });

  it("defaults a habit to 9:00 when no time is given", () => {
    expect(parse("gym mon wed fri")).toMatchObject({ startMinutes: 9 * 60 });
  });
});

describe("durations", () => {
  it("reads minutes", () => {
    expect(parse("read 20min tonight")).toMatchObject({ durationMinutes: 20 });
  });

  it("reads a bare m suffix", () => {
    expect(parse("read 45m tonight")).toMatchObject({ durationMinutes: 45 });
  });

  it("reads hours", () => {
    expect(parse("study 2h tomorrow 9am")).toMatchObject({ durationMinutes: 120 });
  });

  it("reads a combined hours-and-minutes duration", () => {
    expect(parse("study 1h30m tomorrow 9am")).toMatchObject({ durationMinutes: 90 });
  });

  it("defaults to 30 minutes", () => {
    expect(parse("dentist tomorrow 3pm")).toMatchObject({ durationMinutes: 30 });
  });

  it("clamps a duration so it cannot spill past midnight", () => {
    const parsed = parse("marathon tomorrow 11pm 5h");
    expect(parsed?.startMinutes).toBe(23 * 60);
    expect(parsed?.durationMinutes).toBe(60);
  });
});

describe("titles", () => {
  it("strips the parsed tokens out of the title", () => {
    expect(parse("gym mon wed fri 6am")?.title).toBe("gym");
    expect(parse("dentist tomorrow 3pm")?.title).toBe("dentist");
  });

  it("strips a leading create-phrase", () => {
    expect(parse("remind me to call mom tomorrow 3pm")?.title).toBe("call mom");
    expect(parse("i want to read tonight")?.title).toBe("read");
    expect(parse("create a task to wake up at 7")?.title).toBe("wake up");
  });

  it("leaves an ambiguous 'add' alone when it isn't a create-phrase", () => {
    // "add oil to car" is the task, not "add <a task>".
    expect(parse("add oil to car tomorrow 3pm")?.title).toBe("add oil to car");
  });

  it("returns null when nothing is left to name the item", () => {
    expect(parse("tomorrow 3pm")).toBeNull();
    expect(parse("")).toBeNull();
  });
});
