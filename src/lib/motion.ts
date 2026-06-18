import type { Transition } from 'framer-motion'

export const spring = {
  // snappy feedback: toggles, buttons, segmented controls
  snappy: { type: 'spring', stiffness: 500, damping: 32, mass: 0.3 },
  // travels a distance: sheets, page slides
  gentle: { type: 'spring', stiffness: 300, damping: 30 },
  // a little personality: new items popping in, the check
  pop: { type: 'spring', stiffness: 600, damping: 18, mass: 0.6 },
} satisfies Record<string, Transition>

export const tap = { scale: 0.94 }   // whileTap for buttons
export const press = { scale: 0.97 } // for larger surfaces