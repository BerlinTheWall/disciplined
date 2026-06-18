import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'
import { useHabitStore } from '../../store/habitStore'
import { ICONS } from '../../lib/icons'

const COLOR_OPTIONS = ['#34d399', '#60a5fa', '#fbbf24', '#fb7185', '#a78bfa', '#fb923c']
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
const DAY_OPTIONS = [
  { label: 'S', value: 0 }, { label: 'M', value: 1 }, { label: 'T', value: 2 },
  { label: 'W', value: 3 }, { label: 'T', value: 4 }, { label: 'F', value: 5 }, { label: 'S', value: 6 },
]

interface AddItemSheetProps { isOpen: boolean; onClose: () => void }

export default function AddItemSheet({ isOpen, onClose }: AddItemSheetProps) {
  const addTask = useTaskStore((s) => s.addTask)
  const selectedDate = useTaskStore((s) => s.selectedDate)
  const addHabit = useHabitStore((s) => s.addHabit)

  const [mode, setMode] = useState<'task' | 'habit'>('task')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [color, setColor] = useState(COLOR_OPTIONS[0])
  const [icon, setIcon] = useState<keyof typeof ICONS>('alarm')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])

  function resetForm() {
    setTitle(''); setTime('09:00'); setDuration(30); setColor(COLOR_OPTIONS[0]); setIcon('alarm'); setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])
  }

  function toggleDay(value: number) {
    setDaysOfWeek((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]))
  }

  function handleSubmit() {
    if (!title.trim()) return
    const [hours, minutes] = time.split(':').map(Number)
    const startMinutes = hours * 60 + minutes

    if (mode === 'task') {
      addTask({ title: title.trim(), startMinutes, durationMinutes: duration, color, icon, date: selectedDate })
    } else {
      if (daysOfWeek.length === 0) return
      addHabit({ title: title.trim(), startMinutes, durationMinutes: duration, color, icon, daysOfWeek })
    }
    resetForm()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New {mode === 'task' ? 'task' : 'habit'}</h2>
              <button onClick={onClose} className="p-2 -m-2 text-gray-400"><X size={22} /></button>
            </div>

            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              {(['task', 'habit'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                  {m === 'task' ? 'One-time task' : 'Repeating habit'}
                </button>
              ))}
            </div>

            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'task' ? 'Task title' : 'Habit title'} autoFocus className="w-full text-base border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-gray-400" />

            <label className="text-sm text-gray-500 mb-1 block">Start time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full text-base border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-gray-400" />

            <label className="text-sm text-gray-500 mb-2 block">Duration</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {DURATION_OPTIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)} className={`px-3 py-2 rounded-full text-sm font-medium ${duration === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {d < 60 ? `${d}m` : `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}`}
                </button>
              ))}
            </div>

            {mode === 'habit' && (
              <>
                <label className="text-sm text-gray-500 mb-2 block">Repeat on</label>
                <div className="flex gap-2 mb-4">
                  {DAY_OPTIONS.map(({ label, value }) => (
                    <button key={value} onClick={() => toggleDay(value)} className={`w-9 h-9 rounded-full text-sm font-medium ${daysOfWeek.includes(value) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label className="text-sm text-gray-500 mb-2 block">Icon</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {(Object.keys(ICONS) as Array<keyof typeof ICONS>).filter((key) => key !== 'default').map((key) => {
                const IconComp = ICONS[key]
                return (
                  <button key={key} onClick={() => setIcon(key)} className={`w-10 h-10 rounded-full flex items-center justify-center ${icon === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <IconComp size={18} />
                  </button>
                )
              })}
            </div>

            <label className="text-sm text-gray-500 mb-2 block">Color</label>
            <div className="flex gap-3 mb-6">
              {COLOR_OPTIONS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: c }}>
                  {color === c && <div className="w-3 h-3 rounded-full bg-white" />}
                </button>
              ))}
            </div>

            <button onClick={handleSubmit} disabled={!title.trim() || (mode === 'habit' && daysOfWeek.length === 0)} className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-medium disabled:opacity-40">
              {mode === 'task' ? 'Add task' : 'Add habit'}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}