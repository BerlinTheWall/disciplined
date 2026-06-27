import { guessIcon, type IconKey } from './icons'
import { toISODate, addDays } from './date'

// Pure natural-language parser for the Schedule quick-add bar. Turns a single
// line like "gym mon wed fri 6am", "dentist tomorrow 3pm" or "read 20min
// tonight" into the fields needed to create a Task — or a recurring Habit when
// two or more weekdays (or "every"/"daily"/"weekdays") are named.
//
// Kept free of React/store imports so it can be unit-tested on its own. `now` is
// injected (defaulting to the real clock) so date/time resolution is
// deterministic in tests. Note: this deliberately returns more than a partial
// Task — multi-day input maps to a Habit, which the app models separately.

export interface ParsedQuickAdd {
  kind: 'task' | 'habit'
  title: string
  startMinutes: number
  durationMinutes: number
  icon: IconKey
  // Set when kind === 'task': the ISO date (local) the task lands on.
  date?: string
  // Set when kind === 'habit': weekdays it repeats on (0 = Sun … 6 = Sat).
  daysOfWeek?: number[]
  // How precisely the time was specified: 'exact' (a clock time like 6am/14:30),
  // 'vague' (a word like tonight/morning), or 'none' (defaulted). The UI asks the
  // user to type a time unless it's 'exact'.
  timeGiven: 'exact' | 'vague' | 'none'
  // True when a concrete day was named (today/tomorrow/a weekday). When false the
  // date was defaulted to today and the UI asks the user which day.
  dateGiven: boolean
}

const DEFAULT_DURATION_MINUTES = 30
const MINUTES_PER_DAY = 1440

// Leading "command to create" phrasing that isn't part of the title. Stripped
// once from the front so "create a task to wake up", "remind me to call mom" and
// "i want to read tonight" keep only their real subject. Clear create verbs
// (create/make/schedule) strip on their own; the ambiguous "add"/"set" only
// strip when followed by a task/habit/reminder noun, so "add oil to car" is left
// alone.
const PREAMBLE = new RegExp(
  "^\\s*(?:please\\s+)?(?:" +
    "i\\s+(?:want|need|wanna|would\\s+like|'?d\\s+like)\\s+to\\s+" +
    "|remind\\s+me(?:\\s+to)?\\s+" +
    "|let\\s+me\\s+" +
    "|(?:create|make|schedule|set\\s+up|new)\\s+(?:(?:a|an|the)\\s+)?(?:new\\s+)?(?:task|habit|reminder|event|appointment)?\\s*(?:to|for|called|named|:)?\\s*" +
    "|(?:add|set)\\s+(?:a|an|the)\\s+(?:new\\s+)?(?:task|habit|reminder|event|appointment)\\s+(?:to|for|called|named|:)?\\s*" +
    ")",
  "i",
)

// Vague time-of-day words → start minute. "tonight" is handled separately since
// it also pins the date to today.
const VAGUE_TIMES: { re: RegExp; minutes: number }[] = [
  { re: /\bmorning\b/i, minutes: 8 * 60 },
  { re: /\b(?:noon|midday)\b/i, minutes: 12 * 60 },
  { re: /\bafternoon\b/i, minutes: 14 * 60 },
  { re: /\bevening\b/i, minutes: 19 * 60 },
  { re: /\bnight\b/i, minutes: 21 * 60 },
  { re: /\bmidnight\b/i, minutes: 0 },
]

const WEEKDAYS: { re: RegExp; day: number }[] = [
  { re: /\b(?:sun|sunday)\b/gi, day: 0 },
  { re: /\b(?:mon|monday)\b/gi, day: 1 },
  { re: /\b(?:tue|tues|tuesday)\b/gi, day: 2 },
  { re: /\b(?:wed|weds|wednesday)\b/gi, day: 3 },
  { re: /\b(?:thu|thur|thurs|thursday)\b/gi, day: 4 },
  { re: /\b(?:fri|friday)\b/gi, day: 5 },
  { re: /\b(?:sat|saturday)\b/gi, day: 6 },
]

