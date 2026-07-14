import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { spring, tap } from "@/lib/motion";

// Rows of the edit sheet; tapping one slides its editor up from the bottom.
export type EditRowKey = "date" | "time" | "repeat" | "alert" | "priority" | "links";

const FIELD_PANEL_TITLES: Record<EditRowKey, string> = {
  date: "Date",
  time: "Time",
  repeat: "Repeat",
  alert: "Alert",
  priority: "Priority",
  links: "Links",
};

// One tappable value row of the edit sheet: icon, current value, optional
// hint on the right, and a chevron; tapping slides that field's editor panel
// up from the bottom.
export function FieldRow({
  icon: IconComp,
  value,
  hint,
  muted = false,
  onPress,
}: {
  icon: LucideIcon;
  value: string;
  hint?: string;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <button onClick={onPress} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
      <IconComp size={18} className="text-fg-muted shrink-0" />
      <span
        className={`flex-1 min-w-0 truncate text-[15px] font-medium ${muted ? "text-fg-faint" : "text-fg"}`}
      >
        {value}
      </span>
      {hint && <span className="text-sm text-fg-faint shrink-0">{hint}</span>}
      <ChevronRight size={16} className="text-fg-faint shrink-0" />
    </button>
  );
}

// The field editor overlay — tapping a value row slides this up over the edit
// sheet (own backdrop, higher z than the sheet); edits apply live, Done just
// dismisses it. Rendered as a sibling of the sheet, never inside it, so its
// fixed positioning isn't captured by the sheet's transform.
export function FieldPanel({
  openKey,
  color,
  onColor,
  onClose,
  children,
}: {
  openKey: EditRowKey | null;
  color: string;
  onColor: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {openKey && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
          />
          <motion.div
            key={openKey}
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-70 shadow-xl max-h-[80vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.gentle}
          >
            <div className="sticky top-0 bg-surface rounded-t-2xl flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-base font-semibold text-fg">{FIELD_PANEL_TITLES[openKey]}</h3>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="h-8 px-3.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: color, color: onColor }}
              >
                Done
              </motion.button>
            </div>
            <div className="px-4 pb-8 pt-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
