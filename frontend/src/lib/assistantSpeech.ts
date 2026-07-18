import { useProfileStore } from "@/store/profileStore";

// Composes the sentence a reminder speaks — phrased like a personal assistant
// giving a manager a heads-up, not like a machine reading a log line. Picks a
// random variant so back-to-back reminders don't sound canned.

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

export function assistantReminderLine(
  title: string,
  startMinutes: number,
  minutesUntil: number,
  variantSeed?: number
) {
  const name = useProfileStore.getState().name.trim();
  const time = spokenTime(startMinutes);

  if (minutesUntil <= 0) {
    return pick(
      [
        name ? `${name}, it's ${time} — time for ${title}.` : `It's ${time} — time for ${title}.`,
        `${title} is starting now.`,
        `Time for ${title} — it's ${time}.`,
      ],
      variantSeed
    );
  }

  const lead = spokenLead(minutesUntil);
  return pick(
    [
      name
        ? `${name}, quick heads-up — ${title} starts ${lead}, at ${time}.`
        : `Quick heads-up — ${title} starts ${lead}, at ${time}.`,
      `Just a reminder: ${title} is coming up ${lead}.`,
      `${title} starts ${lead}. That's at ${time}.`,
    ],
    variantSeed
  );
}

interface BriefingTask {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  completed: boolean;
}

// One flowing run-through of the day, the way an assistant would brief a
// manager. Kept under the TTS length cap by summarizing the tail of very
// busy days.
export function assistantDayBriefing(tasks: BriefingTask[], dayLabel: string): string {
  const name = useProfileStore.getState().name.trim();
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

  const count = remaining.length === 1 ? "one thing" : `${remaining.length} things`;
  let text =
    `${prefix}here's the plan for ${day} — ${count} on the list. ` +
    (doneCount > 0 ? `You've already finished ${doneCount}. ` : "");

  for (let i = 0; i < remaining.length; i++) {
    const t = remaining[i];
    const piece =
      i === 0
        ? `You start at ${spokenTime(t.startMinutes)} with ${t.title}, ${spokenDuration(t.durationMinutes)}. `
        : i === remaining.length - 1
          ? `And finally at ${spokenTime(t.startMinutes)}, ${t.title}, ${spokenDuration(t.durationMinutes)}. `
          : `Then at ${spokenTime(t.startMinutes)}, ${t.title}, ${spokenDuration(t.durationMinutes)}. `;
    // Leave room for the summary tail when the day is packed.
    if (text.length + piece.length > 1200) {
      text += `Plus ${remaining.length - i} more after that. `;
      break;
    }
    text += piece;
  }

  return text + "That's your day.";
}
