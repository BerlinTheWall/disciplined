import { todayISODate } from "@/lib/date";
import type { Goal } from "@/types/goals";
import type { Habit } from "@/types/habits";
import type { Meal } from "@/types/meal";
import type { Task } from "@/types/task";
import type { WorkoutSession } from "@/types/workout";

// The backend speaks the same camelCase shapes as the types in src/types/.
// 127.0.0.1 rather than "localhost": uvicorn binds IPv4 only, and resolving
// localhost (possibly to ::1) is a known source of flaky fetches on Windows.
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// The API returns null for absent optional fields; the frontend types use
// undefined. Drop nulls so hydrated items match locally created ones.
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return value;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Login token, kept as a plain localStorage entry (not in a zustand store) so
// it is readable here without importing any store and before stores hydrate.
const TOKEN_KEY = "disciplined-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  // An expired/revoked token means every call will fail — tell the app shell
  // to log out. A 401 from the auth endpoints is just wrong credentials.
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    window.dispatchEvent(new Event("api-unauthorized"));
  }
  if (!res.ok) {
    let detail = `${init?.method ?? "GET"} ${path} failed with ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // no JSON body — keep the generic message
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return stripNulls(await res.json()) as T;
}

export interface ApiResource<T extends { id: string }> {
  list: () => Promise<T[]>;
  create: (item: T) => Promise<T>;
  update: (item: T) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

function resource<T extends { id: string }>(name: string): ApiResource<T> {
  return {
    list: () => request<T[]>(`/api/${name}`),
    create: (item) => request<T>(`/api/${name}`, { method: "POST", body: JSON.stringify(item) }),
    update: (item) =>
      request<T>(`/api/${name}/${item.id}`, { method: "PATCH", body: JSON.stringify(item) }),
    remove: (id) => request<void>(`/api/${name}/${id}`, { method: "DELETE" }),
  };
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatAction {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ChatResponse {
  reply: string;
  actions: ChatAction[];
}

export interface BriefingItemPayload {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  completed: boolean;
  kind: "task" | "habit";
}

export interface BriefingPayload {
  dayLabel: string;
  name: string;
  items: BriefingItemPayload[];
  streaks: { title: string; days: number }[];
  // Current clock time (minutes from midnight), only when briefing today —
  // lets the script call out passed-but-undone items instead of guessing.
  nowMinutes?: number;
}

// Chat tools that change the schedule server-side — when a chat turn ran any of
// these, the events store must be refreshed from the server.
export const MUTATING_CHAT_TOOLS = new Set([
  "create_event",
  "move_event",
  "delete_event",
  "swap_events",
]);

export const api = {
  auth: {
    register: (email: string, password: string, displayName: string): Promise<AuthResponse> =>
      request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      }),
    login: (email: string, password: string): Promise<AuthResponse> =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: (): Promise<AuthUser> => request("/api/auth/me"),
  },
  events: resource<Task>("events"),
  goals: resource<Goal>("goals"),
  habits: resource<Habit>("habits"),
  workouts: resource<WorkoutSession>("workouts"),
  meals: resource<Meal>("meals"),
  // clientDate: the user's local calendar date, so "today"/"tomorrow" resolve
  // against the user's clock even when the server runs in another timezone.
  chat: (message: string, history: ChatMessage[]): Promise<ChatResponse> =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, clientDate: todayISODate() }),
    }),
  // LLM-written spoken briefing for a day's schedule.
  briefing: (payload: BriefingPayload): Promise<{ script: string }> =>
    request("/api/briefing", { method: "POST", body: JSON.stringify(payload) }),
  // Natural-voice audio (WAV) for a spoken line. Binary, so it bypasses the
  // JSON `request` helper; callers treat any failure as "fall back to the
  // device voice". The abort keeps a slow server from stalling a reminder —
  // longer, user-initiated reads (day briefings) pass a more patient timeout,
  // since synthesis time grows with text length.
  tts: async (text: string, timeoutMs = 10_000): Promise<Blob> => {
    const token = getToken();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new ApiError(res.status, "text-to-speech failed");
      return await res.blob();
    } finally {
      window.clearTimeout(timeout);
    }
  },
  health: () => request<{ status: string }>("/api/health"),
};
