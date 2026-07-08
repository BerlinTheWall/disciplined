import {
  AlarmClock,
  Bike,
  BookOpen,
  Briefcase,
  Circle,
  Coffee,
  Dumbbell,
  Heart,
  ShoppingCart,
  ShowerHead,
  UtensilsCrossed,
} from "lucide-react";

export const ICONS = {
  alarm: AlarmClock,
  workout: Dumbbell,
  shower: ShowerHead,
  meal: UtensilsCrossed,
  bike: Bike,
  reading: BookOpen,
  coffee: Coffee,
  work: Briefcase,
  health: Heart,
  shopping: ShoppingCart,
  default: Circle,
} as const;

export type IconKey = keyof typeof ICONS;

const ICON_KEYWORDS: { key: IconKey; keywords: string[] }[] = [
  {
    key: "workout",
    keywords: [
      "workout",
      "gym",
      "exercise",
      "lift",
      "weights",
      "training",
      "run",
      "running",
      "jog",
      "push",
      "pull",
      "squat",
      "deadlift",
      "bench",
    ],
  },
  { key: "shower", keywords: ["shower", "bath", "wash", "hygiene", "groom"] },
  {
    key: "meal",
    keywords: [
      "eat",
      "breakfast",
      "lunch",
      "dinner",
      "food",
      "meal",
      "cook",
      "cooking",
      "snack",
      "brunch",
    ],
  },
  { key: "bike", keywords: ["bike", "cycling", "cycle", "bicycle", "ride"] },
  {
    key: "reading",
    keywords: [
      "read",
      "reading",
      "book",
      "study",
      "studying",
      "learn",
      "class",
      "lecture",
      "course",
    ],
  },
  { key: "coffee", keywords: ["coffee", "tea", "cafe", "espresso", "latte"] },
  {
    key: "work",
    keywords: [
      "work",
      "meeting",
      "call",
      "email",
      "office",
      "project",
      "standup",
      "interview",
      "review",
      "presentation",
      "report",
    ],
  },
  {
    key: "health",
    keywords: [
      "health",
      "doctor",
      "meditat",
      "yoga",
      "stretch",
      "breathe",
      "sleep",
      "therapy",
      "dentist",
      "hospital",
      "medicine",
    ],
  },
  {
    key: "shopping",
    keywords: ["shop", "grocery", "groceries", "buy", "purchase", "store", "market"],
  },
  { key: "alarm", keywords: ["wake", "alarm", "morning", "night", "routine"] },
];

export function guessIcon(title: string): IconKey | null {
  const lower = title.toLowerCase();
  for (const { key, keywords } of ICON_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return key;
  }
  return null;
}

// Which link a task/habit plausibly wants, judged from its title keywords or
// the icon the user picked. Used to suggest linking a workout or a recipe.
export function guessLinkKind(title: string, icon: IconKey): "workout" | "meal" | null {
  const workoutish: IconKey[] = ["workout", "bike"];
  const guessed = guessIcon(title);
  if ((guessed && workoutish.includes(guessed)) || workoutish.includes(icon)) return "workout";
  if (guessed === "meal" || icon === "meal") return "meal";
  return null;
}
