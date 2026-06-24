import { useEffect, type RefObject } from 'react'

// Focuses an input when a sheet/modal opens — but only AFTER the open animation
// has settled, and crucially with `{ preventScroll: true }`.
//
// The native `autoFocus` attribute focuses immediately, while the sheet is still
// sliding up. On mobile the browser then tries to scroll the input into view and
// the soft keyboard resizes the viewport, so the panel jumps to its end and the
// field scrolls out of sight. Delaying the focus until the panel is in place and
// suppressing the scroll-into-view avoids that jump while still opening the
// keyboard.
export function useAutoFocus<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  delay = 250,
) {
  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => {
      ref.current?.focus({ preventScroll: true })
    }, delay)
    return () => window.clearTimeout(id)
  }, [active, delay, ref])
}
