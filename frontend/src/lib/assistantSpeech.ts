import type { IconKey } from "@/lib/icons";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore, type VoiceTone } from "@/store/settingsStore";

// Composes the sentence a reminder speaks — phrased like a personal assistant
// giving a heads-up, not like a machine reading a log line. Two axes shape
// the wording: the user's chosen voiceTone (Settings > Voice) and a coarse
// category guessed from the item's icon (a health reminder reads differently
// than a work one). Picks a random variant so back-to-back reminders don't
// sound canned; a caller-provided seed makes the choice stable instead (see
// reminderAudio.ts — the same reminder must always produce the same
// sentence, or its pre-synthesized notification audio would need redoing).

// "6 PM", "6:15 PM" — the way a person says a clock time.
function spokenTime(startMinutes: number) {
  const m = ((startMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return min === 0 ? `${h} ${period}` : `${h}:${String(min).padStart(2, "0")} ${period}`;
}

// "in 5 minutes", "in half an hour", "in about an hour".
function spokenLead(minutes: number) {
  if (minutes <= 1) return "in a minute";
  if (minutes >= 28 && minutes <= 32) return "in half an hour";
  if (minutes >= 55 && minutes <= 70) return "in about an hour";
  if (minutes > 70) return `in about ${Math.round(minutes / 30) / 2} hours`;
  return `in ${minutes} minutes`;
}

// "for 45 minutes", "for an hour", "for an hour and a half".
function spokenDuration(mins: number) {
  if (mins < 60) return `for ${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h === 1 ? "an hour" : `${h} hours`;
  if (m === 0) return `for ${hours}`;
  if (m === 30) return `for ${h === 1 ? "an hour and a half" : `${h} and a half hours`}`;
  return `for ${hours} and ${m} minutes`;
}

// Random normally; a caller-provided seed makes the choice stable — the
// pre-synthesized notification audio must produce the same sentence for the
// same reminder on every schedule sync, or each sync would re-synthesize it.
function pick(variants: string[], seed?: number) {
  if (seed !== undefined) return variants[Math.abs(seed) % variants.length];
  return variants[Math.floor(Math.random() * variants.length)];
}

// "Sam, " or "" — folded into the front of a lowercase continuation. Fine for
// speech (capitalization is inaudible); these lines are never shown as text,
// only spoken (see ReminderHost.tsx — the visible banner uses a separate,
// plain `body` string).
function greet(name: string) {
  return name ? `${name}, ` : "";
}

type ReminderCategory = "health" | "work" | "study" | "general";

// Coarse bucket driving which phrasing set a reminder gets. Only the icons
// with a genuinely different natural tone get their own category — everything
// else (meals, workouts, shopping, alarms, default) reads fine as general.
function reminderCategory(icon: IconKey): ReminderCategory {
  if (icon === "health") return "health";
  if (icon === "work") return "work";
  if (icon === "reading") return "study"; // closest icon to studying/exams
  return "general";
}

interface LineCtx {
  name: string;
  title: string;
  time: string;
  lead: string;
}

type LineSet = Record<
  ReminderCategory,
  { now: (c: LineCtx) => string[]; upcoming: (c: LineCtx) => string[] }
>;

// One entry per voiceTone (Settings > Voice > Tone), each branching further by
// category and by whether the item is starting now or still ahead.
const TEMPLATES: Record<VoiceTone, LineSet> = {
  // Personal-assistant warmth — the original, and still the default.
  warm: {
    general: {
      now: ({ name, title, time }) => [
        `${greet(name)}it's ${time} — time for ${title}.`,
        `${title} is starting now.`,
        `Time for ${title} — it's ${time}.`,
      ],
      upcoming: ({ name, title, time, lead }) => [
        `${greet(name)}quick heads-up — ${title} starts ${lead}, at ${time}.`,
        `Just a reminder: ${title} is coming up ${lead}.`,
        `${title} starts ${lead}. That's at ${time}.`,
      ],
    },
    health: {
      now: ({ name, title }) => [
        `${greet(name)}it's time for ${title}. Don't skip this one.`,
        `${greet(name)}just a gentle reminder — it's time for ${title}.`,
        `${title} is due right now.`,
      ],
      upcoming: ({ name, title, time, lead }) => [
        `${greet(name)}${title} comes up ${lead}, at ${time} — plenty of time to get ready.`,
        `A gentle heads-up: ${title} is coming up ${lead}.`,
        `${greet(name)}don't forget — ${title} is coming up ${lead}.`,
      ],
    },
    work: {
      now: ({ name, title, time }) => [
        `${greet(name)}it's ${time} — ${title} is starting.`,
        `Heads up — ${title} is starting now.`,
        `${title} is starting right now, ${time}.`,
      ],
      upcoming: ({ name, title, time, lead }) => [
        `${greet(name)}${title} starts ${lead}, at ${time} — might be worth wrapping up what you're doing.`,
        `Just a heads-up: ${title} is coming up ${lead}.`,
        `${greet(name)}${title} is coming up ${lead}.`,
      ],
    },
    study: {
      now: ({ name, title }) => [
        `${greet(name)}it's time for ${title}.`,
        `${title} is starting now — good luck.`,
        `Time to focus: ${title} is starting.`,
      ],
      upcoming: ({ name, title, time, lead }) => [
        `${greet(name)}${title} is coming up ${lead}, at ${time} — good time to review your notes.`,
        `Heads up — ${title} starts ${lead}.`,
        `${greet(name)}${title} is coming up ${lead}. You've got this.`,
      ],
    },
  },

  // Brisk and efficient — says the fact, adds only what's actionable.
  direct: {
    general: {
      now: ({ title, time }) => [`${title}. It's ${time}.`, `Now: ${title}.`, `${title} — go.`],
      upcoming: ({ title, time, lead }) => [
        `${title} ${lead}.`,
        `${title}, ${lead}.`,
        `Heads up — ${title}, ${time}.`,
      ],
    },
    health: {
      now: ({ title }) => [
        `Time for ${title}.`,
        `${title} — don't skip it.`,
        `${title} is due now.`,
      ],
      upcoming: ({ title, time, lead }) => [
        `${title} ${lead}. Don't skip it.`,
        `Reminder: ${title}, ${lead}.`,
        `${title} at ${time} — ${lead}.`,
      ],
    },
    work: {
      now: ({ title, time }) => [
        `${title} starting now.`,
        `Go — ${title} is starting.`,
        `${title}. It's ${time}. You're on.`,
      ],
      upcoming: ({ title, time, lead }) => [
        `${title} ${lead} — you should get moving.`,
        `Heads up: ${title} starts ${lead}. Time to wrap up.`,
        `${title} ${lead}, at ${time}. Better get going.`,
      ],
    },
    study: {
      now: ({ title }) => [
        `${title}. Let's go.`,
        `Time for ${title}. Focus up.`,
        `${title} starts now. No more scrolling.`,
      ],
      upcoming: ({ title, time, lead }) => [
        `${title} ${lead}. Time to get serious.`,
        `${title} ${lead} — make it count.`,
        `Heads up: ${title} at ${time}, ${lead}. Get focused.`,
      ],
    },
  },

  // Energetic coach — pushes and encourages, never scolds.
  motivational: {
    general: {
      now: ({ name, title }) => [
        `${greet(name)}let's go — ${title}, right now!`,
        `Time to shine: ${title} starts now.`,
        `${title} is here — make it count.`,
      ],
      upcoming: ({ name, title, lead }) => [
        `${greet(name)}${title} is coming up ${lead} — get ready to crush it.`,
        `${title} ${lead}. You've got this.`,
        `Coming up ${lead}: ${title}. Let's make it a good one.`,
      ],
    },
    health: {
      now: ({ name, title }) => [
        `${greet(name)}time to take care of yourself — ${title}, right now.`,
        `${title} time! Your future self will thank you.`,
        `Don't forget ${title} — you're doing great.`,
      ],
      upcoming: ({ name, title, lead }) => [
        `${greet(name)}${title} is coming up ${lead} — keep taking care of yourself.`,
        `${title} ${lead}. Small habits, big difference.`,
        `Heads up — ${title} coming up ${lead}. Stay on top of it.`,
      ],
    },
    work: {
      now: ({ name, title }) => [
        `${greet(name)}showtime — ${title} starts now. Go get it.`,
        `${title} is on! You've prepared for this.`,
        `Let's go — ${title}, right now.`,
      ],
      upcoming: ({ name, title, lead }) => [
        `${greet(name)}${title} ${lead} — time to get moving, you've got this.`,
        `${title} ${lead}. Wrap up and get ready to shine.`,
        `Heads up — ${title} coming up ${lead}. Go show them what you've got.`,
      ],
    },
    study: {
      now: ({ name, title }) => [
        `${greet(name)}${title} starts now — this is your moment, focus up.`,
        `Time to study. ${title} — let's take this seriously.`,
        `${title} is here. Deep breath, and go get it.`,
      ],
      upcoming: ({ name, title, lead }) => [
        `${greet(name)}${title} is coming up ${lead} — time to buckle down and review.`,
        `${title} ${lead}. This is worth taking seriously — let's prepare.`,
        `Heads up — ${title} coming up ${lead}. You've got this, just focus.`,
      ],
    },
  },
};

