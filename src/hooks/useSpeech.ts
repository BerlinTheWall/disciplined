import { useEffect, useRef, useState } from "react";

// Browser-native voice: SpeechRecognition (speech-to-text) and speechSynthesis
// (text-to-speech). Both are free and on-device/OS-provided — no backend.
// SpeechRecognition is missing from TypeScript's DOM lib, so the minimal
// surface we use is declared here. Chrome/Edge/Safari support it (Safari via
// the webkit prefix); Firefox doesn't, so callers must respect `supported`.

interface SRAlternative {
  transcript: string;
}

interface SRResult {
  isFinal: boolean;
  [index: number]: SRAlternative;
}

interface SREvent {
  results: { length: number; [index: number]: SRResult };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SRConstructor = new () => SpeechRecognitionLike;

const SpeechRecognitionCtor: SRConstructor | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor })
        .SpeechRecognition ??
      (window as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition);

export const speechInputSupported = Boolean(SpeechRecognitionCtor);

interface SpeechHandlers {
  // Live partial transcript while the user is still talking.
  onInterim?: (text: string) => void;
  // The finished utterance.
  onFinal: (text: string) => void;
}

export function useSpeechRecognition(handlers: SpeechHandlers) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest handlers without re-creating the recognizer.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  function start() {
    if (!SpeechRecognitionCtor || recRef.current) return;
    stopSpeaking(); // don't transcribe our own text-to-speech
    const rec = new SpeechRecognitionCtor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false; // one utterance per tap
    rec.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final.trim()) handlersRef.current.onFinal(final.trim());
      else if (interim) handlersRef.current.onInterim?.(interim);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      // "no-speech", "not-allowed", … — onend fires right after and cleans up.
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
  }

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: speechInputSupported, listening, start, stop };
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = navigator.language || "en-US";
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
