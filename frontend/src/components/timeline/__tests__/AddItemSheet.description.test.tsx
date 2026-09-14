import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfirmProvider } from "@/components/ConfirmDialog";
import AddItemSheet from "@/components/timeline/AddItemSheet";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/task";

const task: Task = {
  id: "t1",
  title: "Dentist",
  startMinutes: 600,
  durationMinutes: 60,
  color: "#34d399",
  icon: "health",
  completed: false,
  date: "2026-09-14",
  description: "Bring the insurance card",
};

const habit: Habit = {
  id: "h1",
  title: "Stretch",
  startMinutes: 420,
  durationMinutes: 10,
  color: "#34d399",
  icon: "workout",
  daysOfWeek: [1, 3, 5],
  completedDates: [],
  description: "Hamstrings, then hips",
};

describe("AddItemSheet description", () => {
  it("shows the description field when editing a task", () => {
    render(
      <ConfirmProvider>
        <AddItemSheet isOpen onClose={() => {}} editItem={{ type: "task", data: task }} />
      </ConfirmProvider>
    );
    const field = screen.getByLabelText("Description");
    expect(field).toBeInTheDocument();
    expect(field).toHaveValue("Bring the insurance card");
  });

  it("shows the description field when editing a habit", () => {
    render(
      <ConfirmProvider>
        <AddItemSheet isOpen onClose={() => {}} editItem={{ type: "habit", data: habit }} />
      </ConfirmProvider>
    );
    expect(screen.getByLabelText("Description")).toHaveValue("Hamstrings, then hips");
  });
});
