import { useEffect, type RefObject } from "react";
import { Capacitor } from "@capacitor/core";

// Focuses an input when a sheet/modal opens — but only AFTER the open animation
// has settled.
//
// The native `autoFocus` attribute focuses immediately, while the sheet is still
// sliding up. On mobile browsers the scroll-into-view + keyboard resize combo
// then yanks the panel, so the scroll is suppressed there. In the packaged iOS
// app the opposite is true: the native pan is exactly what a manual tap
// produces (the whole view shifts to reveal the input, BottomSheet's keyboard
// lift covers only the remainder), so autofocus must allow it — suppressing it
// left the sheet doing all the movement alone, visibly unlike the tap path.
const preventScroll = !Capacitor.isNativePlatform();

export function useAutoFocus<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  delay = 250
) {
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      ref.current?.focus({ preventScroll });
    }, delay);
    return () => window.clearTimeout(id);
  }, [active, delay, ref]);
}
