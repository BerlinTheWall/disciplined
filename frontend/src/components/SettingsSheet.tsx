import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, GraduationCap, Heart, Sparkles, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import CalendarSheet from "./CalendarSheet";
import Collapse from "./Collapse";
import InterestsSheet from "./InterestsSheet";
import Switch from "./Switch";
import { primeAudioChannel, speakAssistant, stopSpeaking } from "@/hooks/useSpeech";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { tap } from "@/lib/motion";
import { isNativeReminderPlatform } from "@/lib/nativeReminders";
import { notifyPermission, REMINDER_OPTIONS, requestNotifyPermission } from "@/lib/reminders";
import { GOOGLE_VOICES, useGoogleVoiceStore } from "@/store/googleVoiceStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useSettingsStore, type VoiceTone } from "@/store/settingsStore";
import { useThemeStore } from "@/store/themeStore";
import { useTutorialStore } from "@/store/tutorialStore";

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// Personality of spoken reminder lines (see assistantSpeech.ts); each has a
// short spoken preview so picking one previews it immediately, same as the
// voice picker below.
const VOICE_TONES: Array<{ value: VoiceTone; label: string; preview: string }> = [
  { value: "warm", label: "Warm", preview: "Hi — I'll keep reminders warm and personal." },
  {
    value: "direct",
    label: "Direct",
    preview: "Got it. I'll keep reminders short and to the point.",
  },
  {
    value: "motivational",
    label: "Motivational",
    preview: "Let's go! I'll bring the energy to your reminders.",
  },
];

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
  const [showInterests, setShowInterests] = useState(false);
  const [showCalendars, setShowCalendars] = useState(false);
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
  const [voiceEnabled, setVoiceEnabled, voiceTone, setVoiceTone] = useSettingsStore(
    useShallow((state) => [
      state.voiceEnabled,
      state.setVoiceEnabled,
      state.voiceTone,
      state.setVoiceTone,
    ])
  );
  const [googleVoice, setGoogleVoice] = useGoogleVoiceStore(
    useShallow((state) => [state.voice, state.setVoice])
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

  function pickGoogleVoice(voice: string) {
    setGoogleVoice(voice);
    // Cut off whatever preview (this voice or the other one) is still
    // playing — previews shouldn't overlap.
    stopSpeaking();
    primeAudioChannel();
    // Preview through the real path, same as toggling Voice on.
    void speakAssistant("Hi, this is how I'll sound.");
  }

  function pickVoiceTone(tone: VoiceTone) {
    setVoiceTone(tone);
    stopSpeaking();
    primeAudioChannel();
    void speakAssistant(VOICE_TONES.find((t) => t.value === tone)!.preview);
  }

  function toggleVoiceEnabled() {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    stopSpeaking();
    // Speaking from this tap doubles as the audio unlock and shows
    // immediately what the feature sounds like.
    if (next) {
      primeAudioChannel();
      void speakAssistant("I'll read things aloud from now on.");
    }
  }

  const { theme, toggleTheme } = useThemeStore();
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
        ? "In-app only — allow notifications for Disciplined in your device Settings for alerts when the app is closed"
        : "In-app only — allow notifications in your browser for alerts when the app is closed"
      : undefined;

  return (
    <>
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
          </Section>

          <Section title="Voice">
            <Row
              title="Spoken voice"
              subtitle="Read reminders, AI replies, and summaries aloud"
              on={voiceEnabled}
              onToggle={toggleVoiceEnabled}
            />
            <Collapse open={voiceEnabled}>
              <ChipRow
                title="Voice"
                options={GOOGLE_VOICES}
                keyOf={(v) => v.id}
                labelOf={(v) => v.label}
                selected={(v) => googleVoice === v.id}
                onSelect={(v) => pickGoogleVoice(v.id)}
              />
            </Collapse>
            <Collapse open={voiceEnabled}>
              <ChipRow
                title="Reminder tone"
                options={VOICE_TONES}
                keyOf={(t) => t.value}
                labelOf={(t) => t.label}
                selected={(t) => voiceTone === t.value}
                onSelect={(t) => pickVoiceTone(t.value)}
              />
            </Collapse>
            <Collapse open={voiceEnabled}>
              <Row
                title="Morning briefing"
                subtitle="Hear your day on the first open of each day"
                on={morningBriefing}
                onToggle={() => setMorningBriefing(!morningBriefing)}
              />
            </Collapse>
            <Collapse open={voiceEnabled && morningBriefing}>
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

          <Section title="Activities">
            <motion.button
              onClick={() => setShowInterests(true)}
              whileTap={tap}
              className="flex items-center gap-3 w-full px-4 py-3 text-left"
            >
              <span className="text-[15px] font-medium text-fg flex-1">
                Things you want to make time for
              </span>
              <Heart size={18} className="text-fg-muted" />
            </motion.button>
          </Section>

          <Section title="Calendar">
            <motion.button
              onClick={() => setShowCalendars(true)}
              whileTap={tap}
              className="flex items-center gap-3 w-full px-4 py-3 text-left"
            >
              <span className="text-[15px] font-medium text-fg flex-1">Connected calendars</span>
              <CalendarIcon size={18} className="text-fg-muted" />
            </motion.button>
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
              <span className="text-[15px] font-medium text-fg flex-1">
                Replay the setup wizard
              </span>
              <Sparkles size={18} className="text-fg-muted" />
            </motion.button>
          </Section>
        </div>
      </BottomSheet>
      <InterestsSheet isOpen={showInterests} onClose={() => setShowInterests(false)} />
      <CalendarSheet isOpen={showCalendars} onClose={() => setShowCalendars(false)} />
    </>
  );
}
