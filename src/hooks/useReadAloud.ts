import { useCallback, useEffect, useRef, useState } from "react";

import { primeAudioChannel, speakAssistant, speakNaturalOnly, stopSpeaking } from "./useSpeech";

type ReadState = "idle" | "loading" | "reading";

// Play/stop state for "read this aloud" buttons. toggle() starts reading the
// given text with the assistant voice (or stops, when already active);
// `loading` covers the stretch between the tap and the first audible word
// (synthesis + network), so buttons can show a spinner instead of pretending
// to play. toggle/stop are stable, safe in effect deps.
export function useReadAloud() {
  const [state, setState] = useState<ReadState>("idle");
  const stateRef = useRef<ReadState>("idle");

  const set = (value: ReadState) => {
    stateRef.current = value;
    setState(value);
  };

  const toggle = useCallback((text: string) => {
    if (stateRef.current !== "idle") {
      stopSpeaking();
      set("idle");
      return;
    }
    stopSpeaking();
    // toggle() runs in a tap — unlock audio for the playback that starts
    // after synthesis finishes, outside the mobile gesture window.
    primeAudioChannel();
    set("loading");
    // Briefings are long — give synthesis more room than a one-line reminder
    // before falling back to the device voice.
    void speakAssistant(text, {
      onStart: () => set("reading"),
      onDone: () => set("idle"),
      timeoutMs: 30_000,
    });
  }, []);

  const stop = useCallback(() => {
    if (stateRef.current === "idle") return;
    stopSpeaking();
    set("idle");
  }, []);

  // Gesture-less playback attempt (morning briefing). Resolves false when the
  // browser blocks it — the caller then shows a tap-to-listen prompt instead.
  const tryAutoPlay = useCallback(async (text: string): Promise<boolean> => {
    if (stateRef.current !== "idle") return true;
    const ok = await speakNaturalOnly(text, () => set("idle"));
    if (ok) set("reading");
    return ok;
  }, []);

  // Cut playback off if the hosting view unmounts mid-read.
  useEffect(() => {
    return () => {
      if (stateRef.current !== "idle") stopSpeaking();
    };
  }, []);

  return { reading: state === "reading", loading: state === "loading", toggle, stop, tryAutoPlay };
}