export function assistantReminderLine(
  title: string,
  startMinutes: number,
  minutesUntil: number,
  icon: IconKey = "default",
  variantSeed?: number
) {
  const name = (useAuthStore.getState().user?.displayName ?? "").trim();
  const tone = useSettingsStore.getState().voiceTone;
  const time = spokenTime(startMinutes);
  const lines = TEMPLATES[tone][reminderCategory(icon)];
  const ctx: LineCtx = {
    name,
    title,
    time,
    lead: minutesUntil <= 0 ? "" : spokenLead(minutesUntil),
  };

  return pick(minutesUntil <= 0 ? lines.now(ctx) : lines.upcoming(ctx), variantSeed);
}

interface BriefingTask {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  completed: boolean;
}

// One flowing run-through of the day, the way an assistant would brief a
// manager. Kept under the TTS length cap by summarizing the tail of very
// busy days. When `nowMinutes` is given (briefing today), items whose start
// has passed without being completed are called out as still open instead of
// being walked through as if they were ahead.
export function assistantDayBriefing(
  tasks: BriefingTask[],
  dayLabel: string,
  nowMinutes?: number
): string {
  const name = (useAuthStore.getState().user?.displayName ?? "").trim();
  const day = dayLabel === "Today" ? "today" : dayLabel === "Tomorrow" ? "tomorrow" : dayLabel;
  const prefix = name ? `${name}, ` : "";

  if (tasks.length === 0) {
    return `${prefix}nothing is scheduled for ${day} yet — the day is wide open.`;
  }

  const remaining = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const doneCount = tasks.length - remaining.length;

  if (remaining.length === 0) {
    return `${prefix}all ${tasks.length === 1 ? "your tasks are" : `${tasks.length} tasks are`} already checked off for ${day}. Nice work.`;
  }

  const overdue =
    nowMinutes === undefined ? [] : remaining.filter((t) => t.startMinutes < nowMinutes);
  const upcoming =
    nowMinutes === undefined ? remaining : remaining.filter((t) => t.startMinutes >= nowMinutes);

  const count = remaining.length === 1 ? "one thing" : `${remaining.length} things`;
  let text =
    `${prefix}here's the plan for ${day} — ${count} on the list. ` +
    (doneCount > 0 ? `You've already finished ${doneCount}. ` : "");

  if (overdue.length > 0) {
    const names = overdue
      .slice(0, 3)
      .map((t) => t.title)
      .join(", ");
    const extra = overdue.length > 3 ? ` and ${overdue.length - 3} more` : "";
    text +=
      overdue.length === 1
        ? `${names} slipped past its ${spokenTime(overdue[0].startMinutes)} slot and is still open — do it now, move it, or let it go. `
        : `${names}${extra} are past their slots and still open — worth a quick decision. `;
  }

  for (let i = 0; i < upcoming.length; i++) {
    const t = upcoming[i];
    const piece =
      i === 0
        ? `${nowMinutes === undefined ? "You start" : "Next up"} at ${spokenTime(t.startMinutes)} with ${t.title}, ${spokenDuration(t.durationMinutes)}. `
        : i === upcoming.length - 1
          ? `And finally at ${spokenTime(t.startMinutes)}, ${t.title}, ${spokenDuration(t.durationMinutes)}. `
          : `Then at ${spokenTime(t.startMinutes)}, ${t.title}, ${spokenDuration(t.durationMinutes)}. `;
    // Leave room for the summary tail when the day is packed.
    if (text.length + piece.length > 1200) {
      text += `Plus ${upcoming.length - i} more after that. `;
      break;
    }
    text += piece;
  }
  if (upcoming.length === 0) {
    text += "Nothing else is on the calendar ahead. ";
  }

  return text + "That's your day.";
}
