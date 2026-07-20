import { useState } from "react";
import { motion } from "framer-motion";
import { Flame, GraduationCap, Sparkles, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import Collapse from "./Collapse";
import Switch from "./Switch";
import { speak, speakAssistant, stopSpeaking, useVoices } from "@/hooks/useSpeech";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { tap } from "@/lib/motion";
import { isNativeReminderPlatform } from "@/lib/nativeReminders";
import { notifyPermission, REMINDER_OPTIONS, requestNotifyPermission } from "@/lib/reminders";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useSigmaStore } from "@/store/sigmaStore";
import { useThemeStore } from "@/store/themeStore";
import { useTutorialStore } from "@/store/tutorialStore";

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

// Earliest auto-play time choices for the morning briefing; opening the app
// earlier leaves the briefing armed until the clock passes the chosen time.
const BRIEFING_FROM_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "Any time" },
  { value: 5 * 60, label: "5 AM" },
  { value: 6 * 60, label: "6 AM" },
  { value: 7 * 60, label: "7 AM" },
  { value: 8 * 60, label: "8 AM" },
  { value: 9 * 60, label: "9 AM" },
  { value: 10 * 60, label: "10 AM" },
];

// A titled group of rows rendered as one card, iOS-settings style: hairline
// dividers between rows rather than a gap, so a section reads as one block.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-[11px] font-semibold text-fg-faint uppercase tracking-wide px-1 mb-1.5">
        {title}
      </h3>
      <div className="bg-surface rounded-2xl shadow-soft overflow-hidden divide-y divide-border">
        {children}
      </div>
    </section>
  );
}

// Subtitle is optional: a toggle already says whether it is on, so only spend
// a second line when it explains something the switch cannot.
function Row({
  title,
  subtitle,
  on,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 w-full px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {subtitle && <p className="text-xs text-fg-faint mt-0.5">{subtitle}</p>}
      </div>
      <Switch on={on} onToggle={onToggle} label={title} />
    </div>
  );
}

