import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Mic, Sparkles, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useScrollLock } from "@/hooks/useScrollLock";
import { speak, stopSpeaking, useSpeechRecognition } from "@/hooks/useSpeech";
import { spring, tap } from "@/lib/motion";
import { useChatStore, type ChatBubble } from "@/store/chatStore";

// Bottom sheet showing the assistant conversation. Opened by the schedule
// quick-add bar when a message is sent; has its own input for follow-ups.

function Bubble({ message }: { message: ChatBubble }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.snappy}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
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
  const [isOpen, busy, messages, closeChat, clearChat, send] = useChatStore(
    useShallow((state) => [
      state.isOpen,
      state.busy,
      state.messages,
      state.closeChat,
      state.clearChat,
      state.send,
    ])
  );
  useScrollLock(isOpen);

  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Voice input: live transcript shows in the input; a finished utterance is
  // sent right away, and the reply to a spoken message is read aloud.
  const {
    supported: voiceSupported,
    listening,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onInterim: setText,
    onFinal: (transcript) => {
      setText("");
      void send(transcript)
        .then((res) => speak(res.reply))
        .catch(() => {});
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw || busy) return;
    setText("");
    // Errors already surface as a bubble in the thread.
    await send(raw).catch(() => {});
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeChat}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface-alt rounded-t-2xl z-50 shadow-xl flex flex-col max-h-[75vh]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
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
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-2 min-h-32"
            >
              {messages.length === 0 && !busy && (
                <p className="text-sm text-fg-faint text-center py-6">
                  Ask about your schedule, or tell me what to change —{" "}
                  &ldquo;add a meeting tomorrow&rdquo;, &ldquo;what&rsquo;s on friday?&rdquo;
                </p>
              )}
              {messages.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
              {busy && <TypingDots />}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 bg-surface rounded-full pl-4 pr-1.5 py-1.5 mx-4 mb-4 mt-1"
            >
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={listening ? "Listening…" : "Message the assistant…"}
                className="flex-1 min-w-0 bg-transparent text-base text-fg placeholder-fg-faint focus:outline-none"
              />
              {voiceSupported && (
                <motion.button
                  type="button"
                  onClick={listening ? stopListening : startListening}
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
