import { createContext } from 'react'
import { flushSync } from 'react-dom'
import { useMotionValue, animate, type MotionValue } from 'framer-motion'
import { spring } from '../../lib/motion'

export interface SwipeController {
  x: MotionValue<number>
  onPrev: () => void
  onNext: () => void
  settle: (target: number, commit?: () => void) => void
}

// A shared controller lets two pagers move together (e.g. the week strip and the
// weekly grid): they bind the same motion value and commit through the same
// handlers. `null` means each pager is independent.
export const WeekSwipeContext = createContext<SwipeController | null>(null)

export function useSwipeController(
  onPrev: () => void,
  onNext: () => void,
): SwipeController {
  const x = useMotionValue(0)
  function settle(target: number, commit?: () => void) {
    animate(x, target, {
      ...spring.gentle,
      onComplete: () => {
        if (commit) {
          // Commit synchronously so the reused panel is repositioned as the
          // current page before we reset the offset — one paint, no flicker.
          flushSync(() => commit())
          x.set(0)
        }
      },
    })
  }
  return { x, onPrev, onNext, settle }
}
