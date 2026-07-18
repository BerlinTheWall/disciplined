import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useScrollLock } from "@/hooks/useScrollLock";
import { spring } from "@/lib/motion";

// The app's standard modal bottom sheet: dimmed backdrop (tap to close), a
// panel that springs up from the bottom edge, and a scroll lock while open.
// Sheets pass their own background/padding/height via className; content that
// must survive the exit animation is kept alive by AnimatePresence, so
// data-driven sheets (isOpen={!!item}) render correctly while sliding out.
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  // Panel extras: background, padding, max-height, overflow/flex behavior.
  className?: string;
  children: ReactNode;
}

export default function BottomSheet({ isOpen, onClose, className, children }: BottomSheetProps) {
  useScrollLock(isOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  // iOS overlays the keyboard on the layout viewport rather than resizing it,
  // so a fixed bottom-0 panel would sit behind it — lift the panel by the
  // keyboard's height (0 when closed, and on platforms that resize instead).
  // Capped so a tall sheet's top never leaves the screen: it lifts only as far
  // as the space above allows, keeping the (top-anchored) focused field
  // visible while its lower part stays behind the keyboard.
  const keyboardInset = useKeyboardInset(isOpen);
  const [lift, setLift] = useState(0);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (keyboardInset === 0 || !panel) {
      setLift(0);
      return;
    }
    const safeTop =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0;
    const spaceAbove = window.innerHeight - panel.offsetHeight - safeTop - 8;
    setLift(Math.min(keyboardInset, Math.max(0, spaceAbove)));
  }, [keyboardInset]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            className={`fixed bottom-0 left-0 right-0 rounded-t-2xl z-50 shadow-xl ${className ?? ""}`}
            initial={{ y: "100%" }}
            animate={{ y: -lift }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
