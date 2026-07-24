import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, Sparkles, X } from "lucide-react";

import {
  primeAudioChannel,
  speakAssistant,
  stopSpeaking,
  useSpeechRecognition,
  useSpeechState,
} from "@/hooks/useSpeech";
import { spring, tap } from "@/lib/motion";
import { useChatStore } from "@/store/chatStore";

// Global push-to-talk: a mic that floats above the bottom nav on every page.
// Tap, speak ("move gym to 6", "what's tomorrow?"), and the utterance goes to
// the chat assistant — which can change the schedule through its tools — with
// the reply spoken back in the assistant voice. The exchange also lands in the
// chat sheet's history, so a follow-up can continue there. Hidden entirely on
// browsers without speech recognition.

type Phase = "idle" | "listening" | "thinking" | "reply" | "error";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  listening: "Listening…",
  thinking: "On it…",
  reply: "Assistant",
  error: "That didn't work",
};

export default function VoiceAssistant() {
  const send = useChatStore((s) => s.send);
  // Voice synthesis still in flight — keep the spinner up after the reply
  // text arrives, until the assistant is actually heard.
  const voicePending = useSpeechState((s) => s.pending);
  const [phase, setPhase] = useState<Phase>("idle");
  // What the card shows: live transcript while listening, then the reply.
  const [text, setText] = useState("");
  const dismissTimer = useRef<number | null>(null);

  function clearDismiss() {
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
  }

  function scheduleDismiss(ms: number) {
    clearDismiss();
    dismissTimer.current = window.setTimeout(() => setPhase("idle"), ms);
  }

  async function handleFinal(transcript: string) {
    setPhase("thinking");
    setText(transcript);
    try {
      const res = await send(transcript);
      setPhase("reply");
      setText(res.reply);
      // The chat store speaks the reply; keep the card up roughly as long as
      // the reading takes, then a beat longer.
      scheduleDismiss(Math.min(4_000 + res.reply.length * 60, 25_000));
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : "I couldn't reach the assistant — try again in a moment.";
      setPhase("error");
      setText(message);
      void speakAssistant(message);
      scheduleDismiss(8_000);
    }
  }

  const { supported, listening, start, stop } = useSpeechRecognition({
    onInterim: setText,
    onFinal: (transcript) => void handleFinal(transcript),
    // Voice failures show a short, plain explanation in the status card.
    onError: (message) => {
      setPhase("error");
      setText(message);
      scheduleDismiss(12_000);
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
    useChatStore.getState().openChat();
    setText("");
    setPhase("listening");
    start();
  }

  function dismiss() {
    clearDismiss();
    stopSpeaking();
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
                {phase === "thinking" || (phase === "reply" && voicePending) ? (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="flex"
                  >
                    <Loader2 size={15} />
                  </motion.span>
                ) : (
                  <Sparkles size={15} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-fg-faint">{PHASE_LABEL[phase]}</p>
                <p className="text-sm text-fg mt-0.5 whitespace-pre-wrap break-words">
                  {text || (phase === "listening" ? "Say something like “move gym to 6”" : "")}
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
