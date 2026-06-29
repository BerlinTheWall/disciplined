import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Dumbbell, Flame, Plus, UtensilsCrossed, Wallet } from "lucide-react";

import { spring, tap } from "@/lib/motion";
import { themeColors } from "@/lib/theme";
import { useThemeStore } from "@/store/themeStore";

export type Page = "meals" | "recipes" | "food" | "workout" | "schedule" | "habits" | "expenses";

const TABS: { id: Page; icon: React.ElementType; label: string }[] = [
  { id: "meals", icon: UtensilsCrossed, label: "Meals" },
  { id: "workout", icon: Dumbbell, label: "Workout" },
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "habits", icon: Flame, label: "Habits" },
  { id: "expenses", icon: Wallet, label: "Wallet" },
];

interface BottomNavProps {
  active: Page;
  onChange: (page: Page) => void;
  onAdd?: () => void;
  fabOpen?: boolean;
}

export default function BottomNav({ active, onChange, onAdd, fabOpen }: BottomNavProps) {
  const theme = useThemeStore((s) => s.theme);
  const colors = themeColors[theme];

  const [isScrolling, setIsScrolling] = useState(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolling(true);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => setIsScrolling(false), 200);
    };
    // capture phase catches scroll from nested scroll containers (scroll doesn't bubble)
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, []);

  return (
    <div
      className="fixed left-4 right-4 z-30"
      style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
    >
      {/* Plus circle — only on schedule, floats above the pill on the right */}
      <AnimatePresence>
        {active === "schedule" && (
          <motion.button
            onClick={onAdd}
            whileTap={tap}
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: isScrolling ? 0.4 : 1, scale: 1, y: 0, rotate: fabOpen ? 135 : 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 8 }}
            transition={spring.snappy}
            className="absolute -top-17 right-1 w-14 h-14 rounded-full bg-fg text-fg-inverse flex items-center justify-center shadow-xl"
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pill */}
      <nav className="bg-surface rounded-full shadow-xl border border-border-strong flex items-center px-2 py-3.5">
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <motion.button
              key={id}
              onClick={() => onChange(id)}
              whileTap={tap}
              className="flex flex-col items-center gap-1 flex-1"
            >
              <Icon
                size={26}
                strokeWidth={isActive ? 2.3 : 1.6}
                className={isActive ? "text-fg" : "text-fg-faint"}
              />
              <motion.span
                animate={{ color: isActive ? colors.fg : colors.fgFaint }}
                transition={{ duration: 0.15 }}
                className={`text-[11px] ${isActive ? "font-semibold" : "font-medium"}`}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
