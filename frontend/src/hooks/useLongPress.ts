import { useCallback, useRef } from "react";

const LONG_PRESS_MS = 500;

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const start = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to a single finger/pointer, not drag pointer events from dnd-kit
      if (e.pointerType === "mouse" && e.button !== 0) return;
      didLongPress.current = false;
      timer.current = setTimeout(() => {
        didLongPress.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [onLongPress]
  );

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}
