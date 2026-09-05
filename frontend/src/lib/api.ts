import { todayISODate } from "@/lib/date";
import { getToken, setToken } from "@/lib/tokenStorage";
import type { Goal } from "@/types/goals";
import type { Habit } from "@/types/habits";
import type { Interest } from "@/types/interest";
import type { Task } from "@/types/task";

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

// FastAPI's own error shape (`detail: string`, e.g. our HTTPExceptions) vs.
// its 422 validation-error shape (`detail: [{ msg, loc, ... }]`, straight
// from Pydantic) are different — the plain-string branch was the only one
// handled, so any request Pydantic itself rejected (a malformed email, a
// too-short field, ...) fell through to the generic "METHOD /path failed
// with 422" fallback instead of the field's actual complaint.
function errorMessageFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (first && typeof first.msg === "string") {
      // Pydantic's email-validator message is "value is not a valid email
      // address: <specific reason>" — the reason after the colon is the
      // actually useful part; everything else just needs capitalizing.
      const email = first.msg.match(/^value is not a valid email address:\s*(.+)$/i);
      const msg = (email ? email[1] : first.msg).replace(/^Value error,\s*/i, "");
      return msg.charAt(0).toUpperCase() + msg.slice(1);
    }
  }
  return null;
}

// Login token — Keychain/Keystore-backed on iOS/Android, localStorage on web.
// See lib/tokenStorage.ts for why (not a store: readable here without
// importing one, and before stores hydrate). Re-exported so existing callers
// (authStore.ts) don't need to know it moved.
export { getToken, setToken };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...init,
    });
  } catch {
    // fetch only rejects when no HTTP response ever came back at all — no
    // connection, DNS failure, the backend isn't running, CORS block, etc.
    // navigator.onLine distinguishes "you have no connection" from "you're
    // online but the backend specifically is unreachable" (status 0 marks
    // this as neither a real 2xx/4xx/5xx — never confuse it with one).
    throw new ApiError(
      0,
      navigator.onLine
        ? "Can't reach the server right now. Please try again in a moment."
        : "You're offline. Check your connection and try again."
    );
  }
  // An expired/revoked token means every call will fail — tell the app shell
  // to log out. A 401 from the auth endpoints is just wrong credentials.
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    window.dispatchEvent(new Event("api-unauthorized"));
  }
  if (!res.ok) {
    // A response that arrived but wasn't ours (e.g. a proxy's plain HTML
    // error page) leaves no detail to parse — 5xx there means the server is
    // actually broken, not that the request itself was invalid.
    let detail =
      res.status >= 500
        ? "Something went wrong on our end. Please try again in a moment."
        : `Request failed (${res.status}).`;
    try {
      detail = errorMessageFromBody(await res.json()) ?? detail;
    } catch {
      // no JSON body — keep the status-based fallback
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
  firstName: string;
  lastName: string;
  displayName: string;
  emailVerified: boolean;
  timezone?: string;
  segment?: UserSegment;
}

// Self-reported during onboarding — picks which fake-week demo is shown
// (see components/onboarding/FakeWeekPreview.tsx) and doubles as a
// segmentation signal.
export type UserSegment = "student" | "professional" | "manager" | "parent";

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface MessageResponse {
  message: string;
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

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
}

export interface ChatResponse {
  reply: string;
  actions: ChatAction[];
  pendingActions: PendingAction[];
}

export interface ConfirmActionsResponse {
  results: unknown[];
  ok: boolean;
}

export type WeekPlanTimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface WeekPlanPreference {
  kind: "interest" | "goal";
  id: string;
  title: string;
  timesPerWeek: number;
  timeOfDay: WeekPlanTimeOfDay;
}

export interface WeekPlanResponse {
  message: string;
  pendingActions: PendingAction[];
}

// AI-suggested milestones for a goal (see backend/app/services/goal_milestones.py).
// Read-only — nothing is written server-side; the caller applies whatever's
// accepted through the normal goalStore actions.
export interface MilestoneSuggestion {
  label: string;
  weight?: number;
}

export interface MilestoneSuggestResponse {
  milestones: MilestoneSuggestion[];
}

// AI-drafted description for a goal (see
// backend/app/services/goal_description.py). Read-only — the caller keeps
// whatever it accepts through the normal goal create/update calls.
export interface GoalDescriptionResponse {
  description: string;
}

// AI-proposed calendar sessions for a goal's milestones (see
// backend/app/services/goal_schedule.py) — a separate, narrower feature
// from chat. Returns proposals only; nothing is created until they're sent
// to confirmChatActions, exactly like a chat-proposed action, then linked
// to their milestone locally (see goalStore's linkTasksToMilestones).
export interface MilestoneWindow {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface ScheduledTaskProposal {
  milestoneId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface GoalScheduleResponse {
  message: string;
  proposals: ScheduledTaskProposal[];
}

// ---- Outlook connection (Microsoft Graph OAuth) ----
// Reads/writes the user's Outlook calendar directly via Microsoft Graph,
// regardless of whether the account is synced into the phone's own calendar
// app. Two-way: see backend/app/services/outlook_graph.py's
// reconcile_outlook_events.

export interface OutlookStatus {
  connected: boolean;
  msAccountEmail?: string;
}

// Shared shape for both Outlook and Google's reconcile result — matches
// backend/app/schemas.py's ReconcileResponse.
export interface ReconcileResult {
  createdLocal: number;
  createdRemote: number;
  updatedLocal: number;
  updatedRemote: number;
  deletedLocal: number;
  recreatedRemote: number;
  unchanged: number;
  failed: number;
}

// ---- Google Calendar connection (Google OAuth) ----
// Same shape as Outlook above, mirrored rather than shared — see
// backend/app/services/google_calendar.py for why.

export interface GoogleCalendarStatus {
  connected: boolean;
  googleAccountEmail?: string;
}

export interface BriefingItemPayload {
  title: string;
  startMinutes: number;
  durationMinutes: number;
  completed: boolean;
  kind: "task" | "habit";
}

export interface NudgeSuggestedSlot {
  date: string;
  startMinutes: number;
  durationMinutes: number;
}

export type NudgeType =
  | "habit_gap"
  | "goal_pacing"
  | "streak_milestone"
  | "goal_ahead"
  | "streak_risk_today"
  | "habit_event_conflict"
  | "tasks_overdue"
  | "habit_weekday_pattern"
  | "interest_gap"
  | "interest_not_started";

export interface NudgeResponse {
  type: NudgeType | null;
  subjectId: string | null;
  message: string | null;
  actionPhrase: string | null;
  suggestedSlot: NudgeSuggestedSlot | null;
  // The literal {tool, args} a "Yes" tap executes directly via
  // confirmChatActions — bypasses Gemini entirely, so approving it can never
  // be misinterpreted.
  pendingAction: PendingAction | null;
}

export interface CoachWindow {
  label: string;
  startMinutes: number;
  endMinutes: number;
}

export interface CoachCheckpoint {
  windowLabel: string;
  fireAtMinutes: number;
  title: string;
  body: string;
  actionPhrase: string | null;
  pendingAction: PendingAction | null;
  subjectKey: string;
}

export interface CoachPlanResponse {
  checkpoints: CoachCheckpoint[];
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

// Chat tools that change data server-side, mapped to the store domain that
// needs refreshing from the server after a chat turn ran them.
export const CHAT_TOOL_DOMAIN: Record<string, "events" | "habits" | "goals"> = {
  create_event: "events",
  move_event: "events",
  delete_event: "events",
  swap_events: "events",
  set_event_completion: "events",
  set_habit_completion: "habits",
  create_habit: "habits",
  update_habit: "habits",
  delete_habit: "habits",
  add_goal_progress: "goals",
  set_goal_done: "goals",
};

export const api = {
  auth: {
    // No token back — the account isn't usable (including logging in) until
    // the code this sends is confirmed via verifyEmail below.
    register: (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      timezone?: string
    ): Promise<MessageResponse> =>
      request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, firstName, lastName, timezone }),
      }),
    login: (email: string, password: string): Promise<AuthResponse> =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: (): Promise<AuthUser> => request("/api/auth/me"),
    // Invalidates every access token issued before this call, including the
    // one used to make it — the server reissues a fresh one (returned here)
    // so this device stays signed in while every other one is logged out on
    // its next request. See backend/app/routers/auth.py's logout_everywhere.
    logoutEverywhere: (): Promise<AuthResponse> =>
      request("/api/auth/logout-everywhere", { method: "POST" }),
    // Public (email + code, not the bearer token) — this is the only way in
    // for an unverified account, so it can't require the session it grants.
    verifyEmail: (email: string, code: string): Promise<AuthResponse> =>
      request("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),
    resendVerification: (email: string): Promise<MessageResponse> =>
      request("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email: string): Promise<MessageResponse> =>
      request("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (email: string, code: string, newPassword: string): Promise<AuthResponse> =>
      request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword }),
      }),
    updateTimezone: (timezone: string): Promise<AuthUser> =>
      request("/api/auth/timezone", { method: "PATCH", body: JSON.stringify({ timezone }) }),
    updateSegment: (segment: UserSegment): Promise<AuthUser> =>
      request("/api/auth/segment", { method: "PATCH", body: JSON.stringify({ segment }) }),
    updateDisplayName: (displayName: string): Promise<AuthUser> =>
      request("/api/auth/display-name", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      }),
  },
  events: resource<Task>("events"),
  goals: resource<Goal>("goals"),
  habits: resource<Habit>("habits"),
  // Hand-rolled rather than resource<Interest>(): there's nothing to PATCH,
  // just create-or-remove.
  interests: {
    list: () => request<Interest[]>("/api/interests"),
    create: (item: Interest) =>
      request<Interest>("/api/interests", { method: "POST", body: JSON.stringify(item) }),
    remove: (id: string) => request<void>(`/api/interests/${id}`, { method: "DELETE" }),
  },
  // clientDate: the user's local calendar date, so "today"/"tomorrow" resolve
  // against the user's clock even when the server runs in another timezone.
  chat: (message: string, history: ChatMessage[]): Promise<ChatResponse> =>
    request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, clientDate: todayISODate() }),
    }),
  // The only path that actually executes a mutating action the assistant
  // proposed — never called automatically, only on explicit user confirmation.
  confirmChatActions: (actions: PendingAction[]): Promise<ConfirmActionsResponse> =>
    request("/api/chat/confirm", { method: "POST", body: JSON.stringify({ actions }) }),
  // LLM-written spoken briefing for a day's schedule.
  briefing: (payload: BriefingPayload): Promise<{ script: string }> =>
    request("/api/briefing", { method: "POST", body: JSON.stringify(payload) }),
  nudges: {
    // Deterministic check for something worth proactively surfacing;
    // excludedKeys are the client's own active dismissal cooldowns.
    check: (nowMinutes: number | undefined, excludedKeys: string[]): Promise<NudgeResponse> =>
      request("/api/nudges/check", {
        method: "POST",
        body: JSON.stringify({ nowMinutes, excludedKeys, clientDate: todayISODate() }),
      }),
  },
  // Drafts a week's worth of proposed events from the user's goals — a
  // separate, narrower feature from chat (see backend/app/services/week_plan.py).
  // Returns pendingActions only; nothing is created until they're passed to
  // confirmChatActions above, exactly like a chat-proposed action.
  weekPlan: {
    generate: (preferences: WeekPlanPreference[]): Promise<WeekPlanResponse> =>
      request("/api/week-plan", {
        method: "POST",
        body: JSON.stringify({ clientDate: todayISODate(), preferences }),
      }),
  },
  // Proposes milestones for a goal — a separate, narrower feature from chat
  // (see backend/app/services/goal_milestones.py). Nothing is written
  // server-side; the caller adds whatever's accepted via goalStore directly.
  goalMilestones: {
    suggest: (input: {
      title: string;
      description?: string | null;
      category?: string | null;
      note?: string | null;
      period: string;
      durationCount?: number | null;
    }): Promise<MilestoneSuggestResponse> =>
      request("/api/goal-milestones/suggest", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  // Drafts a description for a goal — a separate, narrower feature from chat
  // (see backend/app/services/goal_description.py). Nothing is written
  // server-side; the caller keeps whatever it accepts, same as one typed by
  // hand.
  goalDescription: {
    generate: (input: {
      title: string;
      category?: string | null;
      period: string;
      durationCount?: number | null;
    }): Promise<GoalDescriptionResponse> =>
      request("/api/goal-description/generate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  // Drafts calendar sessions for a goal's milestones — a separate, narrower
  // feature from chat (see backend/app/services/goal_schedule.py). Returns
  // proposals only; nothing is created until they're sent to
  // confirmChatActions above, exactly like a chat-proposed action.
  goalSchedule: {
    generate: (input: {
      goalTitle: string;
      milestones: MilestoneWindow[];
    }): Promise<GoalScheduleResponse> =>
      request("/api/goal-schedule", {
        method: "POST",
        body: JSON.stringify({ ...input, clientDate: todayISODate() }),
      }),
  },
  coach: {
    // Proposes today's remaining check-in windows; the server decides how
    // many actually get filled (coach_tier) and composes each via Gemini.
    plan: (nowMinutes: number, windows: CoachWindow[]): Promise<CoachPlanResponse> =>
      request("/api/coach/plan", {
        method: "POST",
        body: JSON.stringify({ nowMinutes, windows, clientDate: todayISODate() }),
      }),
  },
  // Natural-voice audio (WAV) for a spoken line. Binary, so it bypasses the
  // JSON `request` helper; callers treat any failure as "fall back to the
  // device voice". The abort keeps a slow server from stalling a reminder —
  // longer, user-initiated reads (day briefings) pass a more patient timeout,
  // since synthesis time grows with text length.
  // purpose "briefing" draws from the backend's small guaranteed daily
  // allowance on the premium voice (never crowded out by reminder/chat
  // usage); "routine" (the default) shares the larger monthly budget on the
  // cheaper voice instead — see routers/tts.py. The backend decides the
  // actual voice for "routine" regardless of `voice`; it's only honored for
  // "briefing".
  tts: async (
    text: string,
    timeoutMs = 10_000,
    voice?: string,
    purpose: "briefing" | "routine" = "routine"
  ): Promise<Blob> => {
    const token = await getToken();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice, purpose }),
        signal: controller.signal,
      });
      if (!res.ok) throw new ApiError(res.status, "text-to-speech failed");
      return await res.blob();
    } finally {
      window.clearTimeout(timeout);
    }
  },
  health: () => request<{ status: string }>("/api/health"),
  outlook: {
    // Returns the Microsoft login URL — opened in an in-app browser natively
    // (@capacitor/browser) or as a full-page redirect on web. returnTo (web
    // only) is this tab's own origin, so the backend's callback can redirect
    // back to it instead of the native app's custom URL scheme — see
    // lib/outlookAuth.ts.
    connect: (returnTo?: string): Promise<{ authorizeUrl: string }> =>
      request(
        `/api/outlook/connect${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`
      ),
    status: (): Promise<OutlookStatus> => request("/api/outlook/status"),
    disconnect: (): Promise<void> => request("/api/outlook/connection", { method: "DELETE" }),
    // One two-way pass — see backend/app/services/outlook_graph.py's
    // reconcile_outlook_events. isWriteTarget only affects whether
    // brand-new, not-yet-linked local tasks get pushed out this pass.
    reconcile: (isWriteTarget: boolean): Promise<ReconcileResult> =>
      request(`/api/outlook/reconcile?is_write_target=${isWriteTarget}`, { method: "POST" }),
  },
  googleCalendar: {
    // Returns the Google login URL — see the outlook.connect comment above,
    // identical rationale (lib/googleCalendarAuth.ts).
    connect: (returnTo?: string): Promise<{ authorizeUrl: string }> =>
      request(
        `/api/google-calendar/connect${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`
      ),
    status: (): Promise<GoogleCalendarStatus> => request("/api/google-calendar/status"),
    disconnect: (): Promise<void> =>
      request("/api/google-calendar/connection", { method: "DELETE" }),
    reconcile: (isWriteTarget: boolean): Promise<ReconcileResult> =>
      request(`/api/google-calendar/reconcile?is_write_target=${isWriteTarget}`, {
        method: "POST",
      }),
  },
};