// A row whose control is a horizontal strip of chips.
function ChipRow<T>({
  title,
  options,
  selected,
  onSelect,
  labelOf,
  keyOf,
}: {
  title: string;
  options: T[];
  selected: (option: T) => boolean;
  onSelect: (option: T) => void;
  labelOf: (option: T) => string;
  keyOf: (option: T) => string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[15px] font-medium text-fg mb-2">{title}</p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        {options.map((option) => (
          <motion.button
            key={keyOf(option)}
            onClick={() => onSelect(option)}
            whileTap={tap}
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium shrink-0 ${
              selected(option)
                ? "bg-surface-inverse text-fg-inverse"
                : "bg-surface-raised text-fg-muted"
            }`}
          >
            {labelOf(option)}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const [altStyle, setAltStyle, background, setBackground] = useSettingsStore(
    useShallow((state) => [
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
  const [
    morningBriefing,
    setMorningBriefing,
    morningBriefingFromMinutes,
    setMorningBriefingFromMinutes,
  ] = useSettingsStore(
    useShallow((state) => [
      state.morningBriefing,
      state.setMorningBriefing,
      state.morningBriefingFromMinutes,
      state.setMorningBriefingFromMinutes,
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
  // null is a real choice (the system default), so it rides along as an option.
  const voiceChoices: (SpeechSynthesisVoice | null)[] = [null, ...voiceOptions];

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
  const sigmaOn = useSigmaStore((s) => s.on);
  // Browser notification permission — refreshed after we ask for it, so the
  // subtitle below reflects the outcome.
  const [permission, setPermission] = useState(notifyPermission);

  async function toggleReminders() {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    // Ask for system-notification permission when turning reminders on; if
    // it's declined, reminders still work as in-app banners.
    if (next && notifyPermission() === "default") {
      setPermission(await requestNotifyPermission());
    }
  }

  // Only worth a second line when it says something the switch does not: that
  // notifications are blocked, so these will be in-app banners only.
  const reminderSubtitle =
    remindersEnabled && permission === "denied"
      ? isNativeReminderPlatform
        ? "In-app only — allow notifications for Disciplined in iOS Settings for alerts when the app is closed"
        : "In-app only — allow notifications in your browser for alerts when the app is closed"
      : undefined;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface-alt max-h-[70vh] flex flex-col overflow-hidden"
    >
      {/* Fixed header — stays put while the sections below scroll */}
      <div className="flex items-center justify-between p-5 pb-4">
        <h2 className="text-xl font-bold text-fg">Settings</h2>
        <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
          <X size={22} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Section title="Notifications">
          <Row
            title="Reminders"
            subtitle={reminderSubtitle}
            on={remindersEnabled}
            onToggle={() => void toggleReminders()}
          />
          <Collapse open={remindersEnabled}>
            <ChipRow
              title="Default reminder"
              options={REMINDER_OPTIONS}
              keyOf={(o) => String(o.value)}
              labelOf={(o) => o.label}
              selected={(o) => defaultReminderMinutes === o.value}
              onSelect={(o) => setDefaultReminderMinutes(o.value)}
            />
          </Collapse>
          <Collapse open={remindersEnabled}>
            <Row title="Speak reminders" on={speakReminders} onToggle={toggleSpeakReminders} />
          </Collapse>
          <Collapse open={remindersEnabled && speakReminders}>
            <Row
              title="Natural voice"
              subtitle="Human-like AI voice; falls back to the device voice offline"
              on={naturalVoice}
              onToggle={toggleNaturalVoice}
            />
          </Collapse>
          <Collapse open={remindersEnabled && speakReminders && !naturalVoice}>
            <ChipRow
              title="Device voice"
              options={voiceChoices}
              keyOf={(v) => v?.voiceURI ?? "default"}
              labelOf={(v) => (v ? voiceLabel(v) : "Default")}
              selected={(v) => voiceURI === (v?.voiceURI ?? null)}
              onSelect={(v) => pickVoice(v?.voiceURI ?? null)}
            />
          </Collapse>
          <Row
            title="Morning briefing"
            subtitle="Hear your day on the first open of each day"
            on={morningBriefing}
            onToggle={() => setMorningBriefing(!morningBriefing)}
          />
          <Collapse open={morningBriefing}>
            <ChipRow
              title="Not before"
              options={BRIEFING_FROM_OPTIONS}
              selected={(o) => o.value === morningBriefingFromMinutes}
              onSelect={(o) => setMorningBriefingFromMinutes(o.value)}
              labelOf={(o) => o.label}
              keyOf={(o) => String(o.value)}
            />
          </Collapse>
        </Section>

        <Section title="Appearance">
          <Row title="Dark mode" on={theme === "dark"} onToggle={toggleTheme} />
          <Row
            title="Alternate style"
            subtitle="A different look for the calendar and tasks"
            on={altStyle}
            onToggle={() => setAltStyle(!altStyle)}
          />
          <div className="px-4 py-3">
            <p className="text-[15px] font-medium text-fg mb-2">Background</p>
            <div className="flex gap-2">
              {BACKGROUNDS.map((bg) => {
                const selected = background === bg.key;
                return (
                  <motion.button
                    key={bg.key}
                    onClick={() => setBackground(bg.key)}
                    whileTap={tap}
                    className="flex-1 flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="w-full h-12 rounded-xl border-2 transition-colors"
                      style={{
                        background: bg.swatch,
                        borderColor: selected ? "var(--fg)" : "var(--border-strong)",
                      }}
                    />
                    <span
                      className={`text-[11px] font-medium ${selected ? "text-fg" : "text-fg-muted"}`}
                    >
                      {bg.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title="Help">
          <motion.button
            onClick={() => {
              // Back to the welcome card; close Settings so the tour has the
              // screen to itself.
              useTutorialStore.getState().restart();
              onClose();
            }}
            whileTap={tap}
            className="flex items-center gap-3 w-full px-4 py-3 text-left"
          >
            <span className="text-[15px] font-medium text-fg flex-1">Replay the tutorial</span>
            <GraduationCap size={18} className="text-fg-muted" />
          </motion.button>
          <motion.button
            onClick={() => {
              // Re-show the first-launch setup wizard (for testing).
              useOnboardingStore.getState().restart();
              onClose();
            }}
            whileTap={tap}
            className="flex items-center gap-3 w-full px-4 py-3 text-left"
          >
            <span className="text-[15px] font-medium text-fg flex-1">Replay the setup wizard</span>
            <Sparkles size={18} className="text-fg-muted" />
          </motion.button>
        </Section>

        {/* Personal gimmick, not a real product feature — harsh black/red
            theme + hype interruptions for when you're slacking. */}
        <Section title="???">
          <Row
            title="Sigma Mode"
            subtitle="No mercy. No slacking."
            on={sigmaOn}
            onToggle={() => useSigmaStore.getState().toggle()}
          />
          <motion.button
            onClick={() => {
              useSigmaStore.getState().openManager();
              onClose();
            }}
            whileTap={tap}
            className="flex items-center gap-3 w-full px-4 py-3 text-left"
          >
            <span className="text-[15px] font-medium text-fg flex-1">Manage Sigma content</span>
            <Flame size={18} className="text-fg-muted" />
          </motion.button>
        </Section>
      </div>
    </BottomSheet>
  );
}
