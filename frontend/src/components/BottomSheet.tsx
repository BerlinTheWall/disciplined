import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

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
            className={`fixed bottom-0 left-0 right-0 rounded-t-2xl z-50 shadow-xl ${className ?? ""}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
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
