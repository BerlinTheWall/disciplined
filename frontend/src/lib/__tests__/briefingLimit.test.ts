import { describe, expect, it } from "vitest";

import { briefingLimitDialog, utcToday } from "@/lib/briefingLimit";

const AMY = "en-US-Ava:DragonHDLatestNeural";
const FRANK = "en-US-Andrew:DragonHDLatestNeural";

describe("utcToday", () => {
  it("uses the UTC day, matching the backend's quota day", () => {
    // 23:30 on the 14th in Toronto is already the 15th in UTC.
    expect(utcToday(new Date("2026-09-15T03:30:00Z"))).toBe("2026-09-15");
  });
});

describe("briefingLimitDialog", () => {
  it("offers switching back when today's summary was made in another voice", () => {
    const { options, switchTo } = briefingLimitDialog(AMY, FRANK);
    expect(switchTo).toBe(AMY);
    expect(options.confirmLabel).toBe("Switch to Amy");
    expect(options.message).toContain("Amy's voice");
    expect(options.message).toContain("try Frank tomorrow");
    expect(options.hideCancel).toBeFalsy();
  });

  it("only acknowledges when the blocked voice is the one already used", () => {
    const { options, switchTo } = briefingLimitDialog(FRANK, FRANK);
    expect(switchTo).toBeNull();
    expect(options.hideCancel).toBe(true);
    expect(options.message).toContain("tomorrow");
  });

  it("explains without a switch button when the used voice is unknown", () => {
    const { options, switchTo } = briefingLimitDialog(null, FRANK);
    expect(switchTo).toBeNull();
    expect(options.hideCancel).toBe(true);
    expect(options.message).toContain("another voice");
  });
});
