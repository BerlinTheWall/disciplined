import { useCallback, useEffect, useRef, useState } from "react";

import { speakAssistant, speakNaturalOnly, stopSpeaking } from "./useSpeech";

// Play/stop state for "read this aloud" buttons. toggle() starts reading the
// given text with the assistant voice (or stops, when already reading);
// `reading` drives the button's icon/label. toggle and stop are stable, so
// they're safe in effect deps. The ref mirrors `reading` so the callbacks
// never act on other audio (e.g. a reminder speaking) by mistake.
export function useReadAloud() {
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);

  const setBoth = (value: boolean) => {
    readingRef.current = value;
    setReading(value);
  };

  const toggle = useCallback((text: string) => {
    if (readingRef.current) {
      stopSpeaking();
      setBoth(false);
      return;
    }
    stopSpeaking();
    setBoth(true);
    // Briefings are long — give synthesis more room than a one-line reminder
    // before falling back to the device voice.
    void speakAssistant(text, { onDone: () => setBoth(false), timeoutMs: 30_000 });
  }, []);

  const stop = useCallback(() => {
    if (!readingRef.current) return;
    stopSpeaking();
    setBoth(false);
  }, []);

  // Gesture-less playback attempt (morning briefing). Resolves false when the
  // browser blocks it — the caller then shows a tap-to-listen prompt instead.
  const tryAutoPlay = useCallback(async (text: string): Promise<boolean> => {
    if (readingRef.current) return true;
    const ok = await speakNaturalOnly(text, () => setBoth(false));
    if (ok) setBoth(true);
    return ok;
  }, []);

  // Cut playback off if the hosting view unmounts mid-read.
  useEffect(() => {
    return () => {
      if (readingRef.current) stopSpeaking();
    };
  }, []);

  return { reading, toggle, stop, tryAutoPlay };
}
