import { describe, expect, it } from "vitest";

import { guessIcon, ICONS } from "@/lib/icons";

describe("guessIcon", () => {
  it.each([
    ["Wake up", "alarm"],
    ["Slow morning", "morning"],
    ["Sleep", "sleep"],
    ["Wind down", "sleep"],
    ["Folic acid pill", "meds"],
    ["Vitamin B + D", "meds"],
    ["Meditation and prayer", "mind"],
    ["Movement 1 of 3", "walk"],
    ["30 minute walk", "walk"],
    ["Walk the dog", "pet"],
    ["Algorithms", "code"],
    ["Coding mock", "code"],
    ["System design mock", "target"],
    ["Apply x 5", "send"],
    ["Referral outreach x 3", "send"],
    ["Weekly review", "work"],
    ["Recall", "study"],
    ["Write the grocery list", "shopping"],
    ["Meal prep", "meal"],
    ["Call mom", "call"],
    ["Pay the phone bill", "call"],
    ["Plan the vacation", "travel"],
    ["Visit parents", null],
  ])("%s -> %s", (title, expected) => {
    expect(guessIcon(title)).toBe(expected);
  });

  it("only ever guesses a registered icon", () => {
    for (const title of ["dog", "water", "clean", "budget", "guitar", "game", "home", "friend"]) {
      const key = guessIcon(title);
      expect(key).not.toBeNull();
      expect(ICONS).toHaveProperty(key as string);
    }
  });
});
