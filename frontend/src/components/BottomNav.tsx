import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CircleUser, Home, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { spring, tap } from "@/lib/motion";
import type { Page } from "@/lib/pages";

interface BottomNavProps {
  active: Page;
  onChange: (page: Page) => void;
  onAdd?: () => void;
  fabOpen?: boolean;
}

export default function BottomNav({ active, onChange, onAdd, fabOpen }: BottomNavProps) {
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

  const tabs: {
    key: string;
    label: string;
    icon: LucideIcon;
    isActive: boolean;
    onSelect: () => void;
  }[] = [
    {
      key: "home",
      label: "Home",
      icon: Home,
      isActive: active === "home",
      onSelect: () => onChange("home"),
    },
    {
      key: "calendar",
      label: "Calendar",
      icon: CalendarDays,
      isActive: active === "schedule",
      onSelect: () => onChange("schedule"),
    },
    {
      key: "profile",
      label: "Profile",
      icon: CircleUser,
      isActive: active === "profile",
      onSelect: () => onChange("profile"),
    },
  ];

  return (
    // Ends short of the right edge — the voice assistant's circle sits there,
    // a deliberate sibling to the pill rather than a fourth tab.
    <div
      className="fixed left-4 right-24 z-30"
      style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
    >
      {/* Plus circle — only on schedule, stacked directly above the voice
          assistant's mic at the right edge */}
      <AnimatePresence>
        {active === "schedule" && (
          <motion.button
            onClick={onAdd}
            whileTap={tap}
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: isScrolling ? 0.4 : 1, scale: 1, y: 0, rotate: fabOpen ? 135 : 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 8 }}
            transition={spring.snappy}
            className="fixed right-5 z-30 w-14 h-14 rounded-full bg-fg text-fg-inverse flex items-center justify-center shadow-xl"
            style={{ bottom: "calc(102px + env(safe-area-inset-bottom))" }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pill */}
      <nav className="bg-surface rounded-full shadow-xl border border-border-strong flex items-center px-2 py-2.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <motion.button
              key={t.key}
              onClick={t.onSelect}
              whileTap={tap}
              className="flex flex-col items-center gap-0.5 flex-1"
            >
              <span className="relative flex items-center justify-center w-12 h-8">
                {/* Plain mount animation, deliberately not a layoutId morph:
                    shared layout animations inside position:fixed measure
                    against the page and yanked the whole pill downward when a
                    tab switch coincided with the page transition. */}
                {t.isActive && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.snappy}
                    className="absolute inset-0 bg-fg rounded-2xl"
                  />
                )}
                <Icon
                  size={23}
                  strokeWidth={t.isActive ? 2.2 : 1.7}
                  className={`relative z-10 ${t.isActive ? "text-fg-inverse" : "text-fg-faint"}`}
                />
              </span>
              <span
                className={`text-[11px] ${
                  t.isActive ? "text-fg font-semibold" : "text-fg-faint font-medium"
                }`}
              >
                {t.label}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
