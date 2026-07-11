import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import { speak, speakAssistant, stopSpeaking, useVoices } from "@/hooks/useSpeech";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { spring, tap } from "@/lib/motion";
import { notifyPermission, REMINDER_OPTIONS, requestNotifyPermission } from "@/lib/reminders";
import { useSettingsStore } from "@/store/settingsStore";
import { useThemeStore } from "@/store/themeStore";

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// "Microsoft David - English (United States)" → "David"; "Google US English"
// → "US English". Keeps the voice chips short enough to scan.
function voiceLabel(v: SpeechSynthesisVoice) {
  return v.name
    .replace(/^(Microsoft|Google|Apple) /, "")
    .replace(/ ?[-–—] .*$/, "")
    .replace(/ \(.*\)$/, "");
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
  const [scheduleView, setScheduleView, altStyle, setAltStyle, background, setBackground] =
    useSettingsStore(
      useShallow((state) => [
        state.scheduleView,
        state.setScheduleView,
        state.altStyle,
        state.setAltStyle,
        state.background,
        state.setBackground,
      ])
    );
  const [remindersEnabled, setRemindersEnabled, defaultReminderMinutes, setDefaultReminderMinutes] =
    useSettingsStore(
      useShallow((state) => [
        state.remindersEnabled,
        state.setRemindersEnabled,
        state.defaultReminderMinutes,
        state.setDefaultReminderMinutes,
      ])
    );
  const [speakReminders, setSpeakReminders, voiceURI, setVoiceURI, naturalVoice, setNaturalVoice] =
    useSettingsStore(
      useShallow((state) => [
        state.speakReminders,
        state.setSpeakReminders,
        state.voiceURI,
        state.setVoiceURI,
        state.naturalVoice,
        state.setNaturalVoice,
      ])
    );

  function toggleNaturalVoice() {
    const next = !naturalVoice;
    setNaturalVoice(next);
    // Preview through the real path — hearing the fallback voice here means
    // the server isn't reachable, which is exactly what the user should know.
    if (next) void speakAssistant("Hi! I'll be reading your reminders from now on.");
    else stopSpeaking();
  }

  // Voices for the picker: prefer the ones matching the UI language so the
  // list stays scannable; fall back to everything the OS offers.
  const voices = useVoices();
  const langPrefix = (navigator.language || "en").slice(0, 2).toLowerCase();
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const voiceOptions = langVoices.length > 0 ? langVoices : voices;

  function pickVoice(uri: string | null) {
    setVoiceURI(uri);
    speak("This is how reminders will sound.", { voiceURI: uri });
  }

  function toggleSpeakReminders() {
    const next = !speakReminders;
    setSpeakReminders(next);
    // Speaking from this tap doubles as the browser's audio unlock and shows
    // immediately what the feature sounds like.
    if (next) speak("Reminders will be read aloud, like this.");
    else stopSpeaking();
  }
  const { theme, toggleTheme } = useThemeStore();
  // Browser notification permission — refreshed after we ask for it, so the
  // subtitle below reflects the outcome.
  const [permission, setPermission] = useState(notifyPermission);

  const isWeekly = scheduleView === "weekly";

  async function toggleReminders() {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    // Ask for system-notification permission when turning reminders on; if
    // it's declined, reminders still work as in-app banners.
    if (next && notifyPermission() === "default") {
      setPermission(await requestNotifyPermission());
    }
  }

  const reminderSubtitle = !remindersEnabled
    ? "You won't get reminders for tasks and habits"
    : permission === "granted"
      ? "Notifies you before tasks and habits start"
      : permission === "denied"
        ? "In-app only — allow notifications in your browser to get alerts when the app is closed"
        : "In-app banners before tasks and habits start";

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface-alt p-5 pb-8 max-h-[90vh] overflow-y-auto"
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
          subtitle={isWeekly ? "Showing the whole week as a grid" : "Showing one day as a timeline"}
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

      {/* Notifications */}
      <p className="text-xs font-semibold text-fg-faint uppercase tracking-wide px-1 mb-2">
        Notifications
      </p>
      <div className="mb-6 flex flex-col gap-2">
        <Row
          title="Reminders"
          subtitle={reminderSubtitle}
          on={remindersEnabled}
          onToggle={() => void toggleReminders()}
        />
        {remindersEnabled && (
          <Row
            title="Speak reminders"
            subtitle={
              speakReminders
                ? "Reminders are read aloud when they appear"
                : "Reads the reminder text aloud when it appears"
            }
            on={speakReminders}
            onToggle={toggleSpeakReminders}
          />
        )}
        {remindersEnabled && speakReminders && (
          <Row
            title="Natural voice"
            subtitle={
              naturalVoice
                ? "Human-like AI voice — falls back to the device voice offline"
                : "Using the plain device voice"
            }
            on={naturalVoice}
            onToggle={toggleNaturalVoice}
          />
        )}
        {remindersEnabled && speakReminders && !naturalVoice && voiceOptions.length > 0 && (
          <div className="bg-surface rounded-2xl shadow-soft px-4 py-3.5">
            <p className="font-medium text-fg">Device voice</p>
            <p className="text-sm text-fg-faint mt-0.5 mb-3">Tap a voice to preview it</p>
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <motion.button
                onClick={() => pickVoice(null)}
                whileTap={tap}
                className={`px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${
                  voiceURI === null
                    ? "bg-surface-inverse text-fg-inverse"
                    : "bg-surface-raised text-fg-muted"
                }`}
              >
                Default
              </motion.button>
              {voiceOptions.map((v) => {
                const selected = voiceURI === v.voiceURI;
                return (
                  <motion.button
                    key={v.voiceURI}
                    onClick={() => pickVoice(v.voiceURI)}
                    whileTap={tap}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${
                      selected
                        ? "bg-surface-inverse text-fg-inverse"
                        : "bg-surface-raised text-fg-muted"
                    }`}
                  >
                    {voiceLabel(v)}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
        {remindersEnabled && (
          <div className="bg-surface rounded-2xl shadow-soft px-4 py-3.5">
            <p className="font-medium text-fg">Default reminder</p>
            <p className="text-sm text-fg-faint mt-0.5 mb-3">
              Pre-selected for new tasks and habits
            </p>
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {REMINDER_OPTIONS.map((opt) => {
                const selected = defaultReminderMinutes === opt.value;
                return (
                  <motion.button
                    key={String(opt.value)}
                    onClick={() => setDefaultReminderMinutes(opt.value)}
                    whileTap={tap}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium shrink-0 ${
                      selected
                        ? "bg-surface-inverse text-fg-inverse"
                        : "bg-surface-raised text-fg-muted"
                    }`}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
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

      {/* Background */}
      <p className="text-xs font-semibold text-fg-faint uppercase tracking-wide px-1 mb-2 mt-6">
        Background
      </p>
      <div className="flex gap-3">
        {BACKGROUNDS.map((bg) => {
          const selected = background === bg.key;
          return (
            <motion.button
              key={bg.key}
              onClick={() => setBackground(bg.key)}
              whileTap={tap}
              className="flex-1 flex flex-col items-center gap-2"
            >
              <span
                className="w-full h-16 rounded-2xl border-2 transition-colors"
                style={{
                  background: bg.swatch,
                  borderColor: selected ? "var(--fg)" : "var(--border-strong)",
                }}
              />
              <span className={`text-xs font-medium ${selected ? "text-fg" : "text-fg-muted"}`}>
                {bg.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
