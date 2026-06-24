import { Dumbbell, Footprints, Bike, Waves, PersonStanding, Activity } from 'lucide-react'
import type { WorkoutExercise, WorkoutSession, WorkoutType } from '../types/workout'

// Which exercise fields each workout type exposes in the editor. Keeping this as
// data (rather than branching in the UI) makes the form generic and easy to extend.
export type WorkoutFieldKey =
  | 'sets'
  | 'reps'
  | 'weight'
  | 'restSec'
  | 'distance'
  | 'durationMin'
  | 'pace'
  | 'incline'
  | 'notes'

export interface WorkoutTypeMeta {
  label: string
  icon: React.ElementType
  color: string
  /** Default unit label for the `distance` field, when the type uses it. */
  distanceUnit: 'km' | 'm'
  fields: WorkoutFieldKey[]
}

export const WORKOUT_TYPE_META: Record<WorkoutType, WorkoutTypeMeta> = {
  gym: {
    label: 'Gym',
    icon: Dumbbell,
    color: '#fb7185',
    distanceUnit: 'km',
    fields: ['sets', 'reps', 'weight', 'restSec', 'notes'],
  },
  running: {
    label: 'Running',
    icon: Footprints,
    color: '#34d399',
    distanceUnit: 'km',
    fields: ['distance', 'durationMin', 'pace', 'incline', 'notes'],
  },
  cycling: {
    label: 'Cycling',
    icon: Bike,
    color: '#60a5fa',
    distanceUnit: 'km',
    fields: ['distance', 'durationMin', 'pace', 'incline', 'notes'],
  },
  swimming: {
    label: 'Swimming',
    icon: Waves,
    color: '#22d3ee',
    distanceUnit: 'm',
    fields: ['distance', 'durationMin', 'pace', 'notes'],
  },
  yoga: {
    label: 'Yoga',
    icon: PersonStanding,
    color: '#a78bfa',
    distanceUnit: 'km',
    fields: ['durationMin', 'notes'],
  },
  other: {
    label: 'Other',
    icon: Activity,
    color: '#fbbf24',
    distanceUnit: 'km',
    fields: ['sets', 'reps', 'weight', 'restSec', 'distance', 'durationMin', 'pace', 'incline', 'notes'],
  },
}

export const WORKOUT_TYPE_ORDER: WorkoutType[] = [
  'gym',
  'running',
  'cycling',
  'swimming',
  'yoga',
  'other',
]

export interface WorkoutFieldMeta {
  label: string
  kind: 'number' | 'text'
  unit?: string
  placeholder?: string
}

export function fieldMeta(key: WorkoutFieldKey, type: WorkoutType): WorkoutFieldMeta {
  switch (key) {
    case 'sets':
      return { label: 'Sets', kind: 'number', placeholder: '3' }
    case 'reps':
      return { label: 'Reps', kind: 'number', placeholder: '10' }
    case 'weight':
      return { label: 'Weight', kind: 'number', unit: 'kg', placeholder: '60' }
    case 'restSec':
      return { label: 'Rest', kind: 'number', unit: 's', placeholder: '90' }
    case 'distance':
      return {
        label: 'Distance',
        kind: 'number',
        unit: WORKOUT_TYPE_META[type].distanceUnit,
        placeholder: WORKOUT_TYPE_META[type].distanceUnit === 'm' ? '500' : '5',
      }
    case 'durationMin':
      return { label: 'Duration', kind: 'number', unit: 'min', placeholder: '30' }
    case 'pace':
      return { label: 'Pace', kind: 'text', placeholder: '5:30 /km' }
    case 'incline':
      return { label: 'Incline', kind: 'number', unit: '%', placeholder: '2' }
    case 'notes':
      return { label: 'Notes', kind: 'text', placeholder: 'Optional notes' }
  }
}

// A compact human summary of one exercise, e.g. "3 × 10 · 60kg · 90s rest" or
// "5km · 30min · 5:30 /km · 2%". Only includes fields that are set.
export function exerciseSummary(ex: WorkoutExercise, type: WorkoutType): string {
  const parts: string[] = []
  if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets} × ${ex.reps}`)
  else if (ex.sets != null) parts.push(`${ex.sets} sets`)
  else if (ex.reps != null) parts.push(`${ex.reps} reps`)
  if (ex.weight != null) parts.push(`${ex.weight}kg`)
  if (ex.distance != null) parts.push(`${ex.distance}${WORKOUT_TYPE_META[type].distanceUnit}`)
  if (ex.durationMin != null) parts.push(`${ex.durationMin}min`)
  if (ex.pace) parts.push(ex.pace)
  if (ex.incline != null) parts.push(`${ex.incline}%`)
  if (ex.restSec != null) parts.push(`${ex.restSec}s rest`)
  return parts.join(' · ')
}

// The metric fields of one exercise that actually have a value, as readable
// {label, value} pairs (e.g. { label: 'Weight', value: '60 kg' }). Excludes
// `notes`, which is rendered separately. Used by the detail view.
export function exerciseMetrics(
  ex: WorkoutExercise,
  type: WorkoutType,
): { key: WorkoutFieldKey; label: string; value: string }[] {
  const out: { key: WorkoutFieldKey; label: string; value: string }[] = []
  for (const key of WORKOUT_TYPE_META[type].fields) {
    if (key === 'notes') continue
    const raw = ex[key as keyof WorkoutExercise]
    if (raw == null || raw === '') continue
    const meta = fieldMeta(key, type)
    out.push({
      key,
      label: meta.label,
      value: meta.unit ? `${raw} ${meta.unit}` : String(raw),
    })
  }
  return out
}

// A one-line summary of the whole session for list cards.
export function sessionSummary(session: WorkoutSession): string {
  const n = session.exercises.length
  if (n === 0) return 'No exercises yet'
  const meta = WORKOUT_TYPE_META[session.type]
  // For distance-based types, roll up total distance when present.
  if (meta.fields.includes('distance')) {
    const total = session.exercises.reduce((sum, e) => sum + (e.distance ?? 0), 0)
    if (total > 0) return `${n} ${n === 1 ? 'segment' : 'segments'} · ${total}${meta.distanceUnit}`
  }
  return `${n} ${n === 1 ? 'exercise' : 'exercises'}`
}
