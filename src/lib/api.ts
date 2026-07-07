import { todayISODate } from "@/lib/date";
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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

// Chat tools that change the schedule server-side — when a chat turn ran any of
// these, the events store must be refreshed from the server.
export const MUTATING_CHAT_TOOLS = new Set([
  "create_event",
  "move_event",
  "delete_event",
  "swap_events",
]);

export const api = {
  events: resource<Task>("events"),
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
  health: () => request<{ status: string }>("/api/health"),
};
