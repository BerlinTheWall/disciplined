// Small shared vocabulary for the week-plan wizard, mirroring the pattern of
// timeline/addItemOptions.ts.

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "any", label: "Any time" },
];

export const TIMES_PER_WEEK_OPTIONS = [1, 2, 3, 4, 5];
