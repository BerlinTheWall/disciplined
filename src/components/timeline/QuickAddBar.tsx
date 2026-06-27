import { useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, ArrowRight, Pencil } from "lucide-react"
import { useTaskStore } from "../../store/taskStore"
import { useHabitStore } from "../../store/habitStore"
import { useWorkoutStore } from "../../store/workoutStore"
import { useRecipeStore } from "../../store/recipeStore"
import { useConfirm, useChoose, usePrompt, type ConfirmOptions } from "../ConfirmDialog"
import { parseQuickAdd } from "../../lib/quickAdd"
import {
  parseCommand,
  resolveTarget,
  resolveByName,
  parseTimeInput,
  parseDateInput,
  type Command,
  type CommandItem,
} from "../../lib/command"
import { formatTimeRange, formatTimeLabel } from "../../lib/time"
import { ICONS, type IconKey } from "../../lib/icons"
import { tap, spring } from "../../lib/motion"
import type { EditItem } from "./Timeline"

// Color a quick-added item gets until the user opens "edit details" to pick one.
const DEFAULT_COLOR = "#34d399"
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const PLACEHOLDER = 'Add or command — "gym mon 6am", "move lunch to 1pm", "delete standup"'

function fmtDur(d: number) {
  if (d < 60) return `${d}m`
  const h = Math.floor(d / 60)
  const m = d % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function relativeDayLabel(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(iso + "T00:00:00")
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "long" })
}

// Verb used in the "couldn't find …" message for each action.
const ACTION_VERB: Record<Command["action"], string> = {
  reschedule: "move",
  duration: "resize",
  delete: "delete",
  rename: "rename",
  recolor: "recolor",
  icon: "change",
  complete: "update",
  linkWorkout: "link",
  linkRecipe: "link",
  toHabit: "convert",
  toTask: "convert",
}

interface QuickAddBarProps {
  onEditDetails: (item: EditItem) => void
}

interface Confirmation {
  icon: IconKey
  color: string
  title: string
  context: string
  item?: EditItem // present only for newly created items → shows "Edit details"
}

// The outcome of planning a command: an error to show, or a confirm prompt plus
// the function that actually applies it (deferred until the user says yes).
interface Plan {
  error?: string
  confirm?: ConfirmOptions
  run?: () => Confirmation
}

