import { motion } from "framer-motion";

import { spring, tap } from "@/lib/motion";

// An iOS-style toggle switch. The switch itself is the whole hit target: rows
// in a settings list sit close together, and a stray tap on a label while
// scrolling should not flip a setting.
export default function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  // Accessible name — the visible row title is not inside the button.
  label: string;
}) {
  return (
    <motion.button
      onClick={onToggle}
      whileTap={tap}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`w-10.5 h-6.5 rounded-full flex items-center px-0.5 shrink-0 transition-colors duration-200 ${
        on ? "bg-fg" : "bg-surface-subtle"
      }`}
    >
      <motion.span
        className="w-5.5 h-5.5 rounded-full bg-surface shadow-sm"
        animate={{ x: on ? 16 : 0 }}
        transition={spring.snappy}
      />
    </motion.button>
  );
}
