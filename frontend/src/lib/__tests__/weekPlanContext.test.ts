import { describe, expect, it } from "vitest";

import {
  goalLinkTarget,
  goalPlanContext,
  openMilestones,
  scheduledThisWeek,
} from "@/lib/weekPlanContext";
import type { Goal, GoalMilestone } from "@/types/goals";
import type { Task } from "@/types/task";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    period: "month",
    periodKey: "2026-09",
    title: "Write a book",
    done: false,
    target: null,
    progress: 0,
    priority: null,
    category: null,
    description: null,
    startDate: "2026-09-01",
    durationCount: 1,
    color: null,
    order: 0,
    linkedTaskIds: [],
    linkedGoalIds: [],
    weights: {},
    milestones: [],
    createdAt: 0,
    ...overrides,
  };
}

function milestone(overrides: Partial<GoalMilestone> = {}): GoalMilestone {
  return { id: "m1", label: "Draft chapter 1", done: false, ...overrides };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Draft: chapter 1",
    startMinutes: 540,
    durationMinutes: 60,
    color: "#000",
    icon: "default",
    completed: false,
    date: "2026-09-14",
    ...overrides,
  } as Task;
}

// Linking a session to a goal that isn't already task-linked changes how that
// goal is tracked (goalProgress picks its mode from what's set), so where a
// session may attach is a correctness question, not a preference.
describe("goalLinkTarget", () => {
  it("sends milestone-tracked goals to their milestone", () => {
    expect(goalLinkTarget(goal({ milestones: [milestone()] }))).toBe("milestone");
  });

  it("links at goal level when the goal is already task-linked", () => {
    expect(goalLinkTarget(goal({ linkedTaskIds: ["t9"] }))).toBe("goal");
  });

  it("links at goal level for a bare check-off goal", () => {
    expect(goalLinkTarget(goal())).toBe("goal");
  });

  it("refuses to link a manual-count goal", () => {
    expect(goalLinkTarget(goal({ target: 10, progress: 3 }))).toBe("none");
  });

  it("refuses to link a goal tracked by sub-goals", () => {
    expect(goalLinkTarget(goal({ linkedGoalIds: ["g2"] }))).toBe("none");
  });
});

describe("openMilestones", () => {
  it("keeps only milestones with nothing booked and nothing ticked", () => {
    const g = goal({
      milestones: [
        milestone({ id: "m1", label: "Outline", done: true }),
        milestone({ id: "m2", label: "Draft chapter 1", linkedTaskIds: ["t1"] }),
        milestone({ id: "m3", label: "Draft chapter 2" }),
      ],
    });
    expect(openMilestones(g)).toEqual([{ id: "m3", label: "Draft chapter 2" }]);
  });
});

describe("scheduledThisWeek", () => {
  const g = goal({
    milestones: [milestone({ id: "m1", linkedTaskIds: ["t1"] })],
    linkedTaskIds: ["t2"],
  });

  it("lists the goal's own and its milestones' sessions inside the window", () => {
    const tasks = [
      task({ id: "t1", date: "2026-09-14", startMinutes: 540, title: "Draft: chapter 1" }),
      task({ id: "t2", date: "2026-09-16", startMinutes: 600, title: "Research" }),
    ];
    expect(scheduledThisWeek(g, tasks, "2026-09-12")).toEqual([
      "Mon 2026-09-14 09:00 — Draft: chapter 1",
      "Wed 2026-09-16 10:00 — Research",
    ]);
  });

  it("ignores sessions outside the 7-day window", () => {
    const tasks = [
      task({ id: "t1", date: "2026-09-11" }), // yesterday
      task({ id: "t2", date: "2026-09-19" }), // day 8
    ];
    expect(scheduledThisWeek(g, tasks, "2026-09-12")).toEqual([]);
  });

  it("ignores tasks that belong to no part of this goal", () => {
    expect(scheduledThisWeek(goal(), [task({ id: "t9" })], "2026-09-12")).toEqual([]);
  });
});

describe("goalPlanContext", () => {
  it("describes a milestone goal by its next steps and remaining runway", () => {
    const g = goal({
      milestones: [
        milestone({ id: "m1", label: "Outline", done: true }),
        milestone({ id: "m2", label: "Draft chapter 1" }),
      ],
    });
    const ctx = goalPlanContext(g, [], [g], "2026-09-12");
    expect(ctx).toEqual({
      deadline: "2026-09-30",
      progressLabel: "1 of 2 milestones done",
      openMilestones: [{ id: "m2", label: "Draft chapter 1" }],
      scheduledThisWeek: [],
    });
  });

  it("reports a manual goal's count and offers no steps", () => {
    const g = goal({ target: 10, progress: 4, milestones: [] });
    const ctx = goalPlanContext(g, [], [g], "2026-09-12");
    expect(ctx.progressLabel).toBe("4 of 10");
    expect(ctx.openMilestones).toEqual([]);
  });

  it("leaves a bare check-off goal without a progress line", () => {
    expect(goalPlanContext(goal(), [], [goal()], "2026-09-12").progressLabel).toBeNull();
  });
});
