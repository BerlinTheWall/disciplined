import { describe, expect, it } from "vitest";

import type { PendingAction } from "@/lib/api";
import { describePendingAction } from "@/lib/pendingAction";
import type { Task } from "@/types/task";

// The confirmation card is the user's only view of what tapping Yes will run —
// /api/chat/confirm executes the args verbatim with no model in the loop. A
// tool with no case here fell through to a raw JSON dump, which is unreadable
// and hid that the call itself was wrong.

const task = {
  id: "e1",
  title: "Dentist",
  date: "2026-09-16",
  startMinutes: 840,
  durationMinutes: 60,
} as Task;

const lookups = { tasks: [task], habits: [], goals: [] };

function describe_(tool: string, args: Record<string, unknown>) {
  return describePendingAction({ tool, args } as PendingAction, lookups);
}

describe("describePendingAction", () => {
  it("describes update_event in plain language, not JSON", () => {
    const text = describe_("update_event", { event_id: "e1", duration_minutes: 120 });
    expect(text).toBe('Update "Dentist" — duration → 2h');
    expect(text).not.toContain("{");
  });

  it("lists every field an update touches", () => {
    expect(
      describe_("update_event", {
        event_id: "e1",
        title: "Dentist checkup",
        duration_minutes: 90,
        reminder_minutes_before: 15,
      })
    ).toBe(
      'Update "Dentist" — title → "Dentist checkup", duration → 1h 30m, reminder → 15 min before'
    );
  });

  it("names an unresolvable event rather than showing its id", () => {
    const text = describe_("update_event", { event_id: "nope", duration_minutes: 30 });
    expect(text).toBe('Update "(unknown event)" — duration → 30 min');
    expect(text).not.toContain("nope");
  });

  it("covers every mutating tool the assistant can propose", () => {
    const mutating = [
      "create_event",
      "update_event",
      "move_event",
      "delete_event",
      "swap_events",
      "set_event_completion",
      "create_habit",
      "update_habit",
      "delete_habit",
      "set_habit_completion",
      "add_goal_progress",
      "set_goal_done",
    ];
    for (const tool of mutating) {
      expect(describe_(tool, { event_id: "e1", habit_id: "h1", goal_id: "g1" })).not.toContain("{");
    }
  });
});
