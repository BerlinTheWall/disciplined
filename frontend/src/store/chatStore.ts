import { create } from "zustand";

import { speakAssistant, stopSpeaking } from "@/hooks/useSpeech";
import { api, CHAT_TOOL_DOMAIN, type ChatMessage, type ChatResponse } from "@/lib/api";
import { refreshEvents, refreshGoals, refreshHabits } from "@/lib/sync";

const REFRESHERS = { events: refreshEvents, habits: refreshHabits, goals: refreshGoals } as const;

// Conversation state for the assistant chat sheet. Deliberately not persisted —
// a chat is a session thing; the schedule it changes is what persists.

export interface ChatBubble {
  role: "user" | "model";
  content: string;
  // Render as an error notice (failed send) rather than a normal reply.
  error?: boolean;
}

interface State {
  isOpen: boolean;
  busy: boolean;
  messages: ChatBubble[];
}

interface Actions {
  openChat: () => void;
  closeChat: () => void;
  clearChat: () => void;
  // Sends `text` to the assistant and appends the exchange to the thread.
  // Throws on failure (after appending an error bubble) so callers can run
  // their own fallback.
  send: (text: string) => Promise<ChatResponse>;
}

// Only real exchanges go back to Gemini as context, capped to keep requests small.
function toHistory(messages: ChatBubble[]): ChatMessage[] {
  return messages
    .filter((m) => !m.error)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));
}

export const useChatStore = create<State & Actions>()((set, get) => ({
  isOpen: false,
  busy: false,
  messages: [],

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  clearChat: () => set({ messages: [] }),

  send: async (text) => {
    const history = toHistory(get().messages);
    set((state) => ({
      busy: true,
      messages: [...state.messages, { role: "user", content: text }],
    }));
    try {
      const res = await api.chat(text, history);
      set((state) => ({
        busy: false,
        messages: [...state.messages, { role: "model", content: res.reply }],
      }));
      // Best-effort: the chat turn itself already succeeded (the reply above
      // reflects it), so a refresh failure here shouldn't surface as a chat
      // error — it would wrongly suggest the action itself failed. Worst
      // case, the UI stays stale until the next natural refresh/reload.
      const domains = new Set(res.actions.map((a) => CHAT_TOOL_DOMAIN[a.tool]).filter(Boolean));
      await Promise.all([...domains].map((d) => REFRESHERS[d]())).catch((e) =>
        console.warn("[chat] post-action refresh failed", e)
      );
      // The assistant always says its reply out loud — typed or spoken input
      // alike. A new reply cuts off whatever was still being read.
      stopSpeaking();
      void speakAssistant(res.reply);
      return res;
    } catch (e) {
      set((state) => ({
        busy: false,
        messages: [
          ...state.messages,
          {
            role: "model",
            content: e instanceof Error ? e.message : "Something went wrong — please try again.",
            error: true,
          },
        ],
      }));
      throw e;
    }
  },
}));
