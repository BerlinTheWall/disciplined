import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Sparkles } from "lucide-react";

import BottomSheet from "./BottomSheet";
import { tap } from "@/lib/motion";
import { useChatStore } from "@/store/chatStore";
import { useNotificationHistoryStore } from "@/store/notificationHistoryStore";

interface Props {
  onOpenSchedule: (date: string) => void;
  onOpenGoals: () => void;
}

// Header icon + unread badge, opening a history of past reminders and AI
// nudges — the persistent counterpart to ReminderHost's/NudgeHost's
// transient banners, which otherwise vanish with no trace once dismissed.
export default function NotificationBell({ onOpenSchedule, onOpenGoals }: Props) {
  const entries = useNotificationHistoryStore((s) => s.entries);
  const markAllRead = useNotificationHistoryStore((s) => s.markAllRead);
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = entries.filter((e) => !e.read).length;

  function open() {
    setIsOpen(true);
    markAllRead();
  }

  function handleTap(entry: (typeof entries)[number]) {
    setIsOpen(false);
    if (entry.kind === "reminder") {
      if (entry.date) onOpenSchedule(entry.date);
      return;
    }
    if (entry.actionPhrase) {
      useChatStore.getState().openChat();
      void useChatStore
        .getState()
        .send(entry.actionPhrase)
        .catch(() => {});
    } else {
      onOpenGoals();
    }
  }

  return (
    <>
      <motion.button
        onClick={open}
        whileTap={tap}
        aria-label="Notifications"
        className="relative p-1 text-fg-faint"
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </motion.button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="bg-surface-alt max-h-[70vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-fg">Notifications</h2>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 pb-4"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Bell size={22} className="text-fg-faint" />
              <p className="text-sm text-fg-faint">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleTap(entry)}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-surface text-left"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-surface-raised text-fg-muted">
                    {entry.kind === "nudge" ? <Sparkles size={16} /> : <Bell size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fg text-sm leading-tight">{entry.title}</p>
                    <p className="text-sm text-fg-muted mt-0.5">{entry.body}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