// Soonest ISO date that falls on targetDay; today counts as a match. Built from
// the app's own date helpers (toISODate / addDays) so the strings match how
// selectedDate and the week cells are produced (see WeekHeader).
function nextISODateForWeekday(now: Date, targetDay: number) {
  const diff = (targetDay - now.getDay() + 7) % 7
  return toISODate(addDays(now, diff))
}

// Next round hour after `now`, capped at 23:00 so the task stays on the same day.
function nextRoundHour(now: Date) {
  return Math.min((now.getHours() + 1) * 60, 23 * 60)
}

// Best-guess minutes for a bare hour with no am/pm: 24h-style if >12, else a
// business-hours guess (1–6 → afternoon/evening, 7–11 → morning). The result is
// flagged 'vague' by the caller so the UI confirms it.
function bareHourMinutes(h: number) {
  if (h === 0 || h === 12) return h * 60
  if (h > 12 && h <= 23) return h * 60
  if (h >= 1 && h <= 6) return (h + 12) * 60
  return h * 60
}

export function parseQuickAdd(
  input: string,
  now: Date = new Date(),
): ParsedQuickAdd | null {
  let rest = ` ${input.replace(PREAMBLE, '')} `

  // Strips the first (or every, when the regex is global) match from `rest`,
  // replacing it with a space, and reports whether anything matched.
  const strip = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re)
    if (m) rest = rest.replace(re, ' ')
    return m
  }

  // ---- time ----------------------------------------------------------------
  // Clock time wins over vague words. 12-hour ("6am", "6:30 pm") first, then
  // 24-hour ("14:30").
  let timeMinutes: number | null = null
  let timeGiven: 'exact' | 'vague' | 'none' = 'none'
  let dateGiven = false
  // ":" or "." as the minute separator ("7:30" or the informal "7.30").
  const t12 = strip(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i)
  if (t12) {
    const h = Number(t12[1]) % 12
    const m = t12[2] ? Number(t12[2]) : 0
    timeMinutes = h * 60 + m + (t12[3].toLowerCase() === 'pm' ? 12 * 60 : 0)
    timeGiven = 'exact'
  } else {
    const t24 = strip(/\b(\d{1,2})[:.]([0-5]\d)\b/)
    if (t24) {
      timeMinutes = Number(t24[1]) * 60 + Number(t24[2])
      timeGiven = 'exact'
    }
  }

  // ---- duration ------------------------------------------------------------
  // "1h30m" / "1h 30" combined, else hours and minutes summed independently.
  let durationMinutes = DEFAULT_DURATION_MINUTES
  const combined = strip(
    /\b(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*(?:m(?:ins?|inutes?)?)?\b/i,
  )
  if (combined) {
    durationMinutes = Number(combined[1]) * 60 + Number(combined[2])
  } else {
    let dur = 0
    const hrs = strip(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
    if (hrs) dur += Math.round(Number(hrs[1]) * 60)
    // Minutes need an explicit unit, or a bare "m" attached to the number
    // ("20m"), so we don't swallow the leading digits of e.g. "5 monday".
    const mins = strip(/\b(\d+)\s*(?:min|mins|minute|minutes)\b/i) ?? strip(/\b(\d+)m\b/i)
    if (mins) dur += Number(mins[1])
    if (dur > 0) durationMinutes = dur
  }

  // ---- recurrence / weekdays ----------------------------------------------
  const daySet = new Set<number>()
  let forceHabit = false

  if (strip(/\b(?:everyday|every\s*day|daily)\b/i)) {
    for (let d = 0; d < 7; d++) daySet.add(d)
    forceHabit = true
  }

  // "every morning / each evening / every night" → a daily habit. The time-of-day
  // word is left in place so the time blocks below pick it up (every morning →
  // 8:00) unless an explicit time was given (every morning at 6.15 → 6:15).
  if (/\b(?:every|each)\s+(?:morning|afternoon|evening|night|noon|midday|midnight)\b/i.test(rest)) {
    for (let d = 0; d < 7; d++) daySet.add(d)
    forceHabit = true
  }
  if (strip(/\bweekdays?\b/i)) {
    for (const d of [1, 2, 3, 4, 5]) daySet.add(d)
    forceHabit = true
  }
  if (strip(/\bweekends?\b/i)) {
    daySet.add(0)
    daySet.add(6)
    forceHabit = true
  }

  // "every monday" (an explicit "every" before a single weekday) means repeat,
  // not a one-off — detect it before the weekday tokens are stripped away.
  const hasEvery = /\bevery\b/i.test(rest)
  for (const { re, day } of WEEKDAYS) {
    if (strip(re)) daySet.add(day)
  }

  // ---- relative date words -------------------------------------------------
  let dayOffset: number | null = null
  if (strip(/\b(?:tomorrow|tmrw|tmr)\b/i)) {
    dayOffset = 1
    dateGiven = true
  }
  if (strip(/\btoday\b/i)) {
    dayOffset = 0
    dateGiven = true
  }
  if (strip(/\btonight\b/i)) {
    dayOffset = 0
    dateGiven = true
    if (timeMinutes === null) {
      timeMinutes = 19 * 60 // tonight → evening
      timeGiven = 'vague'
    }
  }

  // ---- vague time-of-day words (only if no clock time given) ---------------
  if (timeMinutes === null) {
    for (const { re, minutes } of VAGUE_TIMES) {
      if (strip(re)) {
        timeMinutes = minutes
        timeGiven = 'vague'
        break
      }
    }
  }

  // ---- "at <hour>" with no am/pm ("wake up at 7") --------------------------
  // A strong but ambiguous time signal: keep it as a guess and mark it 'vague'
  // so the UI asks the user to confirm the exact time.
  if (timeMinutes === null) {
    const at = strip(/\b(?:at|@)\s*(\d{1,2})\b/i)
    if (at) {
      const h = Number(at[1])
      if (h >= 0 && h <= 23) {
        timeMinutes = bareHourMinutes(h)
        timeGiven = 'vague'
      }
    }
  }

  // ---- title cleanup -------------------------------------------------------
  const title = rest
    .replace(/\b(?:at|on|every|each|this|next|the|and)\b/gi, ' ')
    .replace(
      /\b(?:tonight|today|tomorrow|tmrw|tmr|morning|afternoon|evening|night|noon|midday|midnight|daily|weekdays?|weekends?)\b/gi,
      ' ',
    )
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!title) return null

  const isHabit = forceHabit || daySet.size >= 2 || (hasEvery && daySet.size >= 1)

  // Resolve the date (task) so the time default knows whether it's "today".
  let date: string | undefined
  let daysOfWeek: number[] | undefined
  if (isHabit) {
    daysOfWeek = [...daySet].sort((a, b) => a - b)
  } else if (daySet.size === 1) {
    date = nextISODateForWeekday(now, [...daySet][0])
    dateGiven = true
  } else {
    date = toISODate(addDays(now, dayOffset ?? 0))
  }

  // Resolve the start time.
  let startMinutes: number
  if (timeMinutes !== null) {
    startMinutes = timeMinutes
  } else if (!isHabit && date === toISODate(now)) {
    startMinutes = nextRoundHour(now) // next round hour from now
  } else {
    startMinutes = 9 * 60 // another day, or a habit: default to 9:00
  }

  // Keep the task within the day.
  durationMinutes = Math.max(
    5,
    Math.min(durationMinutes, MINUTES_PER_DAY - startMinutes),
  )

  const icon = guessIcon(title) ?? 'alarm'

  return isHabit
    ? { kind: 'habit', title, startMinutes, durationMinutes, icon, daysOfWeek, timeGiven, dateGiven }
    : { kind: 'task', title, startMinutes, durationMinutes, icon, date, timeGiven, dateGiven }
}
