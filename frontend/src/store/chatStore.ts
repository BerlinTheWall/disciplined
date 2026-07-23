import { create } from "zustand";

import { speakAssistant, stopSpeaking } from "@/hooks/useSpeech";
import {
  api,
  CHAT_TOOL_DOMAIN,
  type ChatMessage,
  type ChatResponse,
  type PendingAction,
} from "@/lib/api";
import { refreshEvents, refreshGoals, refreshHabits } from "@/lib/sync";

const REFRESHERS = { events: refreshEvents, habits: refreshHabits, goals: refreshGoals } as const;

// A short, whole-message affirmative — matched against the *entire* trimmed
// text, not just a prefix, so "yes but move it to 5pm" correctly falls
// through to a normal chat turn (a fresh proposal, not a stale one blindly
// confirmed) rather than being treated as approval of the old one.
const AFFIRMATIVE_RE =
  /^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|go ahead|do it|proceed|please do it|please proceed|sounds good|that's right|correct)[.! ]*$/i;

function isPendingResult(result: unknown): boolean {
  return typeof result === "object" && result !== null && "pending_confirmation" in result;
}

// Conversation state for the assistant chat sheet. Deliberately not persisted —
// a chat is a session thing; the schedule it changes is what persists.

export interface ChatBubble {
  role: "user" | "model";
  content: string;
  // Render as an error notice (failed send) rather than a normal reply.
  error?: boolean;
  // Mutating actions the assistant proposed but did NOT execute — only
  // confirmPending/cancelPending ever act on these, never anything automatic.
  pendingActions?: PendingAction[];
  // Once true, this bubble's Yes/Cancel controls are hidden (already acted on).
  resolved?: boolean;
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
  // Actually executes a proposed action (never automatic) and resolves its bubble.
  confirmPending: (index: number) => Promise<void>;
  // Discards a proposed action without running it.
  cancelPending: (index: number) => void;
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
    const msgs = get().messages;

    // "Just say yes" shortcut: only eligible while the pending proposal is
    // still the very last message — this is what decides confirmation, not
    // the model, so it either matches a real, current proposal or it
    // doesn't and falls through to a normal chat turn below.
    const last = msgs[msgs.length - 1];
    if (
      last?.role === "model" &&
      last.pendingActions?.length &&
      !last.resolved &&
      AFFIRMATIVE_RE.test(text.trim())
    ) {
      set((state) => ({ messages: [...state.messages, { role: "user", content: text }] }));
      await get().confirmPending(msgs.length - 1);
      return { reply: "", actions: [], pendingActions: [] };
    }

    const history = toHistory(msgs);
    set((state) => ({
      busy: true,
      messages: [...state.messages, { role: "user", content: text }],
    }));
    try {
      const res = await api.chat(text, history);
      set((state) => ({
        busy: false,
        messages: [
          ...state.messages,
          {
            role: "model",
            content: res.reply,
            pendingActions: res.pendingActions.length ? res.pendingActions : undefined,
          },
        ],
      }));
      // Best-effort: the chat turn itself already succeeded (the reply above
      // reflects it), so a refresh failure here shouldn't surface as a chat
      // error — it would wrongly suggest the action itself failed. Worst
      // case, the UI stays stale until the next natural refresh/reload.
      // Only genuinely-executed mutations count — every mutating tool is now
      // gated to pending_confirmation, so this is normally a no-op here and
      // only ever fires for real from confirmPending below.
      const domains = new Set(
        res.actions
          .filter((a) => !isPendingResult(a.result))
          .map((a) => CHAT_TOOL_DOMAIN[a.tool])
          .filter(Boolean)
      );
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

  confirmPending: async (index) => {
    const bubble = get().messages[index];
    if (!bubble?.pendingActions?.length || bubble.resolved) return;
    const pendingActions = bubble.pendingActions;
    set((state) => ({
      busy: true,
      messages: state.messages.map((m, i) => (i === index ? { ...m, resolved: true } : m)),
    }));
    try {
      const { ok } = await api.confirmChatActions(pendingActions);
      const domains = new Set(pendingActions.map((a) => CHAT_TOOL_DOMAIN[a.tool]).filter(Boolean));
      await Promise.all([...domains].map((d) => REFRESHERS[d]())).catch((e) =>
        console.warn("[chat] post-confirm refresh failed", e)
      );
      set((state) => ({
        busy: false,
        messages: [
          ...state.messages,
          {
            role: "model",
            content: ok ? "Done." : "Something went wrong — please check and try again.",
          },
        ],
      }));
    } catch {
      set((state) => ({
        busy: false,
        messages: [
          ...state.messages,
          { role: "model", content: "Something went wrong confirming that.", error: true },
        ],
      }));
    }
  },

  cancelPending: (index) => {
    set((state) => ({
      messages: state.messages
        .map((m, i) => (i === index ? { ...m, resolved: true } : m))
        .concat([{ role: "model", content: "Okay, cancelled." }]),
    }));
  },
}));
