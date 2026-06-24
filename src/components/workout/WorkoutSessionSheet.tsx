/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Plus } from 'lucide-react'
import { useWorkoutStore, blankExercise } from '../../store/workoutStore'
import {
  WORKOUT_TYPE_META,
  WORKOUT_TYPE_ORDER,
  fieldMeta,
} from '../../lib/workout'
import type { WorkoutExercise, WorkoutSession, WorkoutType } from '../../types/workout'
import type { WorkoutFieldKey } from '../../lib/workout'
import { spring, tap } from '../../lib/motion'
import { useScrollLock } from '../../hooks/useScrollLock'

const COLOR_OPTIONS = [
  '#fb7185', '#34d399', '#60a5fa', '#22d3ee', '#a78bfa',
  '#fbbf24', '#fb923c', '#a3e635', '#f472b6', '#f87171',
]

function isLightColor(hex: string) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
}

interface WorkoutSessionSheetProps {
  isOpen: boolean
  onClose: () => void
  editSession?: WorkoutSession | null
}

export default function WorkoutSessionSheet({
  isOpen,
  onClose,
  editSession,
}: WorkoutSessionSheetProps) {
  const addSession = useWorkoutStore((s) => s.addSession)
  const updateSession = useWorkoutStore((s) => s.updateSession)
  const deleteSession = useWorkoutStore((s) => s.deleteSession)

  const isEditing = !!editSession
  useScrollLock(isOpen)

  const [name, setName] = useState('')
  const [type, setType] = useState<WorkoutType>('gym')
  const [color, setColor] = useState(WORKOUT_TYPE_META.gym.color)
  const [colorTouched, setColorTouched] = useState(false)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([blankExercise()])

  useEffect(() => {
    if (!isOpen) return
    if (editSession) {
      setName(editSession.name)
      setType(editSession.type)
      setColor(editSession.color)
      setColorTouched(true)
      setExercises(
        editSession.exercises.length ? editSession.exercises : [blankExercise()],
      )
    } else {
      setName('')
      setType('gym')
      setColor(WORKOUT_TYPE_META.gym.color)
      setColorTouched(false)
      setExercises([blankExercise()])
    }
  }, [isOpen, editSession])

  function pickType(next: WorkoutType) {
    setType(next)
    // Adopt the type's signature color unless the user has picked one.
    if (!colorTouched) setColor(WORKOUT_TYPE_META[next].color)
  }

  function setExercise(id: string, changes: Partial<WorkoutExercise>) {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)))
  }
  function addExercise() {
    setExercises((prev) => [...prev, blankExercise()])
  }
  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((e) => e.id !== id))
  }

  function handleSave() {
    const cleanName = name.trim()
    if (!cleanName) return
    // Drop exercises with no name; keep their metric fields as-is.
    const cleanExercises = exercises.filter((e) => e.name.trim() !== '')
    if (isEditing) {
      updateSession(editSession!.id, { name: cleanName, type, color, exercises: cleanExercises })
    } else {
      addSession({ name: cleanName, type, color, exercises: cleanExercises })
    }
    onClose()
  }

  function handleDelete() {
    if (editSession) deleteSession(editSession.id)
    onClose()
  }

  const meta = WORKOUT_TYPE_META[type]
  const onColor = isLightColor(color) ? '#111827' : '#ffffff'
  const HeaderIcon = meta.icon
  const canSave = !!name.trim()

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 shadow-xl max-h-[92vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring.snappy}
          >
            {/* Colored header */}
            <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: color }}>
              <div className="flex items-center justify-between">
                <motion.button
                  onClick={onClose}
                  whileTap={tap}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: isLightColor(color) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)',
                    color: onColor,
                  }}
                >
                  <X size={20} />
                </motion.button>
                {isEditing && (
                  <motion.button
                    onClick={handleDelete}
                    whileTap={tap}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: isLightColor(color) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)',
                      color: onColor,
                    }}
                  >
                    <Trash2 size={18} />
                  </motion.button>
                )}
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div
                  className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#2f2f33' }}
                >
                  <HeaderIcon size={28} style={{ color }} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Session name"
                  autoFocus={!isEditing}
                  className={`flex-1 min-w-0 bg-transparent text-2xl font-semibold border-b pb-1 focus:outline-none ${isLightColor(color) ? 'placeholder-black/40' : 'placeholder-white/50'}`}
                  style={{
                    color: onColor,
                    caretColor: onColor,
                    borderColor: isLightColor(color) ? 'rgba(17,24,39,0.3)' : 'rgba(255,255,255,0.5)',
                  }}
                />
              </div>
            </div>

            {/* Body */}
            <div className="p-4 pb-6">
              {/* Type */}
              <label className="text-xs font-medium text-fg-muted mb-2 block">Type</label>
              <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
                {WORKOUT_TYPE_ORDER.map((t) => {
                  const m = WORKOUT_TYPE_META[t]
                  const TIcon = m.icon
                  const selected = type === t
                  return (
                    <motion.button
                      key={t}
                      onClick={() => pickType(t)}
                      whileTap={tap}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${selected ? 'bg-surface-inverse text-fg-inverse' : 'bg-surface-raised text-fg-muted'}`}
                    >
                      <TIcon size={15} />
                      {m.label}
                    </motion.button>
                  )
                })}
              </div>

              {/* Color */}
              <label className="text-xs font-medium text-fg-muted mb-2 block">Color</label>
              <div
                className="flex gap-3 overflow-x-auto bg-surface-raised rounded-full p-1.5 mb-6"
                style={{ scrollbarWidth: 'none' }}
              >
                {COLOR_OPTIONS.map((c) => (
                  <motion.button
                    key={c}
                    onClick={() => { setColor(c); setColorTouched(true) }}
                    whileTap={tap}
                    className="w-8 h-8 rounded-full shrink-0"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? '2px solid var(--fg)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>

              {/* Exercises */}
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-fg-muted">
                  {meta.fields.includes('distance') && !meta.fields.includes('sets')
                    ? 'Segments'
                    : 'Exercises'}
                </label>
                <span className="text-xs text-fg-faint">{exercises.length}</span>
              </div>

              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {exercises.map((ex, i) => (
                    <motion.div
                      key={ex.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={spring.snappy}
                      className="rounded-2xl bg-surface-raised p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                          style={{ backgroundColor: color, color: onColor }}
                        >
                          {i + 1}
                        </span>
                        <input
                          type="text"
                          value={ex.name}
                          onChange={(e) => setExercise(ex.id, { name: e.target.value })}
                          placeholder="Exercise name"
                          className="flex-1 min-w-0 bg-transparent font-medium text-fg placeholder-fg-faint focus:outline-none"
                        />
                        <motion.button
                          onClick={() => removeExercise(ex.id)}
                          whileTap={tap}
                          className="w-7 h-7 rounded-full text-fg-faint hover:text-fg flex items-center justify-center shrink-0"
                          aria-label="Remove exercise"
                        >
                          <X size={16} />
                        </motion.button>
                      </div>

                      <div className="flex flex-wrap gap-2 pl-8">
                        {meta.fields.map((key) => (
                          <ExerciseField
                            key={key}
                            fieldKey={key}
                            type={type}
                            value={ex[key as keyof WorkoutExercise]}
                            onChange={(v) => setExercise(ex.id, { [key]: v } as Partial<WorkoutExercise>)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <motion.button
                  onClick={addExercise}
                  whileTap={tap}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong py-3 text-sm font-medium text-fg-muted"
                >
                  <Plus size={16} />
                  Add {meta.fields.includes('distance') && !meta.fields.includes('sets') ? 'segment' : 'exercise'}
                </motion.button>
              </div>

              <motion.button
                onClick={handleSave}
                whileTap={canSave ? tap : undefined}
                disabled={!canSave}
                className="w-full rounded-2xl py-3.5 font-medium mt-6 disabled:opacity-40"
                style={{ backgroundColor: color, color: onColor }}
              >
                {isEditing ? 'Save session' : 'Create session'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---- a single metric field ---- */

function ExerciseField({
  fieldKey,
  type,
  value,
  onChange,
}: {
  fieldKey: WorkoutFieldKey
  type: WorkoutType
  value: unknown
  onChange: (value: number | string | undefined) => void
}) {
  const meta = fieldMeta(fieldKey, type)
  const isNotes = fieldKey === 'notes'

  if (isNotes) {
    return (
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={meta.placeholder}
        className="w-full bg-surface rounded-lg px-2.5 py-1.5 text-sm text-fg placeholder-fg-faint focus:outline-none"
      />
    )
  }

  if (meta.kind === 'text') {
    return (
      <label className="flex items-center gap-1.5 bg-surface rounded-lg px-2.5 py-1.5">
        <span className="text-[11px] text-fg-faint">{meta.label}</span>
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={meta.placeholder}
          className="w-20 bg-transparent text-sm font-medium text-fg placeholder-fg-faint focus:outline-none"
        />
      </label>
    )
  }

  return (
    <label className="flex items-center gap-1.5 bg-surface rounded-lg px-2.5 py-1.5">
      <span className="text-[11px] text-fg-faint">{meta.label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === '' ? undefined : Number(raw))
        }}
        placeholder={meta.placeholder}
        className="w-12 bg-transparent text-sm font-medium text-fg text-center placeholder-fg-faint focus:outline-none tabular-nums"
      />
      {meta.unit && <span className="text-[11px] text-fg-faint">{meta.unit}</span>}
    </label>
  )
}
