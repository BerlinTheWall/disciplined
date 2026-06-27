import { guessIcon, ICONS, type IconKey } from './icons'
import { toISODate, addDays } from './date'

// Deterministic command grammar for the Schedule quick-add bar. Turns sentences
// like "move my gym session tonight at 10 to 11", "change the name of standup to
// daily sync", "make workout blue", "push lunch to tomorrow", "set gym to 1h",
// "mark read done", "link lunch to the pasta recipe" or "make gym a habit on mon
// wed fri" into a structured Command operating on an existing task/habit.
//
// Two pure pieces, both testable without React/stores:
//   parseCommand(text)            -> intent + a fuzzy target description
//   resolveTarget(target, items)  -> the matching item(s), ranked
// The UI runs them, resolves any extra references (workout/recipe), then ALWAYS
// confirms before applying. A command only "wins" when a verb/cue is recognised;
// plain text with no command cue is left for the create parser (quickAdd.ts).
//
// This covers the *common phrasings* of each operation, not arbitrary English —
// that ceiling is inherent to a rule-based parser (an LLM would be the next step,
// with this layer as its fast/offline fallback).

// ---- types -----------------------------------------------------------------

export interface CommandItem {
  id: string
  kind: 'task' | 'habit'
  title: string
  startMinutes: number
  durationMinutes: number
  icon: IconKey
  color: string
  date?: string // task only
  daysOfWeek?: number[] // habit only
}

// A fuzzy description of which item the user referred to.
export interface TargetHint {
  titleWords: string[]
  date?: string // ISO, from "tomorrow" / "monday" / etc.
  startMinutes?: number // from "at 10" / "morning" / etc.
}

export type Command =
  | { action: 'reschedule'; target: TargetHint; newDate?: string; newStartMinutes?: number }
  | { action: 'duration'; target: TargetHint; durationMinutes?: number; deltaMinutes?: number }
  | { action: 'delete'; target: TargetHint }
  | { action: 'rename'; target: TargetHint; newTitle: string }
  | { action: 'recolor'; target: TargetHint; color: string; colorName: string }
  | { action: 'icon'; target: TargetHint; icon: IconKey }
  | { action: 'complete'; target: TargetHint; completed: boolean }
  | { action: 'linkWorkout'; target: TargetHint; query: string }
  | { action: 'linkRecipe'; target: TargetHint; query: string }
  | { action: 'toHabit'; target: TargetHint; daysOfWeek: number[] }
  | { action: 'toTask'; target: TargetHint; date?: string }

// ---- constants -------------------------------------------------------------

const VAGUE_TIMES: { re: RegExp; minutes: number }[] = [
  { re: /\bmorning\b/, minutes: 8 * 60 },
  { re: /\b(?:noon|midday)\b/, minutes: 12 * 60 },
  { re: /\bafternoon\b/, minutes: 14 * 60 },
  { re: /\bevening\b/, minutes: 19 * 60 },
  { re: /\bnight\b/, minutes: 21 * 60 },
  { re: /\bmidnight\b/, minutes: 0 },
]

const WEEKDAYS: { re: RegExp; day: number }[] = [
  { re: /\b(?:sun|sunday)\b/, day: 0 },
  { re: /\b(?:mon|monday)\b/, day: 1 },
  { re: /\b(?:tue|tues|tuesday)\b/, day: 2 },
  { re: /\b(?:wed|weds|wednesday)\b/, day: 3 },
  { re: /\b(?:thu|thur|thurs|thursday)\b/, day: 4 },
  { re: /\b(?:fri|friday)\b/, day: 5 },
  { re: /\b(?:sat|saturday)\b/, day: 6 },
]

