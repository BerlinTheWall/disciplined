import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Loader2, Mic, Sparkles, Square, Trash2, Volume2, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useReadAloud } from "@/hooks/useReadAloud";
import {
  primeAudioChannel,
  stopSpeaking,
  useSpeechRecognition,
  useSpeechState,
} from "@/hooks/useSpeech";
import { spring, tap } from "@/lib/motion";
import { describePendingAction } from "@/lib/pendingAction";
import { useChatStore, type ChatBubble } from "@/store/chatStore";
import { useGoalStore } from "@/store/goalStore";
import { useHabitStore } from "@/store/habitStore";
import { useTaskStore } from "@/store/taskStore";
import BottomSheet from "../BottomSheet";

// Bottom sheet showing the assistant conversation. Opened by the schedule
// quick-add bar when a message is sent; has its own input for follow-ups.

function Bubble({
  message,
  isSpeaking,
  isPreparingSpeech,
  onToggleSpeak,
  onConfirm,
  onCancel,
}: {
  message: ChatBubble;
  isSpeaking: boolean;
  isPreparingSpeech: boolean;
  onToggleSpeak: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tasks = useTaskStore((s) => s.tasks);
  const habits = useHabitStore((s) => s.habits);
  const goals = useGoalStore((s) => s.goals);
  const isUser = message.role === "user";
  const showActions = !isUser && message.pendingActions?.length && !message.resolved;
  const showSpeakButton = !isUser && !message.error;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.snappy}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div className="flex items-end gap-1.5">
        <p
          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
            isUser
              ? "bg-surface-inverse text-fg-inverse rounded-br-md"
              : message.error
                ? "bg-surface text-[#b07a85] rounded-bl-md"
                : "bg-surface text-fg rounded-bl-md"
          }`}
        >
          {message.content}
        </p>
        {showSpeakButton && (
          <motion.button
            onClick={onToggleSpeak}
            whileTap={tap}
            aria-label={isSpeaking ? "Stop reading aloud" : "Read aloud"}
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5 ${
              isSpeaking ? "bg-fg text-fg-inverse" : "bg-surface-raised text-fg-faint"
            }`}
          >
            {isPreparingSpeech ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="flex"
              >
                <Loader2 size={13} />
              </motion.span>
            ) : isSpeaking ? (
              <Square size={11} />
            ) : (
              <Volume2 size={13} />
            )}
          </motion.button>
        )}
      </div>
      {showActions && (
        <div className="max-w-[80%] mt-1.5 rounded-xl border border-fg/10 bg-surface-raised px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint mb-1">
            This will run exactly as follows
          </p>
          {message.pendingActions!.map((action, i) => (
            <p key={i} className="text-[13px] text-fg">
              {describePendingAction(action, { tasks, habits, goals })}
            </p>
          ))}
        </div>
      )}
      {showActions && (
        <div className="flex gap-2 mt-1.5">
          <motion.button
            onClick={onConfirm}
            whileTap={tap}
            className="h-8 px-4 rounded-full bg-fg text-fg-inverse text-[13px] font-semibold"
          >
            Yes
          </motion.button>
          <motion.button
            onClick={onCancel}
            whileTap={tap}
            className="h-8 px-4 rounded-full bg-surface-raised text-fg text-[13px] font-medium"
          >
            Cancel
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-surface rounded-2xl rounded-bl-md px-3.5 py-3 flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-fg-faint"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatSheet() {
  const [isOpen, busy, messages, closeChat, clearChat, send, confirmPending, cancelPending] =
    useChatStore(
      useShallow((state) => [
        state.isOpen,
        state.busy,
        state.messages,
        state.closeChat,
        state.clearChat,
        state.send,
        state.confirmPending,
        state.cancelPending,
      ])
    );

  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Grow the input with its content (wrapping instead of scrolling sideways)
  // up to a cap, past which it scrolls internally. Re-measures on every
  // keystroke and on live voice transcript updates, since both flow through
  // `text`.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  // Keep the typing dots up while the spoken reply is still being prepared,
  // so there's a visible loader until the assistant is heard.
  const voicePending = useSpeechState((s) => s.pending);

  // Per-message "read aloud" button. useReadAloud is a single global
  // play/stop state (one voice at a time, same as the Home briefing button),
  // so which bubble owns it is tracked here. Every read of speakingIndex
  // below is ANDed with reading/loading, so a stale index once playback goes
  // idle (naturally finishing, or being stopped some other way) is harmless —
  // no separate effect needed to reset it.
  const {
    reading,
    loading: speechLoading,
    toggle: toggleReadAloud,
    stop: stopReadAloud,
  } = useReadAloud();
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  function handleToggleSpeak(index: number, content: string) {
    // toggleReadAloud() itself just stops when something's already playing —
    // it never switches straight to new text — so mirror that here: only
    // claim this bubble as the active one when we're the one starting it.
    const wasActive = reading || speechLoading;
    toggleReadAloud(content);
    setSpeakingIndex(wasActive ? null : index);
  }

  // Voice input: live transcript shows in the input; a finished utterance is
  // sent right away. The reply is spoken by the chat store itself.
  const {
    supported: voiceSupported,
    listening,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onInterim: setText,
    onFinal: (transcript) => {
      setText("");
      const raw = transcript.trim();
      if (!raw) return; // misfire (silence/noise) — nothing was actually said
      void send(raw).catch(() => {});
    },
  });

  // Keep the newest message in view.
  useEffect(() => {
    if (isOpen) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [isOpen, messages.length, busy]);

  // Closing the sheet ends any listening/talking in progress.
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopSpeaking();
      stopReadAloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function submitMessage() {
    const raw = text.trim();
    if (!raw || busy) return;
    setText("");
    // Unlock audio during the submit gesture so the spoken reply (arriving
    // after the network round trip) is allowed to play on mobile.
    primeAudioChannel();
    // Errors already surface as a bubble in the thread.
    await send(raw).catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitMessage();
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={closeChat}
      className="bg-surface-alt flex flex-col max-h-[75vh]"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#a78bfa] text-[#111827]">
          <Sparkles size={15} />
        </span>
        <h2 className="text-base font-bold text-fg flex-1">Assistant</h2>
        {messages.length > 0 && (
          <motion.button
            onClick={clearChat}
            whileTap={tap}
            aria-label="Clear conversation"
            className="p-2 text-fg-faint"
          >
            <Trash2 size={18} />
          </motion.button>
        )}
        <motion.button
          onClick={closeChat}
          whileTap={tap}
          aria-label="Close"
          className="p-2 -mr-2 text-fg-faint"
        >
          <X size={20} />
        </motion.button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-2 min-h-32">
        {messages.length === 0 && !busy && (
          <p className="text-sm text-fg-faint text-center py-6">
            Ask about your schedule, or tell me what to change —{" "}
            &ldquo;add a meeting tomorrow&rdquo;, &ldquo;what&rsquo;s on friday?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <Bubble
            key={i}
            message={m}
            isSpeaking={speakingIndex === i && reading}
            isPreparingSpeech={speakingIndex === i && speechLoading}
            onToggleSpeak={() => handleToggleSpeak(i, m.content)}
            onConfirm={() => void confirmPending(i)}
            onCancel={() => cancelPending(i)}
          />
        ))}
        {(busy || (isOpen && voicePending)) && <TypingDots />}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 bg-surface rounded-3xl pl-4 pr-1.5 py-1.5 mx-4 mb-4 mt-1"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter (or any IME composition) inserts a
            // newline instead, same as every other chat input.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submitMessage();
            }
          }}
          placeholder={listening ? "Listening…" : "Message the assistant…"}
          className="flex-1 min-w-0 bg-transparent text-base text-fg placeholder-fg-faint focus:outline-none resize-none leading-6 py-1 max-h-36 overflow-y-auto"
        />
        {voiceSupported && (
          <motion.button
            type="button"
            onClick={() => {
              if (listening) {
                stopListening();
                return;
              }
              primeAudioChannel();
              startListening();
            }}
            whileTap={tap}
            aria-label={listening ? "Stop listening" : "Speak"}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              listening ? "bg-[#f87171] text-white" : "text-fg-faint"
            }`}
          >
            {listening ? (
              <motion.span
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="flex"
              >
                <Mic size={16} />
              </motion.span>
            ) : (
              <Mic size={16} />
            )}
          </motion.button>
        )}
        <motion.button
          type="submit"
          disabled={busy || !text.trim()}
          whileTap={tap}
          aria-label="Send"
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-surface-inverse text-fg-inverse disabled:opacity-40"
        >
          <ArrowUp size={16} />
        </motion.button>
      </form>
    </BottomSheet>
  );
}