export default function QuickAddBar({ onEditDetails }: QuickAddBarProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const habits = useHabitStore((s) => s.habits)
  const addHabit = useHabitStore((s) => s.addHabit)
  const updateHabit = useHabitStore((s) => s.updateHabit)
  const deleteHabit = useHabitStore((s) => s.deleteHabit)
  const toggleHabitCompleted = useHabitStore((s) => s.toggleHabitCompleted)
  const sessions = useWorkoutStore((s) => s.sessions)
  const recipes = useRecipeStore((s) => s.recipes)
  const confirm = useConfirm()
  const choose = useChoose()
  const prompt = usePrompt()

  const [text, setText] = useState("")
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flash(next: Confirmation | null, err: string | null = null) {
    setConfirmation(next)
    setError(err)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setConfirmation(null)
      setError(null)
    }, 6000)
  }

  function commandItems(): CommandItem[] {
    return [
      ...tasks.map<CommandItem>((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        startMinutes: t.startMinutes,
        durationMinutes: t.durationMinutes,
        icon: t.icon,
        color: t.color,
        date: t.date,
      })),
      ...habits.map<CommandItem>((h) => ({
        id: h.id,
        kind: "habit",
        title: h.title,
        startMinutes: h.startMinutes,
        durationMinutes: h.durationMinutes,
        icon: h.icon,
        color: h.color,
        daysOfWeek: h.daysOfWeek,
      })),
    ]
  }

  function itemLabel(item: CommandItem) {
    const time = formatTimeLabel(item.startMinutes)
    if (item.kind === "habit") return `${item.title} · ${time} · repeats`
    const day = item.date === selectedDate ? "" : ` · ${relativeDayLabel(item.date!)}`
    return `${item.title} · ${time}${day}`
  }

  // Builds the confirm prompt + deferred apply for a command on a resolved item.
  // May prompt (choose) to resolve a workout/recipe reference.
  async function planCommand(cmd: Command, item: CommandItem): Promise<Plan> {
    const isTask = item.kind === "task"
    const ok = (c: ConfirmOptions, run: () => Confirmation): Plan => ({ confirm: c, run })

    switch (cmd.action) {
      case "reschedule": {
        if (cmd.newDate && !isTask)
          return { error: "Habits repeat — change their days instead of a date." }
        const parts: string[] = []
        if (cmd.newStartMinutes != null) parts.push(`to ${formatTimeLabel(cmd.newStartMinutes)}`)
        if (cmd.newDate) parts.push(`to ${relativeDayLabel(cmd.newDate)}`)
        return ok(
          { title: "Move it?", message: `Move "${item.title}" ${parts.join(" ")}.`, confirmLabel: "Move" },
          () => {
            const changes: Record<string, unknown> = {}
            if (cmd.newStartMinutes != null) changes.startMinutes = cmd.newStartMinutes
            if (cmd.newDate && isTask) changes.date = cmd.newDate
            if (isTask) updateTask(item.id, changes)
            else updateHabit(item.id, changes)
            return {
              icon: item.icon,
              color: item.color,
              title: `Moved ${item.title}`,
              context: parts.join(" ").replace(/to /g, "→ "),
            }
          },
        )
      }

      case "duration": {
        const next =
          cmd.durationMinutes ?? Math.max(5, item.durationMinutes + (cmd.deltaMinutes ?? 0))
        return ok(
          { title: "Resize it?", message: `Set "${item.title}" to ${fmtDur(next)}.`, confirmLabel: "Set" },
          () => {
            if (isTask) updateTask(item.id, { durationMinutes: next })
            else updateHabit(item.id, { durationMinutes: next })
            return { icon: item.icon, color: item.color, title: `Resized ${item.title}`, context: fmtDur(next) }
          },
        )
      }

      case "delete":
        return ok(
          {
            title: item.kind === "habit" ? "Delete recurring habit?" : "Delete task?",
            message:
              item.kind === "habit"
                ? `"${item.title}" and all its occurrences will be removed.`
                : `"${item.title}" will be permanently removed.`,
            confirmLabel: "Delete",
            destructive: true,
          },
          () => {
            if (isTask) deleteTask(item.id)
            else deleteHabit(item.id)
            return { icon: item.icon, color: item.color, title: `Deleted ${item.title}`, context: itemLabel(item) }
          },
        )

      case "rename":
        return ok(
          { title: "Rename it?", message: `Rename "${item.title}" to "${cmd.newTitle}".`, confirmLabel: "Rename" },
          () => {
            if (isTask) updateTask(item.id, { title: cmd.newTitle })
            else updateHabit(item.id, { title: cmd.newTitle })
            return { icon: item.icon, color: item.color, title: `Renamed to ${cmd.newTitle}`, context: `was "${item.title}"` }
          },
        )

      case "recolor":
        return ok(
          { title: "Change color?", message: `Change "${item.title}" to ${cmd.colorName}.`, confirmLabel: "Change" },
          () => {
            if (isTask) updateTask(item.id, { color: cmd.color })
            else updateHabit(item.id, { color: cmd.color })
            return { icon: item.icon, color: cmd.color, title: `Recolored ${item.title}`, context: cmd.colorName }
          },
        )

      case "icon":
        return ok(
          { title: "Change icon?", message: `Change "${item.title}" icon to ${cmd.icon}.`, confirmLabel: "Change" },
          () => {
            if (isTask) updateTask(item.id, { icon: cmd.icon })
            else updateHabit(item.id, { icon: cmd.icon })
            return { icon: cmd.icon, color: item.color, title: `Changed ${item.title} icon`, context: cmd.icon }
          },
        )

      case "complete": {
        const verb = cmd.completed ? "done" : "not done"
        return ok(
          { title: "Update status?", message: `Mark "${item.title}" as ${verb}.`, confirmLabel: "Mark" },
          () => {
            if (isTask) updateTask(item.id, { completed: cmd.completed })
            else {
              const h = habits.find((x) => x.id === item.id)
              const already = h?.completedDates.includes(selectedDate) ?? false
              if (already !== cmd.completed) toggleHabitCompleted(item.id, selectedDate)
            }
            return { icon: item.icon, color: item.color, title: `Marked ${item.title}`, context: verb }
          },
        )
      }

      case "linkWorkout": {
        if (!isTask) return { error: "Only tasks can link to a workout." }
        const session = await pickByName(cmd.query, sessions, "workout")
        if (!session) return { error: `No workout matching "${cmd.query}".` }
        return ok(
          { title: "Link workout?", message: `Link "${item.title}" to the "${session.name}" workout.`, confirmLabel: "Link" },
          () => {
            updateTask(item.id, { workoutSessionId: session.id, recipeId: undefined, color: session.color, icon: "workout" })
            return { icon: "workout", color: session.color, title: `Linked ${item.title}`, context: `→ ${session.name}` }
          },
        )
      }

      case "linkRecipe": {
        if (!isTask) return { error: "Only tasks can link to a recipe." }
        const recipe = await pickByName(cmd.query, recipes, "recipe")
        if (!recipe) return { error: `No recipe matching "${cmd.query}".` }
        return ok(
          { title: "Link recipe?", message: `Link "${item.title}" to the "${recipe.name}" recipe.`, confirmLabel: "Link" },
          () => {
            updateTask(item.id, { recipeId: recipe.id, workoutSessionId: undefined, color: recipe.color, icon: "meal" })
            return { icon: "meal", color: recipe.color, title: `Linked ${item.title}`, context: `→ ${recipe.name}` }
          },
        )
      }

      case "toHabit": {
        if (!isTask) return { error: `"${item.title}" is already a habit.` }
        const daysLabel =
          cmd.daysOfWeek.length === 7 ? "every day" : cmd.daysOfWeek.map((d) => DAY_NAMES[d]).join(" ")
        return ok(
          {
            title: "Make it a habit?",
            message: `"${item.title}" will repeat ${daysLabel}. Its date and any links are cleared.`,
            confirmLabel: "Make habit",
          },
          () => {
            deleteTask(item.id)
            addHabit({
              title: item.title,
              startMinutes: item.startMinutes,
              durationMinutes: item.durationMinutes,
              color: item.color,
              icon: item.icon,
              daysOfWeek: cmd.daysOfWeek,
            })
            return { icon: item.icon, color: item.color, title: `${item.title} is now a habit`, context: daysLabel }
          },
        )
      }

      case "toTask": {
        if (isTask) return { error: `"${item.title}" is already a one-time task.` }
        const date = cmd.date ?? selectedDate
        return ok(
          {
            title: "Make it one-time?",
            message: `"${item.title}" becomes a single task on ${relativeDayLabel(date)}. Its repeat schedule and history are cleared.`,
            confirmLabel: "Make task",
          },
          () => {
            deleteHabit(item.id)
            addTask({
              title: item.title,
              startMinutes: item.startMinutes,
              durationMinutes: item.durationMinutes,
              color: item.color,
              icon: item.icon,
              date,
            })
            return { icon: item.icon, color: item.color, title: `${item.title} is now one-time`, context: relativeDayLabel(date) }
          },
        )
      }
    }
  }

  // Resolves a name reference (workout/recipe), prompting to disambiguate.
  async function pickByName<T extends { id: string; name: string }>(
    query: string,
    options: T[],
    kind: string,
  ): Promise<T | null> {
    const matches = resolveByName(query, options)
    if (matches.length === 0) return null
    if (matches.length === 1) return matches[0]
    const id = await choose({
      title: `Which ${kind}?`,
      options: matches.slice(0, 4).map((m) => ({ label: m.name, value: m.id })),
    })
    return matches.find((m) => m.id === id) ?? null
  }

  // Returns true if the input was handled as a command (resolved or not).
  async function tryCommand(raw: string, now: Date) {
    const cmd = parseCommand(raw, now)
    if (!cmd) return false

    const matches = resolveTarget(cmd.target, commandItems(), selectedDate)
    if (matches.length === 0) {
      const what = cmd.target.titleWords.join(" ") || "that item"
      flash(null, `Couldn't find "${what}" to ${ACTION_VERB[cmd.action]}.`)
      return true
    }

    let item = matches[0]
    if (matches.length > 1) {
      const picked = await choose({
        title: "Which one?",
        message: "More than one matches — pick the one you meant.",
        options: matches.slice(0, 4).map((m) => ({ label: itemLabel(m), value: m.id })),
      })
      if (!picked) return true
      item = matches.find((m) => m.id === picked)!
    }

    const plan = await planCommand(cmd, item)
    if (plan.error) {
      flash(null, plan.error)
      return true
    }
    const okd = await confirm(plan.confirm!)
    if (!okd) return true
    flash(plan.run!())
    return true
  }

  // Creating always confirms first, and fills in anything the text left vague:
  // when no day was named it asks which day, and unless an exact clock time was
  // given it asks for a time — so nothing is silently guessed.
  async function create(raw: string) {
    const parsed = parseQuickAdd(raw)
    if (!parsed) return
    const now = new Date()
    let startMinutes = parsed.startMinutes
    let date = parsed.date

    if (parsed.kind === "task" && !parsed.dateGiven) {
      const ans = await prompt({
        title: "Which day?",
        message: `When is "${parsed.title}"?`,
        placeholder: "today, tomorrow, mon, 2026-07-01",
        defaultValue: "today",
        confirmLabel: "Next",
      })
      if (ans === null) return
      const d = ans ? parseDateInput(ans, now) : null
      if (d) date = d
    }

    if (parsed.timeGiven !== "exact") {
      const ans = await prompt({
        title: "What time?",
        message: `When does "${parsed.title}" start?`,
        placeholder: "6am, 14:30, morning",
        defaultValue: parsed.timeGiven === "vague" ? formatTimeLabel(startMinutes) : "",
        confirmLabel: "Next",
      })
      if (ans === null) return
      const t = ans ? parseTimeInput(ans) : null
      if (t != null) startMinutes = t
    }

    const durationMinutes = Math.max(5, Math.min(parsed.durationMinutes, 1440 - startMinutes))
    const range = formatTimeRange(startMinutes, durationMinutes)
    const daysLabel = parsed.daysOfWeek
      ? parsed.daysOfWeek.length === 7
        ? "Every day"
        : parsed.daysOfWeek.map((d) => DAY_NAMES[d]).join(" ")
      : ""
    const summary = parsed.kind === "task" ? `${relativeDayLabel(date!)} · ${range}` : `${daysLabel} · ${range}`

    const okd = await confirm({
      title: parsed.kind === "task" ? "Add task?" : "Add habit?",
      message: `Add "${parsed.title}" — ${summary}.`,
      confirmLabel: "Add",
    })
    if (!okd) return

    if (parsed.kind === "task") {
      const id = addTask({
        title: parsed.title,
        startMinutes,
        durationMinutes,
        color: DEFAULT_COLOR,
        icon: parsed.icon,
        date: date!,
      })
      flash({
        icon: parsed.icon,
        color: DEFAULT_COLOR,
        title: `Added ${parsed.title}`,
        context: summary,
        item: {
          type: "task",
          data: {
            id,
            title: parsed.title,
            startMinutes,
            durationMinutes,
            color: DEFAULT_COLOR,
            icon: parsed.icon,
            completed: false,
            date: date!,
          },
        },
      })
    } else {
      const days = parsed.daysOfWeek!
      const id = addHabit({
        title: parsed.title,
        startMinutes,
        durationMinutes,
        color: DEFAULT_COLOR,
        icon: parsed.icon,
        daysOfWeek: days,
      })
      flash({
        icon: parsed.icon,
        color: DEFAULT_COLOR,
        title: `Added ${parsed.title}`,
        context: summary,
        item: {
          type: "habit",
          data: {
            id,
            title: parsed.title,
            startMinutes,
            durationMinutes,
            color: DEFAULT_COLOR,
            icon: parsed.icon,
            daysOfWeek: days,
            completedDates: [],
          },
        },
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = text.trim()
    if (!raw) return
    setText("")
    const handled = await tryCommand(raw, new Date())
    if (!handled) await create(raw)
  }

  function handleEditDetails() {
    if (!confirmation?.item) return
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const item = confirmation.item
    setConfirmation(null)
    onEditDetails(item)
  }

  const ConfirmIcon = confirmation ? ICONS[confirmation.icon] ?? ICONS.default : null

  return (
    <div className="mb-4">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 bg-surface-raised rounded-full pl-4 pr-1.5 py-1.5"
      >
        <Plus size={18} className="text-fg-faint shrink-0" />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none"
        />
        <AnimatePresence>
          {text.trim() && (
            <motion.button
              type="submit"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring.snappy}
              whileTap={tap}
              aria-label="Submit"
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-surface-inverse text-fg-inverse"
            >
              <ArrowRight size={16} />
            </motion.button>
          )}
        </AnimatePresence>
      </form>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={spring.snappy}
            className="text-xs text-rose-400 px-4 pt-2 overflow-hidden"
          >
            {error}
          </motion.p>
        )}

        {confirmation && ConfirmIcon && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={spring.snappy}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-surface-alt rounded-2xl p-2.5 mt-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: confirmation.color, color: "#111827" }}
              >
                <ConfirmIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg truncate">{confirmation.title}</p>
                <p className="text-xs text-fg-faint truncate">{confirmation.context}</p>
              </div>
              {confirmation.item && (
                <motion.button
                  onClick={handleEditDetails}
                  whileTap={tap}
                  className="flex items-center gap-1 text-xs font-medium text-fg-muted shrink-0 px-2 py-1"
                >
                  <Pencil size={13} />
                  Edit details
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
