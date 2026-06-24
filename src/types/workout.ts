// A WorkoutSession is a reusable plan ("Push day", "5k tempo run", "Pool intervals").
// It holds an ordered list of exercises/segments. The model is deliberately general:
// every metric is optional, and the editor surfaces only the fields that make sense
// for the session's type. A schedule Task can link to a session by id so the user
// knows exactly what to do when the workout block comes up.
export type WorkoutType =
  | 'gym'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'yoga'
  | 'other'

export interface WorkoutExercise {
  id: string
  name: string
  // Strength-style metrics
  sets?: number
  reps?: number
  weight?: number // kg
  restSec?: number // rest between sets, in seconds
  // Cardio / distance-style metrics
  distance?: number // km for running/cycling, m for swimming
  durationMin?: number // target duration, in minutes
  pace?: string // free text, e.g. "5:30 /km"
  incline?: number // % grade / steepness
  // Generic
  notes?: string
}

export interface WorkoutSession {
  id: string
  name: string
  type: WorkoutType
  color: string
  exercises: WorkoutExercise[]
}