// Color words → hex, drawn from AddItemSheet's palette.
const COLORS: { name: string; hex: string }[] = [
  { name: 'green', hex: '#34d399' },
  { name: 'emerald', hex: '#34d399' },
  { name: 'rose', hex: '#fb7185' },
  { name: 'orange', hex: '#fb923c' },
  { name: 'amber', hex: '#fbbf24' },
  { name: 'yellow', hex: '#fbbf24' },
  { name: 'lime', hex: '#a3e635' },
  { name: 'blue', hex: '#60a5fa' },
  { name: 'cyan', hex: '#22d3ee' },
  { name: 'teal', hex: '#22d3ee' },
  { name: 'purple', hex: '#a78bfa' },
  { name: 'violet', hex: '#a78bfa' },
  { name: 'pink', hex: '#f472b6' },
  { name: 'red', hex: '#f87171' },
]

// Words dropped when building the title hint — pronouns, articles, connectors,
// generic nouns and the command verbs themselves (the intent is already known by
// the time we build the title, so these never help identify the item).
const FILLER =
  /\b(?:my|the|a|an|it|its|that|this|to|at|on|in|for|of|me|please|just|only|into|make|set|change|update|move|put|item|task|habit|event|session|appointment|reminder|thing|called|named|titled)\b/g

// ---- small parsers ---------------------------------------------------------

// Resolves a bare hour (no am/pm) to minutes. Prefers the caller's pm context
// (e.g. the item being moved was at night); otherwise uses a business-hours
// guess: 1–6 → afternoon/evening, 7–11 → morning.
function resolveBareHour(h: number, pm: boolean) {
  if (h === 0) return 0
  if (h > 12 && h <= 23) return h * 60 // already 24h-style ("at 18")
  if (h === 12) return 12 * 60
  if (pm) return (h + 12) * 60
  if (h >= 1 && h <= 6) return (h + 12) * 60
  return h * 60
}

interface TimeMatch {
  raw: string
  minutes: number | null
  bareHour: number | null
}

function matchTime(text: string): TimeMatch | null {
  const t12 = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/)
  if (t12) {
    const h = Number(t12[1]) % 12
    const m = t12[2] ? Number(t12[2]) : 0
    return { raw: t12[0], minutes: h * 60 + m + (t12[3] === 'pm' ? 12 * 60 : 0), bareHour: null }
  }
  const t24 = text.match(/\b(\d{1,2})[:.]([0-5]\d)\b/)
  if (t24) return { raw: t24[0], minutes: Number(t24[1]) * 60 + Number(t24[2]), bareHour: null }
  for (const { re, minutes } of VAGUE_TIMES) {
    const m = text.match(re)
    if (m) return { raw: m[0], minutes, bareHour: null }
  }
  const bare = text.match(/\b(\d{1,2})\b/)
  if (bare) {
    const h = Number(bare[1])
    if (h >= 0 && h <= 23) return { raw: bare[0], minutes: null, bareHour: h }
  }
  return null
}

function parseTimeValue(text: string, contextStart?: number): number | null {
  const m = matchTime(text)
  if (!m) return null
  if (m.minutes !== null) return m.minutes
  const pm = contextStart != null && contextStart >= 12 * 60
  return resolveBareHour(m.bareHour!, pm)
}

// "tomorrow" / "today" / "next week" / a weekday → ISO date. A weekday that is
// today resolves to *next* week (so "move to monday" on a Monday means next one).
function parseDateValue(text: string, now: Date): string | null {
  if (/\b(?:tomorrow|tmrw|tmr)\b/.test(text)) return toISODate(addDays(now, 1))
  if (/\b(?:today|tonight)\b/.test(text)) return toISODate(now)
  if (/\bnext week\b/.test(text)) return toISODate(addDays(now, 7))
  for (const { re, day } of WEEKDAYS) {
    if (re.test(text)) {
      const diff = (day - now.getDay() + 7) % 7
      return toISODate(addDays(now, diff === 0 ? 7 : diff))
    }
  }
  return null
}

