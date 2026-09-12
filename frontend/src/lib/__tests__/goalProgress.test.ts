import { describe, expect, it } from "vitest";

import { goalExpectedFraction } from "@/lib/goalProgress";

// A local-time moment on an ISO day — same local-midnight basis parseISODate
// uses, plus `hour`.
const at = (iso: string, hour = 0) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, hour);
};

describe("goalExpectedFraction", () => {
  // A week goal started on a Wednesday runs Wed 2026-09-09 → Tue 2026-09-15.
  const weekFromWednesday = {
    period: "week" as const,
    periodKey: "2026-09-07",
    startDate: "2026-09-09",
    durationCount: 1,
  };

  it("is 0 at (and before) the goal's own start date", () => {
    expect(goalExpectedFraction(weekFromWednesday, at("2026-09-09"))).toBe(0);
    expect(goalExpectedFraction(weekFromWednesday, at("2026-09-07"))).toBe(0);
  });

  it("measures from the goal's start date, not its calendar period", () => {
    // Midway through the 7-day run: Saturday noon is 3.5 days in.
    expect(goalExpectedFraction(weekFromWednesday, at("2026-09-12", 12))).toBeCloseTo(0.5);
  });

  it("counts the end date as a whole day, reaching 1 only after it", () => {
    expect(goalExpectedFraction(weekFromWednesday, at("2026-09-15", 12))).toBeLessThan(1);
    expect(goalExpectedFraction(weekFromWednesday, at("2026-09-16"))).toBe(1);
    expect(goalExpectedFraction(weekFromWednesday, at("2026-10-01"))).toBe(1);
  });

  it("falls back to the period's start when no start date is set", () => {
    const month = {
      period: "month" as const,
      periodKey: "2026-09",
      startDate: null,
      durationCount: null,
    };
    // September has 30 days; the 16th at midnight is 15 days in.
    expect(goalExpectedFraction(month, at("2026-09-16"))).toBeCloseTo(15 / 30);
  });
});
