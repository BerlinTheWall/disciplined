import { create } from "zustand";

import { api, MUTATING_CHAT_TOOLS, type ChatMessage, type ChatResponse } from "@/lib/api";
import { refreshEvents } from "@/lib/sync";

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
      if (res.actions.some((a) => MUTATING_CHAT_TOOLS.has(a.tool))) await refreshEvents();
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
