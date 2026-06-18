import { useState } from 'react'
import { Plus } from 'lucide-react'
import Timeline from './components/timeline/Timeline'
import AddItemSheet from './components/timeline/AddItemSheet'
import WeekHeader from './components/timeline/WeekHeader'

function App() {
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white py-8 px-4 pb-24">
      <h1 className="text-2xl font-bold mb-6 ml-16">Today</h1>
      <WeekHeader />
      <Timeline />

      <button
        onClick={() => setIsAddOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      >
        <Plus size={26} />
      </button>

      <AddItemSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  )
}

export default App