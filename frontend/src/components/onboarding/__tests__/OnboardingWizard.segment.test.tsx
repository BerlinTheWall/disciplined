import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

const setSegment = vi.fn();

vi.mock("@/store/authStore", () => ({
  useAuthStore: { getState: () => ({ setSegment }) },
}));

// Reaches the "What best describes you?" step from the wizard's first screen.
async function openSegmentStep(user: ReturnType<typeof userEvent.setup>) {
  render(<OnboardingWizard />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Start planning" }));
  return screen.getByRole("button", { name: "Continue" });
}

// The picker paints its selection with a ring on the button itself.
const isSelected = (label: string) =>
  screen.getByRole("button", { name: label }).style.boxShadow !== "";

describe("onboarding segment picker", () => {
  beforeEach(() => setSegment.mockClear());

  it("starts with nothing selected — the step is optional", async () => {
    const user = userEvent.setup();
    await openSegmentStep(user);
    for (const label of ["Student", "Working professional", "Manager / team lead"]) {
      expect(isSelected(label)).toBe(false);
    }
  });

  it("does not call the API while the user is browsing options", async () => {
    const user = userEvent.setup();
    await openSegmentStep(user);

    await user.click(screen.getByRole("button", { name: "Student" }));
    await user.click(screen.getByRole("button", { name: "Manager / team lead" }));
    await user.click(screen.getByRole("button", { name: "Parent / caregiver" }));

    expect(isSelected("Parent / caregiver")).toBe(true);
    expect(setSegment).not.toHaveBeenCalled();
  });

  it("sends the settled answer once, on Continue", async () => {
    const user = userEvent.setup();
    const cont = await openSegmentStep(user);

    await user.click(screen.getByRole("button", { name: "Student" }));
    await user.click(screen.getByRole("button", { name: "Manager / team lead" }));
    await user.click(cont);

    expect(setSegment).toHaveBeenCalledTimes(1);
    expect(setSegment).toHaveBeenCalledWith("manager");
  });

  it("lets the user take the answer back, and then sends nothing", async () => {
    const user = userEvent.setup();
    const cont = await openSegmentStep(user);

    await user.click(screen.getByRole("button", { name: "Student" }));
    expect(isSelected("Student")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Student" }));
    expect(isSelected("Student")).toBe(false);

    await user.click(cont);
    expect(setSegment).not.toHaveBeenCalled();
  });

  it("skips the call entirely when the step is left untouched", async () => {
    const user = userEvent.setup();
    const cont = await openSegmentStep(user);
    await user.click(cont);
    expect(setSegment).not.toHaveBeenCalled();
  });
});
