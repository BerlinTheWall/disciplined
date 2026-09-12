import { motion } from "framer-motion";

import { COLOR_OPTIONS } from "@/components/timeline/addItemOptions";
import { tap } from "@/lib/motion";

// The goal's own accent — same palette and swatch row as the task sheet's
// Color field (AddItemSheet), so a goal and the tasks under it can share a
// color. `value` null (a goal from before colors were pickable) just leaves
// every swatch unselected.
export default function GoalColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <div
      className="wheel-col flex gap-3 overflow-x-auto bg-surface-raised rounded-full p-1.5"
      style={{ scrollbarWidth: "none" }}
    >
      {COLOR_OPTIONS.map((c) => (
        <motion.button
          key={c}
          onClick={() => onChange(c)}
          whileTap={tap}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          className="w-8 h-8 rounded-full shrink-0"
          style={{
            backgroundColor: c,
            outline: value === c ? "2px solid var(--fg)" : "none",
            outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );
}
