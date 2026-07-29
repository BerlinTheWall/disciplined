import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, X } from "lucide-react";

import { primeAudioChannel, stopSpeaking, useSpeechRecognition } from "@/hooks/useSpeech";
import { spring, tap } from "@/lib/motion";
import { useChatStore } from "@/store/chatStore";

// Global push-to-talk: a mic that floats above the bottom nav on every page.
// Tap, speak ("move gym to 6", "what's tomorrow?"), and a finished utterance
// opens the chat sheet and is sent through it — the sheet shows the
// transcript, a typing indicator, and the reply (and speaks it), so this
// floating pill only needs to cover the moment before that: listening, and
// recognition failures the sheet never gets a chance to display. Hidden
// entirely on browsers without speech recognition.

type Phase = "idle" | "listening" | "error";

export default function VoiceAssistant() {
  const send = useChatStore((s) => s.send);
  const [phase, setPhase] = useState<Phase>("idle");
  // What the card shows: live transcript while listening, an error message otherwise.
  const [text, setText] = useState("");
  const dismissTimer = useRef<number | null>(null);

  function clearDismiss() {
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
  }

  function scheduleDismiss(ms: number) {
    clearDismiss();
    dismissTimer.current = window.setTimeout(() => setPhase("idle"), ms);
  }

  function handleFinal(transcript: string) {
    // Hand off to the chat sheet — it takes it from here (thread, reply,
    // speech), so this pill's job for a successful utterance ends here.
    setPhase("idle");
    useChatStore.getState().openChat();
    void send(transcript).catch(() => {});
  }

  const { supported, listening, start, stop } = useSpeechRecognition({
    onInterim: setText,
    onFinal: handleFinal,
    // Recognition failures happen before the chat sheet is ever involved, so
    // they still get a short, plain explanation in this status card.
    onError: (message) => {
      setPhase("error");
      setText(message);
      scheduleDismiss(8_000);
    },
  });

  function onMicTap() {
    if (listening) {
      stop();
      if (phase === "listening") setPhase("idle");
      return;
    }
    clearDismiss();
    stopSpeaking();
    // Unlock audio playback while we're inside the tap — the reply that needs
    // it arrives seconds from now, past the mobile gesture window.
    primeAudioChannel();
    setText("");
    setPhase("listening");
    start();
  }

  function dismiss() {
    clearDismiss();
    setPhase("idle");
  }

  if (!supported) return null;

  return (
    <>
      {/* Status card, floating above the nav pill */}
      <AnimatePresence>
        {phase !== "idle" && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={spring.snappy}
            className="fixed left-4 right-4 z-30"
            style={{ bottom: "calc(92px + var(--nav-bottom))" }}
          >
            <div className="flex items-start gap-3 bg-surface rounded-2xl shadow-xl border border-border-strong px-4 py-3">
              <span className="w-8 h-8 rounded-full bg-[#a78bfa] text-[#111827] flex items-center justify-center shrink-0">
                <Mic size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-fg-faint">
                  {phase === "listening" ? "Listening…" : "That didn't work"}
                </p>
                <p className="text-sm text-fg mt-0.5 whitespace-pre-wrap break-words">
                  {text || (phase === "listening" ? "Say something like “Add a task ...”" : "")}
                </p>
              </div>
              <motion.button
                onClick={dismiss}
                whileTap={tap}
                aria-label="Dismiss"
                className="p-1.5 -m-1 text-fg-faint shrink-0"
              >
                <X size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The mic — its own circle beside the nav pill, not a fourth tab */}
      <motion.button
        onClick={onMicTap}
        data-tour="mic"
        whileTap={tap}
        aria-label={listening ? "Stop listening" : "Talk to the assistant"}
        className={`fixed right-4 z-30 w-16 h-16 rounded-full shadow-xl flex items-center justify-center border ${
          listening
            ? "bg-[#f87171] text-white border-transparent"
            : "bg-surface text-fg border-border-strong"
        }`}
        style={{ bottom: "calc(2px + var(--nav-bottom))" }}
      >
        {listening ? (
          <motion.span
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="flex"
          >
            <Mic size={24} />
          </motion.span>
        ) : (
          <Mic size={24} />
        )}
      </motion.button>
    </>
  );
}