// Recurrence days from "every day"/"daily", "weekdays", "weekends", or named
// days. Returns null when no day info is present.
function parseDays(text: string): number[] | null {
  const set = new Set<number>()
  if (/\beveryday\b/.test(text) || /\bevery\s*day\b/.test(text) || /\bdaily\b/.test(text)) {
    for (let d = 0; d < 7; d++) set.add(d)
  }
  if (/\bweekdays?\b/.test(text)) for (const d of [1, 2, 3, 4, 5]) set.add(d)
  if (/\bweekends?\b/.test(text)) {
    set.add(0)
    set.add(6)
  }
  for (const { re, day } of WEEKDAYS) if (re.test(text)) set.add(day)
  return set.size ? [...set].sort((a, b) => a - b) : null
}

// A duration in minutes from "1h30", "90 min", "2 hours", "45m", "half an hour".
// Bare numbers are ignored (handled separately where a duration cue is present).
function parseDurationValue(text: string): number | null {
  if (/\bhalf an hour\b/.test(text) || /\bhalf hour\b/.test(text)) return 30
  if (/\b(?:an|one)\s+hour\b/.test(text)) return 60
  const comb = text.match(/\b(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*(?:m(?:ins?|inutes?)?)?\b/)
  if (comb) return Number(comb[1]) * 60 + Number(comb[2])
  let d = 0
  const hrs = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  if (hrs) d += Math.round(Number(hrs[1]) * 60)
  const mins = text.match(/\b(\d+)\s*(?:min|mins|minute|minutes)\b/) ?? text.match(/\b(\d+)m\b/)
  if (mins) d += Number(mins[1])
  return d > 0 ? d : null
}

function findColor(text: string) {
  for (const c of COLORS) if (new RegExp(`\\b${c.name}\\b`).test(text)) return c
  return null
}

function parseIconWord(text: string): IconKey | null {
  for (const key of Object.keys(ICONS) as IconKey[]) {
    if (key !== 'default' && new RegExp(`\\b${key}\\b`).test(text)) return key
  }
  return guessIcon(text)
}

// Pulls the part after the last " to "/" into " for splitting "<target> to <value>".
function splitOnTo(text: string): { before: string; after: string } | null {
  const m = text.match(/\s(?:to|into)\s/g)
  if (!m) return null
  const idx = text.lastIndexOf(m[m.length - 1])
  return { before: text.slice(0, idx), after: text.slice(idx + m[m.length - 1].length) }
}

function cleanTitle(text: string) {
  return text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Parses a free-typed time answer ("6am", "14:30", "morning", "6") to minutes,
// or null if it can't be read. Used when the UI asks the user to type a time.
export function parseTimeInput(input: string): number | null {
  return parseTimeValue(` ${input.toLowerCase().trim()} `)
}

// Parses a free-typed day answer ("today", "tomorrow", "mon", "2026-07-01") to
// an ISO date, or null. Used when the UI asks the user which day.
export function parseDateInput(input: string, now: Date = new Date()): string | null {
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return parseDateValue(` ${trimmed.toLowerCase()} `, now)
}

// ---- target parsing --------------------------------------------------------

function parseTarget(text: string, now: Date): TargetHint {
  let rest = ` ${text} `
  const strip = (re: RegExp) => {
    rest = rest.replace(re, ' ')
  }

  // Date / day.
  let date: string | undefined
  const pmHint = /\b(?:tonight|evening|night|afternoon|pm)\b/.test(rest)
  if (/\b(?:tomorrow|tmrw|tmr)\b/.test(rest)) {
    date = toISODate(addDays(now, 1))
    strip(/\b(?:tomorrow|tmrw|tmr)\b/)
  } else if (/\b(?:today|tonight)\b/.test(rest)) {
    date = toISODate(now)
    strip(/\b(?:today|tonight)\b/)
  } else {
    for (const { re, day } of WEEKDAYS) {
      if (re.test(rest)) {
        const diff = (day - now.getDay() + 7) % 7
        date = toISODate(addDays(now, diff))
        strip(re)
        break
      }
    }
  }

  // Time.
  let startMinutes: number | undefined
  const tm = matchTime(rest)
  if (tm) {
    startMinutes = tm.minutes ?? resolveBareHour(tm.bareHour!, pmHint)
    rest = rest.replace(tm.raw, ' ')
  }

  const titleWords = rest
    .replace(FILLER, ' ')
    .replace(/\b(?:tonight|today|tomorrow|morning|afternoon|evening|night|noon|midday|midnight|pm|am)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  return { titleWords, date, startMinutes }
}

// ---- command parsing -------------------------------------------------------

export function parseCommand(input: string, now: Date = new Date()): Command | null {
  if (!input.trim()) return null
  const text = ` ${input.toLowerCase().trim()} `

  // DELETE ------------------------------------------------------------------
  const DELETE_RE = /\b(?:delete|remove|cancel)\b|\bget rid of\b/
  if (DELETE_RE.test(text)) {
    return { action: 'delete', target: parseTarget(text.replace(DELETE_RE, ' '), now) }
  }

  // CONVERT → HABIT ---------------------------------------------------------
  const habitCue =
    /\b(?:habit|recurring)\b/.test(text) ||
    /\brepeat(?:s|ing|ed)?\b/.test(text) ||
    /\bdaily\b/.test(text) ||
    /\bevery\s*day\b/.test(text) ||
    (/\bevery\b/.test(text) && parseDays(text) !== null)
  const convertVerb = /\b(?:make|turn|convert|change|set)\b/.test(text)
  if (habitCue && (convertVerb || /\brepeat\b/.test(text))) {
    const days = parseDays(text) ?? [0, 1, 2, 3, 4, 5, 6]
    const targetText = text
      .replace(/\b(?:make|turn|convert|change|set|repeat(?:s|ing|ed)?|recurring|daily|every)\b/g, ' ')
      .replace(/\b(?:everyday|weekdays?|weekends?|sun|sunday|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|day|days|week)\b/g, ' ')
    return { action: 'toHabit', target: parseTarget(targetText, now), daysOfWeek: days }
  }

  // CONVERT → ONE-TIME TASK -------------------------------------------------
  const taskCue =
    /\bone[- ]?time\b/.test(text) ||
    /\bone[- ]?off\b/.test(text) ||
    /\bjust once\b/.test(text) ||
    /\bstop repeating\b/.test(text) ||
    /\bnot a habit\b/.test(text) ||
    (/\btask\b/.test(text) && /\b(?:make|turn|convert)\b/.test(text))
  if (taskCue) {
    const date = parseDateValue(text, now) ?? undefined
    const targetText = text.replace(
      /\b(?:make|turn|convert|one|time|off|just|once|stop|repeating|not|task|single)\b/g,
      ' ',
    )
    return { action: 'toTask', target: parseTarget(targetText, now), date }
  }

  // COMPLETE / UNCOMPLETE ---------------------------------------------------
  const uncheck =
    /\b(?:uncheck|uncomplete|incomplete|undone)\b/.test(text) ||
    /\bnot (?:done|complete|finished)\b/.test(text) ||
    /\bmark .* undone\b/.test(text)
  const check =
    /\bcheck off\b/.test(text) ||
    /\btick off\b/.test(text) ||
    /\bcross off\b/.test(text) ||
    (/\bmark\b/.test(text) && /\b(?:done|complete|completed|finished|off)\b/.test(text)) ||
    /\bcomplete(?:d)?\b/.test(text) ||
    /\bfinished?\b/.test(text)
  if (uncheck) {
    const t = text.replace(/\b(?:mark|uncheck|uncomplete|incomplete|undone|not|done|complete|finished|as)\b/g, ' ')
    return { action: 'complete', target: parseTarget(t, now), completed: false }
  }
  if (check) {
    const t = text.replace(/\b(?:mark|check|tick|cross|off|done|complete|completed|finish|finished|as)\b/g, ' ')
    return { action: 'complete', target: parseTarget(t, now), completed: true }
  }

  // LINK WORKOUT ------------------------------------------------------------
  const linkVerb = /\b(?:link|attach|connect|assign|hook up)\b/.test(text)
  if ((linkVerb || /\badd\b/.test(text)) && /\b(?:workout|training|gym session)\b/.test(text)) {
    const split = splitOnTo(text)
    if (split) {
      const query = cleanTitle(
        split.after.replace(/\b(?:workout|training|session|my|the|a|an)\b/g, ' '),
      )
      const targetText = split.before.replace(/\b(?:link|attach|connect|assign|add|hook|up|workout|training)\b/g, ' ')
      if (query) return { action: 'linkWorkout', target: parseTarget(targetText, now), query }
    }
  }

  // LINK RECIPE / MEAL ------------------------------------------------------
  if ((linkVerb || /\badd\b/.test(text)) && /\b(?:recipe|meal|dish)\b/.test(text)) {
    const split = splitOnTo(text)
    if (split) {
      const query = cleanTitle(split.after.replace(/\b(?:recipe|meal|dish|my|the|a|an)\b/g, ' '))
      const targetText = split.before.replace(/\b(?:link|attach|connect|assign|add|hook|up|recipe|meal|dish)\b/g, ' ')
      if (query) return { action: 'linkRecipe', target: parseTarget(targetText, now), query }
    }
  }

  // ICON --------------------------------------------------------------------
  if (/\bicon\b/.test(text)) {
    const [before, after = ''] = text.split(/\bicon\b/)
    const icon = parseIconWord(after) ?? parseIconWord(before)
    if (icon) {
      const targetText = before.replace(/\b(?:change|set|update|make)\b/g, ' ')
      return { action: 'icon', target: parseTarget(targetText, now), icon }
    }
  }

  // RENAME ------------------------------------------------------------------
  const renameCue =
    /\brename\b/.test(text) || (/\b(?:name|title)\b/.test(text) && /\bto\b/.test(text))
  if (renameCue) {
    const split = splitOnTo(text)
    if (split) {
      const newTitle = cleanTitle(split.after)
      const targetText = split.before.replace(
        /\b(?:rename|change|set|update|the|name|title|call|of)\b/g,
        ' ',
      )
      if (newTitle) return { action: 'rename', target: parseTarget(targetText, now), newTitle }
    }
  }

  // RECOLOR -----------------------------------------------------------------
  const color = findColor(text)
  if (color && /\b(?:make|change|recolor|recolour|colou?r|set|paint|turn)\b/.test(text)) {
    const targetText = text
      .replace(new RegExp(`\\b${color.name}\\b`), ' ')
      .replace(/\b(?:make|change|recolor|recolour|colou?r|set|paint|turn|to)\b/g, ' ')
    return {
      action: 'recolor',
      target: parseTarget(targetText, now),
      color: color.hex,
      colorName: color.name,
    }
  }

  // DURATION ----------------------------------------------------------------
  const durValue = parseDurationValue(text)
  const addDur = /\b(?:add|extend|increase|lengthen|longer)\b/.test(text)
  const subDur = /\b(?:shorten|reduce|cut|decrease|trim|shorter)\b/.test(text)
  if (durValue != null && (addDur || subDur) && /\bby\b/.test(text)) {
    const t = text.replace(/\b(?:add|extend|increase|lengthen|shorten|reduce|cut|decrease|trim|by)\b/g, ' ')
    return { action: 'duration', target: parseTarget(stripDuration(t), now), deltaMinutes: subDur ? -durValue : durValue }
  }
  // An explicit duration value ("1h", "45 min") plus any edit verb is a duration
  // change. "for" is deliberately excluded so a create like "read 20min tonight"
  // (no edit verb) doesn't get hijacked.
  const durCue =
    /\bduration\b/.test(text) ||
    /\b(?:long|lasts?)\b/.test(text) ||
    /\b(?:make|change|set|update)\b/.test(text)
  if (durValue != null && durCue) {
    const t = text.replace(/\b(?:make|set|change|duration|long|lasts?|for|to)\b/g, ' ')
    return { action: 'duration', target: parseTarget(stripDuration(t), now), durationMinutes: durValue }
  }
  if (/\bduration\b/.test(text)) {
    const n = text.match(/\b(\d+)\b/)
    if (n) {
      const t = text.replace(/\b(?:set|change|duration|to|make|it|mins?|minutes?)\b/g, ' ').replace(/\b\d+\b/, ' ')
      return { action: 'duration', target: parseTarget(t, now), durationMinutes: Number(n[1]) }
    }
  }

  // RESCHEDULE (time and/or date) -------------------------------------------
  const moveVerb = /\b(?:move|reschedule|resched|shift|push|put|change|make)\b/.test(text)
  if (moveVerb) {
    const split = splitOnTo(text)
    const valueText = split ? split.after : text
    const targetSrc = split ? split.before : text
    const target = parseTarget(
      targetSrc.replace(/\b(?:move|reschedule|resched|shift|push|put|change|make)\b/g, ' '),
      now,
    )
    const newDate = parseDateValue(valueText, now)
    const newStartMinutes = parseTimeValue(valueText, target.startMinutes)
    if (newDate || newStartMinutes !== null) {
      return {
        action: 'reschedule',
        target,
        newDate: newDate ?? undefined,
        newStartMinutes: newStartMinutes ?? undefined,
      }
    }
  }

  return null
}

// Removes duration tokens so they don't pollute the title hint.
function stripDuration(text: string) {
  return text
    .replace(/\bhalf an hour\b|\bhalf hour\b|\b(?:an|one)\s+hour\b/g, ' ')
    .replace(/\b\d+\s*h(?:ours?|rs?)?\s*\d*\s*(?:m(?:ins?|inutes?)?)?\b/g, ' ')
    .replace(/\b\d+\s*(?:min|mins|minute|minutes|m)\b/g, ' ')
}

// ---- target resolution -----------------------------------------------------

// Ranks `items` by how well they match the target. A named day restricts
// strictly; with no day named it prefers `defaultDate` (the viewed day) and
// falls back to every day. Returns best matches first; [] means no match.
export function resolveTarget(
  target: TargetHint,
  items: CommandItem[],
  defaultDate: string,
): CommandItem[] {
  if (target.date) return rank(target, items, target.date)
  const onViewedDay = rank(target, items, defaultDate)
  return onViewedDay.length ? onViewedDay : rank(target, items, null)
}

function rank(target: TargetHint, items: CommandItem[], scopeDate: string | null): CommandItem[] {
  const scopeWeekday = scopeDate ? new Date(scopeDate + 'T00:00:00').getDay() : null
  const scored: { item: CommandItem; score: number }[] = []
  for (const item of items) {
    if (scopeDate) {
      if (item.kind === 'task') {
        if (item.date !== scopeDate) continue
      } else if (!item.daysOfWeek?.includes(scopeWeekday!)) {
        continue
      }
    }

    let score = 1
    if (target.titleWords.length) {
      const title = item.title.toLowerCase()
      const hits = target.titleWords.filter((w) => title.includes(w)).length
      if (hits === 0) continue
      score += hits * 10
    }
    if (target.startMinutes != null) {
      const diff = Math.abs(item.startMinutes - target.startMinutes)
      if (diff === 0) score += 8
      else if (diff <= 60) score += 4
      else if (target.titleWords.length === 0) continue
    }
    scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}

// Ranks named references (workout sessions / recipes) by title-word overlap with
// the query. Used by the UI to resolve "link lunch to <query>".
export function resolveByName<T extends { id: string; name: string }>(
  query: string,
  options: T[],
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored: { opt: T; score: number }[] = []
  for (const opt of options) {
    const name = opt.name.toLowerCase()
    const hits = words.filter((w) => name.includes(w)).length
    if (hits) scored.push({ opt, score: hits })
  }
  if (!scored.length) return []
  // Keep only the best-scoring matches, so a clear winner ("push day" → "Push
  // day", not also "Pull day") isn't dragged into a needless disambiguation.
  const best = Math.max(...scored.map((s) => s.score))
  return scored.filter((s) => s.score === best).map((s) => s.opt)
}
