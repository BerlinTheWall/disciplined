import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { useScrollLock } from "@/hooks/useScrollLock";
import { spring, tap } from "@/lib/motion";
import { useSettingsStore } from "@/store/settingsStore";
import { useThemeStore } from "@/store/themeStore";

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// An iOS-style toggle switch.
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <motion.button
      onClick={onToggle}
      whileTap={tap}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 shrink-0 transition-colors duration-200 ${
        on ? "bg-fg" : "bg-surface-subtle"
      }`}
    >
      <motion.span
        className="w-5 h-5 rounded-full bg-surface shadow-sm"
        animate={{ x: on ? 16 : 0 }}
        transition={spring.snappy}
      />
    </motion.button>
  );
}

function Row({
  title,
  subtitle,
  on,
  onToggle,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 w-full text-left bg-surface rounded-2xl shadow-soft px-4 py-3.5"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-fg">{title}</p>
        <p className="text-sm text-fg-faint mt-0.5">{subtitle}</p>
      </div>
      <Switch on={on} onToggle={onToggle} />
    </button>
  );
}

export default function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  useScrollLock(isOpen);
  const scheduleView = useSettingsStore((s) => s.scheduleView);
  const setScheduleView = useSettingsStore((s) => s.setScheduleView);
  const altStyle = useSettingsStore((s) => s.altStyle);
  const setAltStyle = useSettingsStore((s) => s.setAltStyle);
  const { theme, toggleTheme } = useThemeStore();

  const isWeekly = scheduleView === "weekly";

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
            className="fixed bottom-0 left-0 right-0 bg-surface-alt rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[90vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-fg">Settings</h2>
              <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
                <X size={22} />
              </motion.button>
            </div>

            {/* Schedule */}
            <p className="text-xs font-semibold text-fg-faint uppercase tracking-wide px-1 mb-2">
              Schedule
            </p>
            <div className="mb-6 flex flex-col gap-2">
              <Row
                title="Weekly view"
                subtitle={
                  isWeekly ? "Showing the whole week as a grid" : "Showing one day as a timeline"
                }
                on={isWeekly}
                onToggle={() => setScheduleView(isWeekly ? "daily" : "weekly")}
              />
              <Row
                title="Alternate style"
                subtitle="A different look for the calendar and tasks"
                on={altStyle}
                onToggle={() => setAltStyle(!altStyle)}
              />
            </div>

            {/* Appearance */}
            <p className="text-xs font-semibold text-fg-faint uppercase tracking-wide px-1 mb-2">
              Appearance
            </p>
            <Row
              title="Dark mode"
              subtitle={theme === "dark" ? "Dark theme is on" : "Light theme is on"}
              on={theme === "dark"}
              onToggle={toggleTheme}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
