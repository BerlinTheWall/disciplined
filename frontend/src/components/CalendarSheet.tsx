import { useEffect, useState } from "react";
import type { Calendar } from "@ebarooni/capacitor-calendar";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Check, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import {
  deviceCalendarSupported,
  hasCalendarAccess,
  listDeviceCalendars,
  requestFullCalendarAccess,
  sourceLabelFor,
} from "@/lib/deviceCalendar";
import { pullDeviceCalendars } from "@/lib/deviceCalendarSync";
import { tap } from "@/lib/motion";
import { useCalendarStore } from "@/store/calendarStore";

interface CalendarSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCE_LABEL_TEXT: Record<string, string> = {
  icloud: "iCloud",
  google: "Google",
  outlook: "Outlook",
  other: "Other",
};

export default function CalendarSheet({ isOpen, onClose }: CalendarSheetProps) {
  const [readCalendarIds, toggleReadCalendar, writeCalendarId, setWriteCalendarId] =
    useCalendarStore(
      useShallow((s) => [
        s.readCalendarIds,
        s.toggleReadCalendar,
        s.writeCalendarId,
        s.setWriteCalendarId,
      ])
    );
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deniedOnce, setDeniedOnce] = useState(false);

  useEffect(() => {
    if (!isOpen || !deviceCalendarSupported || calendars !== null) return;
    void (async () => {
      if (await hasCalendarAccess()) setCalendars(await listDeviceCalendars());
    })();
  }, [isOpen, calendars]);

  async function connect() {
    setConnecting(true);
    try {
      const granted = await requestFullCalendarAccess();
      if (!granted) {
        setDeniedOnce(true);
        return;
      }
      setCalendars(await listDeviceCalendars());
    } finally {
      setConnecting(false);
    }
  }

  function selectRead(id: string) {
    if (id === writeCalendarId) setWriteCalendarId(null);
    toggleReadCalendar(id);
    // Fire-and-forget — reflects the new selection without waiting for the
    // next foreground/resume cycle.
    void pullDeviceCalendars();
  }

  function selectWrite(id: string) {
    if (readCalendarIds.includes(id)) toggleReadCalendar(id);
    setWriteCalendarId(writeCalendarId === id ? null : id);
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface-alt flex flex-col max-h-[75vh]"
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#818cf8] text-[#111827]">
          <CalendarIcon size={15} />
        </span>
        <h2 className="text-base font-bold text-fg flex-1">Connected Calendars</h2>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="p-2 -mr-2 text-fg-faint"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {!deviceCalendarSupported ? (
          <p className="text-sm text-fg-faint">
            Calendar connections are available in the Disciplined iOS and Android app.
          </p>
        ) : calendars === null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-faint">
              Connect Apple, Google, or Outlook calendars you&rsquo;ve already added in your
              phone&rsquo;s Settings — Disciplined will read their events for your timeline and AI
              weekly planner, and can add its own events to one calendar of your choice.
            </p>
            {deniedOnce && (
              <p className="text-xs text-red-500">
                Calendar access was denied — allow it for Disciplined in your device Settings, then
                try again.
              </p>
            )}
            <motion.button
              onClick={() => void connect()}
              disabled={connecting}
              whileTap={tap}
              className="h-11 rounded-xl bg-fg text-fg-inverse text-sm font-semibold disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect calendars"}
            </motion.button>
          </div>
        ) : calendars.length === 0 ? (
          <p className="text-sm text-fg-faint">
            No calendars found — add an Apple, Google, or Outlook account in your device&rsquo;s
            Settings first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-1.5">
                Show on my timeline
              </p>
              <div className="flex flex-col gap-1.5">
                {calendars.map((cal) => {
                  const checked = readCalendarIds.includes(cal.id);
                  return (
                    <motion.button
                      key={cal.id}
                      onClick={() => selectRead(cal.id)}
                      whileTap={tap}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised text-left"
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: checked ? cal.color : "transparent",
                          border: `2px solid ${cal.color}`,
                        }}
                      >
                        {checked && <Check size={12} className="text-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-fg truncate">
                          {cal.title}
                        </span>
                        <span className="block text-xs text-fg-faint">
                          {SOURCE_LABEL_TEXT[sourceLabelFor(cal)]}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-1.5">
                Add new events to
              </p>
              <p className="text-xs text-fg-faint mb-2">
                Events you create in Disciplined will also appear on this calendar. Pick none to
                keep them in Disciplined only.
              </p>
              <div className="flex flex-col gap-1.5">
                {calendars.map((cal) => {
                  const selected = writeCalendarId === cal.id;
                  return (
                    <motion.button
                      key={cal.id}
                      onClick={() => selectWrite(cal.id)}
                      whileTap={tap}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised text-left"
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: selected ? cal.color : "transparent",
                          border: `2px solid ${cal.color}`,
                        }}
                      >
                        {selected && <Check size={12} className="text-white" />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-fg truncate">
                        {cal.title}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
