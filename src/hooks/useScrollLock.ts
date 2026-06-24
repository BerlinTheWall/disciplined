import { useEffect } from 'react'

// Prevents the page behind a modal/sheet from scrolling while it's open.
//
// The app's scrolling region is the per-page container in App (marked with
// `data-scroll-lock`), not the document body, so we freeze that element's
// overflow. A module-level counter lets stacked modals (e.g. a detail sheet that
// opens an editor) share one lock — scrolling is only restored when the last one
// closes.

let lockCount = 0
let lockedTarget: HTMLElement | null = null
let prevBodyOverflow = ''
let prevTargetOverflow = ''

function applyLock() {
  prevBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  lockedTarget = document.querySelector<HTMLElement>('[data-scroll-lock]')
  if (lockedTarget) {
    prevTargetOverflow = lockedTarget.style.overflow
    lockedTarget.style.overflow = 'hidden'
  }
}

function releaseLock() {
  document.body.style.overflow = prevBodyOverflow
  if (lockedTarget) {
    lockedTarget.style.overflow = prevTargetOverflow
    lockedTarget = null
  }
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockCount += 1
    if (lockCount === 1) applyLock()
    return () => {
      lockCount -= 1
      if (lockCount === 0) releaseLock()
    }
  }, [active])
}
