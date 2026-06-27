import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

// Horizontal swipe to navigate prev/next. Vertical scrolling still works:
// dragDirectionLock + touch-pan-y mean a horizontal intent navigates while a
// vertical intent scrolls the page.
const SWIPE_DISTANCE = 60 // px dragged to commit
const SWIPE_VELOCITY = 450 // …or a fast flick

interface SwipeAreaProps {
  onPrev: () => void
  onNext: () => void
  className?: string
  children: ReactNode
}

export default function SwipeArea({ onPrev, onNext, className, children }: SwipeAreaProps) {
  return (
    <motion.div
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => {
        if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) onNext()
        else if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) onPrev()
      }}
      className={className ? `touch-pan-y ${className}` : 'touch-pan-y'}
    >
      {children}
    </motion.div>
  )
}
