import { create } from "zustand";

import {
  primeAudioChannel,
  speakAssistant,
  speakNaturalOnly,
  stopSpeaking,
  type SpeakOutcome,
} from "./useSpeech";
import { useConfirm } from "@/components/ConfirmDialog";
import { briefingLimitDialog, utcToday } from "@/lib/briefingLimit";
import { useAzureVoiceStore } from "@/store/azureVoiceStore";
import { useSettingsStore } from "@/store/settingsStore";

type ReadState = "idle" | "loading" | "reading";
type Purpose = "briefing" | "routine";

// Play/stop state for "read this aloud" buttons. The state is global — one
// voice reads at a time, and playback deliberately survives page changes and
// sheet closes (a briefing keeps talking while the user moves around the
// app). Any component using the hook sees the live state, so whichever
// speaker button is on screen can stop the current reading.
const useReadState = create<{ value: ReadState }>(() => ({ value: "idle" }));

const setRead = (value: ReadState) => useReadState.setState({ value });

// startOrStop() starts reading the given text with the assistant voice — or
// stops, when a reading is already active. `loading` covers the stretch
// between the tap and the first audible word (synthesis + network). `purpose`
// should be "briefing" when reading the day briefing (its own guaranteed
// daily allowance on the backend, see routers/tts.py) — every other caller
// leaves it as the "routine" default. Resolves the playback outcome, or null
// when it only stopped (or voice is off).
async function startOrStop(text: string, purpose: Purpose): Promise<SpeakOutcome | null> {
  if (useReadState.getState().value !== "idle") {
    stopSpeaking();
    setRead("idle");
    return null;
  }
  if (!useSettingsStore.getState().voiceEnabled) return null;
  stopSpeaking();
  // Runs in a tap — unlock audio for the playback that starts after
  // synthesis finishes, outside the mobile gesture window.
  primeAudioChannel();
  setRead("loading");
  // Briefings are long — give synthesis more room than a one-line reminder.
  return speakAssistant(
    text,
    {
      onStart: () => setRead("reading"),
      onDone: () => setRead("idle"),
      timeoutMs: 30_000,
    },
    purpose
  );
}

function stop() {
  if (useReadState.getState().value === "idle") return;
  stopSpeaking();
  setRead("idle");
}

// Gesture-less playback attempt (morning briefing). Resolves false when the
// browser blocks it — the caller then shows a tap-to-listen prompt instead.
// Deliberately never opens the limit dialog: popping one unprompted on page
// load would be worse, and the tap-to-listen prompt leads to toggle(), which
// does explain it.
async function tryAutoPlay(text: string, purpose: Purpose = "routine"): Promise<boolean> {
  if (useReadState.getState().value !== "idle") return true;
  const ok = await speakNaturalOnly(text, () => setRead("idle"), purpose);
  if (ok) setRead("reading");
  return ok;
}

export function useReadAloud() {
  const state = useReadState((s) => s.value);
  const confirm = useConfirm();

  // A tapped day summary that the backend refuses (today's one briefing
  // synthesis already spent, usually on the other voice) used to just stop
  // with no explanation. Say why, and offer the voice that will actually
  // play — switching back replays the audio already made, at no extra cost.
  async function toggle(text: string, purpose: Purpose = "routine") {
    const outcome = await startOrStop(text, purpose);
    if (outcome !== "limit") return;
    const { voice, briefingVoice, setVoice } = useAzureVoiceStore.getState();
    const usedVoice = briefingVoice?.date === utcToday() ? briefingVoice.voice : null;
    const { options, switchTo } = briefingLimitDialog(usedVoice, voice);
    if ((await confirm(options)) && switchTo) {
      setVoice(switchTo);
      // Can't loop: after the switch, usedVoice === voice, so a second limit
      // only gets the plain acknowledgment with no switch offered.
      await toggle(text, purpose);
    }
  }

  return { reading: state === "reading", loading: state === "loading", toggle, stop, tryAutoPlay };
}
