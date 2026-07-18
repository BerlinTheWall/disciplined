import { create } from "zustand";

import { primeAudioChannel, speakAssistant, speakNaturalOnly, stopSpeaking } from "./useSpeech";

type ReadState = "idle" | "loading" | "reading";

// Play/stop state for "read this aloud" buttons. The state is global — one
// voice reads at a time, and playback deliberately survives page changes and
// sheet closes (a briefing keeps talking while the user moves around the
// app). Any component using the hook sees the live state, so whichever
// speaker button is on screen can stop the current reading.
const useReadState = create<{ value: ReadState }>(() => ({ value: "idle" }));

const setRead = (value: ReadState) => useReadState.setState({ value });

// toggle() starts reading the given text with the assistant voice — or stops,
// when a reading is already active. `loading` covers the stretch between the
// tap and the first audible word (synthesis + network).
function toggle(text: string) {
  if (useReadState.getState().value !== "idle") {
    stopSpeaking();
    setRead("idle");
    return;
  }
  stopSpeaking();
  // toggle() runs in a tap — unlock audio for the playback that starts
  // after synthesis finishes, outside the mobile gesture window.
  primeAudioChannel();
  setRead("loading");
  // Briefings are long — give synthesis more room than a one-line reminder
  // before falling back to the device voice.
  void speakAssistant(text, {
    onStart: () => setRead("reading"),
    onDone: () => setRead("idle"),
    timeoutMs: 30_000,
  });
}

function stop() {
  if (useReadState.getState().value === "idle") return;
  stopSpeaking();
  setRead("idle");
}

// Gesture-less playback attempt (morning briefing). Resolves false when the
// browser blocks it — the caller then shows a tap-to-listen prompt instead.
async function tryAutoPlay(text: string): Promise<boolean> {
  if (useReadState.getState().value !== "idle") return true;
  const ok = await speakNaturalOnly(text, () => setRead("idle"));
  if (ok) setRead("reading");
  return ok;
}

export function useReadAloud() {
  const state = useReadState((s) => s.value);
  return { reading: state === "reading", loading: state === "loading", toggle, stop, tryAutoPlay };
}
