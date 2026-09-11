import { beforeEach, describe, expect, it } from "vitest";

import type { AuthUser, SubscriptionTier } from "@/lib/api";
import { MAX_PRESETS, type TaskPreset } from "@/lib/presets";
import { hasTier, tierOf } from "@/lib/tiers";
import { useAuthStore } from "@/store/authStore";
import { usePresetStore } from "@/store/presetStore";

const account = (subscriptionTier?: SubscriptionTier): AuthUser => ({
  id: "u1",
  email: "a@example.com",
  firstName: "A",
  lastName: "B",
  displayName: "A",
  emailVerified: true,
  subscriptionTier,
});

const preset = (title: string): Omit<TaskPreset, "id"> => ({
  title,
  icon: "default",
  color: "#34d399",
  durationMinutes: 30,
  reminderMinutesBefore: null,
  priority: null,
});

describe("hasTier", () => {
  it("ranks free < plus < pro", () => {
    expect(hasTier(account("free"), "plus")).toBe(false);
    expect(hasTier(account("plus"), "plus")).toBe(true);
    expect(hasTier(account("pro"), "plus")).toBe(true);
    expect(hasTier(account("plus"), "pro")).toBe(false);
  });

  it("fails closed: no user, a missing tier, or an unknown one count as free", () => {
    expect(hasTier(null, "plus")).toBe(false);
    expect(hasTier(account(undefined), "plus")).toBe(false);
    expect(hasTier(account("platinum" as SubscriptionTier), "plus")).toBe(false);
    expect(hasTier(account("toString" as SubscriptionTier), "free")).toBe(true);
    expect(tierOf(account("toString" as SubscriptionTier))).toBe("free");
    expect(hasTier(account(undefined), "free")).toBe(true);
  });
});

describe("presetStore", () => {
  beforeEach(() => {
    usePresetStore.setState({ presets: [] });
    useAuthStore.setState({ user: account("plus") });
  });

  it("refuses to save presets below the Plus plan", () => {
    useAuthStore.setState({ user: account("free") });
    usePresetStore.getState().addPreset(preset("Journal"));
    expect(usePresetStore.getState().presets).toHaveLength(0);
  });

  it(`keeps at most ${MAX_PRESETS} presets`, () => {
    const { addPreset } = usePresetStore.getState();
    for (let i = 0; i < MAX_PRESETS + 2; i++) addPreset(preset(`Task ${i}`));
    const titles = usePresetStore.getState().presets.map((p) => p.title);
    expect(titles).toHaveLength(MAX_PRESETS);
    expect(titles).not.toContain(`Task ${MAX_PRESETS}`);
  });

  it("frees a slot when one is removed", () => {
    const { addPreset } = usePresetStore.getState();
    for (let i = 0; i < MAX_PRESETS; i++) addPreset(preset(`Task ${i}`));
    usePresetStore.getState().removePreset(usePresetStore.getState().presets[0].id);
    addPreset(preset("Newcomer"));
    const titles = usePresetStore.getState().presets.map((p) => p.title);
    expect(titles).toHaveLength(MAX_PRESETS);
    expect(titles).toContain("Newcomer");
  });

  it("skips a duplicate title, case-insensitively", () => {
    const { addPreset } = usePresetStore.getState();
    addPreset(preset("Journal"));
    addPreset(preset("  journal "));
    expect(usePresetStore.getState().presets).toHaveLength(1);
  });
});
