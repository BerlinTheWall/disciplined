import { useEffect, useState } from "react";
import type { Calendar } from "@ebarooni/capacitor-calendar";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Check, Mail, X } from "lucide-react";
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
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleCalendarSupported,
} from "@/lib/googleCalendarAuth";
import { tap } from "@/lib/motion";
import { connectOutlook, disconnectOutlook, outlookSupported } from "@/lib/outlookAuth";
import { useCalendarStore } from "@/store/calendarStore";
import { useGoogleCalendarStore } from "@/store/googleCalendarStore";
import { useOutlookStore } from "@/store/outlookStore";

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

// The selectable row shared by "Add new events to" — either a device
// calendar or the connected Outlook account, so both can live in one list
// with a single active selection.
function WriteTargetRow({
  label,
  sublabel,
  color,
  selected,
  onSelect,
}: {
  label: string;
  sublabel?: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileTap={tap}
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised text-left"
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: selected ? color : "transparent", border: `2px solid ${color}` }}
      >
        {selected && <Check size={12} className="text-white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-fg truncate">{label}</span>
        {sublabel && <span className="block text-xs text-fg-faint">{sublabel}</span>}
      </span>
    </motion.button>
  );
}

export default function CalendarSheet({ isOpen, onClose }: CalendarSheetProps) {
  const [readCalendarIds, toggleReadCalendar, writeTarget, setWriteTarget] = useCalendarStore(
    useShallow((s) => [s.readCalendarIds, s.toggleReadCalendar, s.writeTarget, s.setWriteTarget])
  );
  const [outlookConnected, outlookEmail, outlookLoaded] = useOutlookStore(
    useShallow((s) => [s.connected, s.msAccountEmail, s.loaded])
  );
  const [googleConnected, googleEmail, googleLoaded] = useGoogleCalendarStore(
    useShallow((s) => [s.connected, s.googleAccountEmail, s.loaded])
  );
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deniedOnce, setDeniedOnce] = useState(false);
  const [connectingOutlook, setConnectingOutlook] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  useEffect(() => {
    if (!isOpen || !deviceCalendarSupported || calendars !== null) return;
    void (async () => {
      if (await hasCalendarAccess()) setCalendars(await listDeviceCalendars());
    })();
  }, [isOpen, calendars]);

  useEffect(() => {
    if (isOpen && outlookSupported && !outlookLoaded) void useOutlookStore.getState().refresh();
  }, [isOpen, outlookLoaded]);

  useEffect(() => {
    if (isOpen && googleCalendarSupported && !googleLoaded) {
      void useGoogleCalendarStore.getState().refresh();
    }
  }, [isOpen, googleLoaded]);

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

  async function toggleOutlookConnection() {
    if (outlookConnected) {
      if (writeTarget?.kind === "outlook") setWriteTarget(null);
      await disconnectOutlook();
      return;
    }
    setConnectingOutlook(true);
    try {
      await connectOutlook();
    } finally {
      // The actual "connected" flip happens async, once the in-app browser
      // redirects back (see lib/outlookAuth.ts's appUrlOpen listener) — this
      // just clears the button's own "opening…" state.
      setConnectingOutlook(false);
    }
  }

  async function toggleGoogleConnection() {
    if (googleConnected) {
      if (writeTarget?.kind === "google") setWriteTarget(null);
      await disconnectGoogleCalendar();
      return;
    }
    setConnectingGoogle(true);
    try {
      await connectGoogleCalendar();
    } finally {
      setConnectingGoogle(false);
    }
  }

  function selectRead(id: string) {
    if (writeTarget?.kind === "device" && writeTarget.calendarId === id) setWriteTarget(null);
    toggleReadCalendar(id);
    void pullDeviceCalendars();
  }

  function selectWriteDevice(id: string) {
    if (readCalendarIds.includes(id)) toggleReadCalendar(id);
    const alreadySelected = writeTarget?.kind === "device" && writeTarget.calendarId === id;
    setWriteTarget(alreadySelected ? null : { kind: "device", calendarId: id });
  }

  function selectWriteOutlook() {
    setWriteTarget(writeTarget?.kind === "outlook" ? null : { kind: "outlook" });
  }

  function selectWriteGoogle() {
    setWriteTarget(writeTarget?.kind === "google" ? null : { kind: "google" });
  }

  const showWriteSection =
    (calendars && calendars.length > 0) || outlookConnected || googleConnected;

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

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
        {!deviceCalendarSupported ? (
          <p className="text-sm text-fg-faint">
            Calendar connections are available in the Disciplined iOS and Android app.
          </p>
        ) : (
          <>
            {calendars === null ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-faint">
                  Connect calendars already added in your phone&rsquo;s Settings — Disciplined will
                  read their events for your timeline and AI weekly planner, and can add its own
                  events to one calendar of your choice.
                </p>
                {deniedOnce && (
                  <p className="text-xs text-red-500">
                    Calendar access was denied — allow it for Disciplined in your device Settings,
                    then try again.
                  </p>
                )}
                <motion.button
                  onClick={() => void connect()}
                  disabled={connecting}
                  whileTap={tap}
                  className="h-11 rounded-xl bg-fg text-fg-inverse text-sm font-semibold disabled:opacity-60"
                >
                  {connecting ? "Connecting…" : "Connect device calendars"}
                </motion.button>
                <p className="text-xs text-fg-faint">
                  Don&rsquo;t see an expected calendar (e.g. Outlook or Google) after connecting?
                  Many calendar apps only sync to your phone&rsquo;s calendar if you turn that on
                  inside the app itself — or connect your Microsoft or Google account directly below
                  instead.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-1.5">
                  Show on my timeline
                </p>
                {calendars.length === 0 ? (
                  <p className="text-sm text-fg-faint">
                    No calendars found — add an account in your device&rsquo;s Settings first.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {calendars.map((cal) => (
                      <WriteTargetRow
                        key={cal.id}
                        label={cal.title}
                        sublabel={SOURCE_LABEL_TEXT[sourceLabelFor(cal)]}
                        color={cal.color}
                        selected={readCalendarIds.includes(cal.id)}
                        onSelect={() => selectRead(cal.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <Mail size={14} className="text-fg-faint" />
                <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide">
                  Outlook (Microsoft account)
                </p>
              </div>
              <p className="text-xs text-fg-faint mb-2">
                Connects directly to your Microsoft account — sees your Outlook calendar regardless
                of whether it&rsquo;s synced to this device.
              </p>
              {!outlookSupported ? (
                <p className="text-sm text-fg-faint">Available in the iOS and Android app.</p>
              ) : outlookConnected ? (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised">
                  <span className="flex-1 min-w-0 text-sm font-medium text-fg truncate">
                    {outlookEmail}
                  </span>
                  <motion.button
                    onClick={() => void toggleOutlookConnection()}
                    whileTap={tap}
                    className="text-xs font-semibold text-red-500 shrink-0"
                  >
                    Disconnect
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  onClick={() => void toggleOutlookConnection()}
                  disabled={connectingOutlook}
                  whileTap={tap}
                  className="h-11 w-full rounded-xl bg-fg text-fg-inverse text-sm font-semibold disabled:opacity-60"
                >
                  {connectingOutlook ? "Opening…" : "Connect Outlook"}
                </motion.button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <Mail size={14} className="text-fg-faint" />
                <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide">
                  Google Calendar
                </p>
              </div>
              <p className="text-xs text-fg-faint mb-2">
                Connects directly to your Google account — sees your Google Calendar regardless of
                whether it&rsquo;s synced to this device.
              </p>
              {!googleCalendarSupported ? (
                <p className="text-sm text-fg-faint">Available in the iOS and Android app.</p>
              ) : googleConnected ? (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised">
                  <span className="flex-1 min-w-0 text-sm font-medium text-fg truncate">
                    {googleEmail}
                  </span>
                  <motion.button
                    onClick={() => void toggleGoogleConnection()}
                    whileTap={tap}
                    className="text-xs font-semibold text-red-500 shrink-0"
                  >
                    Disconnect
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  onClick={() => void toggleGoogleConnection()}
                  disabled={connectingGoogle}
                  whileTap={tap}
                  className="h-11 w-full rounded-xl bg-fg text-fg-inverse text-sm font-semibold disabled:opacity-60"
                >
                  {connectingGoogle ? "Opening…" : "Connect Google Calendar"}
                </motion.button>
              )}
            </div>

            {showWriteSection && (
              <div>
                <p className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide mb-1.5">
                  Add new events to
                </p>
                <p className="text-xs text-fg-faint mb-2">
                  Events you create in Disciplined will also appear here. Pick none to keep them in
                  Disciplined only.
                </p>
                <div className="flex flex-col gap-1.5">
                  {calendars?.map((cal) => (
                    <WriteTargetRow
                      key={cal.id}
                      label={cal.title}
                      color={cal.color}
                      selected={writeTarget?.kind === "device" && writeTarget.calendarId === cal.id}
                      onSelect={() => selectWriteDevice(cal.id)}
                    />
                  ))}
                  {outlookConnected && (
                    <WriteTargetRow
                      label={`${outlookEmail} (Outlook)`}
                      color="#0078d4"
                      selected={writeTarget?.kind === "outlook"}
                      onSelect={selectWriteOutlook}
                    />
                  )}
                  {googleConnected && (
                    <WriteTargetRow
                      label={`${googleEmail} (Google)`}
                      color="#4285f4"
                      selected={writeTarget?.kind === "google"}
                      onSelect={selectWriteGoogle}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
