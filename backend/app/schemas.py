from datetime import date as _date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """API speaks camelCase to match the frontend TypeScript types."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ---- Auth ----


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt truncates past 72 bytes
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    # IANA zone name from the device (Intl.DateTimeFormat().resolvedOptions().timeZone) —
    # optional since a browser could in principle fail to resolve one.
    timezone: str | None = None


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class UserOut(CamelModel):
    id: str
    email: str
    first_name: str
    last_name: str
    display_name: str
    email_verified: bool
    timezone: str | None = None
    segment: str | None = None


class AuthResponse(CamelModel):
    token: str
    user: UserOut


class MessageResponse(CamelModel):
    message: str


class VerifyEmailRequest(CamelModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendVerificationRequest(CamelModel):
    email: EmailStr


class ForgotPasswordRequest(CamelModel):
    email: EmailStr


class ResetPasswordRequest(CamelModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=72)


class UpdateTimezoneRequest(CamelModel):
    timezone: str


class UpdateSegmentRequest(CamelModel):
    segment: Literal["student", "professional", "manager", "parent"]


class UpdateDisplayNameRequest(CamelModel):
    display_name: str = Field(min_length=1, max_length=100)


# ---- Briefing ----


class BriefingItem(CamelModel):
    title: str = Field(max_length=200)
    start_minutes: int = Field(ge=0, lt=24 * 60)
    duration_minutes: int = Field(gt=0)
    completed: bool = False
    kind: Literal["task", "habit"] = "task"


class BriefingStreak(CamelModel):
    title: str = Field(max_length=200)
    days: int = Field(ge=1)


class BriefingRequest(CamelModel):
    # "today", "tomorrow" or a weekday name — used verbatim in the script.
    day_label: str = Field(max_length=40)
    name: str = Field(default="", max_length=80)
    items: list[BriefingItem] = Field(max_length=60)
    streaks: list[BriefingStreak] = Field(default_factory=list, max_length=10)
    # The user's current clock time (minutes from midnight), sent only when the
    # briefed day is today — lets the script treat passed-but-undone items as
    # overdue instead of guessing.
    now_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)


class BriefingResponse(CamelModel):
    script: str


# ---- Events (frontend: Task) ----

Priority = Literal["low", "medium", "high"]


class EventBase(CamelModel):
    title: str
    date: str  # ISO date, e.g. "2026-07-05"
    start_minutes: int = Field(ge=0, lt=24 * 60)
    duration_minutes: int = Field(gt=0)
    color: str = "#6366f1"
    icon: str = "default"
    completed: bool = False
    priority: Priority | None = None
    reminder_minutes_before: int | None = Field(default=None, ge=0)
    shopping_list_id: str | None = None
    workout_session_id: str | None = None
    recipe_id: str | None = None


class EventCreate(EventBase):
    # Client-generated id (the frontend creates ids locally for optimistic UI);
    # omitted -> the server generates one.
    id: str | None = None


class EventUpdate(CamelModel):
    title: str | None = None
    date: str | None = None
    start_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)
    duration_minutes: int | None = Field(default=None, gt=0)
    color: str | None = None
    icon: str | None = None
    completed: bool | None = None
    priority: Priority | None = None
    reminder_minutes_before: int | None = Field(default=None, ge=0)
    shopping_list_id: str | None = None
    workout_session_id: str | None = None
    recipe_id: str | None = None


class EventOut(EventBase):
    id: str


# ---- Habits ----


class HabitBase(CamelModel):
    title: str
    start_minutes: int = Field(ge=0, lt=24 * 60)
    duration_minutes: int = Field(gt=0)
    color: str = "#6366f1"
    icon: str = "default"
    days_of_week: list[int] = []  # 0 = Sunday ... 6 = Saturday; ignored when freq="monthly"
    completed_dates: list[str] = []
    skipped_dates: list[str] = []
    reminder_minutes_before: int | None = Field(default=None, ge=0)
    workout_session_id: str | None = None
    recipe_id: str | None = None
    freq: Literal["weekly", "monthly"] = "weekly"
    interval: int = Field(default=1, ge=1, le=24)
    # The cycle's first occurrence — only load-bearing when interval>1 or
    # freq="monthly"; NULL/interval=1 behaves like the original weekday-only model.
    anchor_date: str | None = None
    # Last day this habit is active; NULL means it never ends.
    end_date: str | None = None

    @field_validator("anchor_date")
    @classmethod
    def _validate_anchor_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            _date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"anchor_date is not a valid calendar date: {value!r}") from exc
        return value

    @field_validator("end_date")
    @classmethod
    def _validate_end_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            _date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"end_date is not a valid calendar date: {value!r}") from exc
        return value


class HabitCreate(HabitBase):
    id: str | None = None

    @model_validator(mode="after")
    def _validate_recurrence(self) -> "HabitCreate":
        if (self.freq == "monthly" or self.interval > 1) and self.anchor_date is None:
            raise ValueError("anchor_date is required when freq is monthly or interval > 1")
        if self.freq == "monthly" and self.interval > 12:
            raise ValueError("monthly interval can't exceed 12")
        if self.anchor_date is not None and self.end_date is not None and self.end_date < self.anchor_date:
            raise ValueError("end_date can't be before anchor_date")
        return self


class HabitUpdate(CamelModel):
    title: str | None = None
    start_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)
    duration_minutes: int | None = Field(default=None, gt=0)
    color: str | None = None
    icon: str | None = None
    days_of_week: list[int] | None = None
    completed_dates: list[str] | None = None
    skipped_dates: list[str] | None = None
    reminder_minutes_before: int | None = Field(default=None, ge=0)
    workout_session_id: str | None = None
    recipe_id: str | None = None
    freq: Literal["weekly", "monthly"] | None = None
    interval: int | None = Field(default=None, ge=1, le=24)
    anchor_date: str | None = None
    end_date: str | None = None

    @field_validator("anchor_date")
    @classmethod
    def _validate_anchor_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            _date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"anchor_date is not a valid calendar date: {value!r}") from exc
        return value

    @field_validator("end_date")
    @classmethod
    def _validate_end_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            _date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"end_date is not a valid calendar date: {value!r}") from exc
        return value


class HabitOut(HabitBase):
    id: str


# ---- Goals & Plans ----

GoalPeriod = Literal["week", "month", "year"]


class GoalMilestone(CamelModel):
    id: str
    label: str
    done: bool = False


class GoalBase(CamelModel):
    period: GoalPeriod
    period_key: str
    title: str
    note: str | None = None
    done: bool = False
    target: int | None = Field(default=None, ge=1)
    progress: int = Field(default=0, ge=0)
    priority: Priority | None = None
    order: int = 0
    linked_task_ids: list[str] = []
    linked_goal_ids: list[str] = []
    weights: dict[str, int] = {}
    milestones: list[GoalMilestone] = []
    created_at: int = 0


class GoalCreate(GoalBase):
    id: str | None = None


class GoalUpdate(CamelModel):
    period: GoalPeriod | None = None
    period_key: str | None = None
    title: str | None = None
    note: str | None = None
    done: bool | None = None
    target: int | None = Field(default=None, ge=1)
    progress: int | None = Field(default=None, ge=0)
    priority: Priority | None = None
    order: int | None = None
    linked_task_ids: list[str] | None = None
    linked_goal_ids: list[str] | None = None
    weights: dict[str, int] | None = None
    milestones: list[GoalMilestone] | None = None
    created_at: int | None = None


class GoalOut(GoalBase):
    id: str


# ---- Workouts ----

WorkoutType = Literal["gym", "running", "cycling", "swimming", "yoga", "other"]


class WorkoutExercise(CamelModel):
    id: str
    name: str
    sets: int | None = None
    reps: int | None = None
    weight: float | None = None
    rest_sec: int | None = None
    distance: float | None = None
    duration_min: float | None = None
    pace: str | None = None
    incline: float | None = None
    notes: str | None = None


class WorkoutSessionBase(CamelModel):
    name: str
    type: WorkoutType = "gym"
    color: str = "#6366f1"
    exercises: list[WorkoutExercise] = []


class WorkoutSessionCreate(WorkoutSessionBase):
    id: str | None = None


class WorkoutSessionUpdate(CamelModel):
    name: str | None = None
    type: WorkoutType | None = None
    color: str | None = None
    exercises: list[WorkoutExercise] | None = None


class WorkoutSessionOut(WorkoutSessionBase):
    id: str


# ---- Meals ----

MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class MealComponent(CamelModel):
    item_id: str
    servings: float


class MealBase(CamelModel):
    name: str
    type: MealType
    date: str
    components: list[MealComponent] = []
    recipe_id: str | None = None
    servings_eaten: float | None = None


class MealCreate(MealBase):
    id: str | None = None


class MealUpdate(CamelModel):
    name: str | None = None
    type: MealType | None = None
    date: str | None = None
    components: list[MealComponent] | None = None
    recipe_id: str | None = None
    servings_eaten: float | None = None


class MealOut(MealBase):
    id: str


# ---- Chat ----


class ChatMessage(CamelModel):
    role: Literal["user", "model"]
    content: str


class ChatRequest(CamelModel):
    message: str
    history: list[ChatMessage] = []
    # The client's local calendar date ("2026-07-07"). The server may be in a
    # different timezone (e.g. UTC on Railway), so "today"/"tomorrow" must be
    # resolved against the user's clock, not the server's.
    client_date: str | None = None


class ChatAction(CamelModel):
    """A tool call Gemini made during this turn, so the client knows to refetch."""

    tool: str
    args: dict[str, Any]
    result: Any


class PendingAction(CamelModel):
    """A mutating tool call the model wants to make, intercepted before it ran —
    execution only happens via a separate, explicit confirmation (see
    ConfirmRequest), never automatically just because the model asked."""

    tool: str
    args: dict[str, Any]


class ConfirmRequest(CamelModel):
    actions: list[PendingAction]


class ConfirmResponse(CamelModel):
    results: list[Any]
    ok: bool  # False if any result contains an "error" key


# ---- Week plan ----
# A separate, isolated feature from chat above: it only ever proposes
# create_event calls (never executes them itself) and reuses PendingAction /
# POST /api/chat/confirm for actually applying them, same as chat does.


class WeekPlanRequest(CamelModel):
    client_date: str | None = None


class WeekPlanResponse(CamelModel):
    message: str
    pending_actions: list[PendingAction] = []


# ---- Interests ----


class InterestBase(CamelModel):
    title: str
    icon: str = "default"
    created_at: int = 0


class InterestCreate(InterestBase):
    id: str | None = None


class InterestOut(InterestBase):
    id: str


# ---- Nudges ----


class NudgeRequest(CamelModel):
    client_date: str | None = None
    now_minutes: int | None = Field(default=None, ge=0, lt=24 * 60)
    # Keys the client is currently suppressing (its own dismissal cooldowns),
    # formatted "{type}:{subject_id}" — kept server-stateless.
    excluded_keys: list[str] = Field(default_factory=list, max_length=50)


class NudgeSuggestedSlot(CamelModel):
    date: str
    start_minutes: int
    duration_minutes: int


NudgeTypeLiteral = Literal[
    "habit_gap",
    "workout_gap",
    "goal_pacing",
    "streak_milestone",
    "goal_ahead",
    "streak_risk_today",
    "habit_event_conflict",
    "workout_variety",
    "tasks_overdue",
    "habit_weekday_pattern",
    "interest_gap",
    "interest_not_started",
]


class NudgeResponse(CamelModel):
    type: NudgeTypeLiteral | None = None
    subject_id: str | None = None
    message: str | None = None
    action_phrase: str | None = None
    suggested_slot: NudgeSuggestedSlot | None = None
    # The literal {tool, args} a "Yes" tap executes directly via
    # POST /api/chat/confirm — None when there's nothing safe to one-tap
    # (celebratory/informational types), in which case the client falls back
    # to action_phrase or a plain "View" action.
    pending_action: PendingAction | None = None


# ---- Proactive coach ----


class CoachWindow(CamelModel):
    label: str = Field(max_length=40)
    start_minutes: int = Field(ge=0, lt=24 * 60)
    end_minutes: int = Field(ge=0, lt=24 * 60)


class CoachPlanRequest(CamelModel):
    client_date: str | None = None
    now_minutes: int = Field(ge=0, lt=24 * 60)
    windows: list[CoachWindow] = Field(max_length=10)


class CoachCheckpoint(CamelModel):
    window_label: str
    fire_at_minutes: int
    title: str
    body: str
    action_phrase: str | None = None
    # Same one-tap-execution payload as NudgeResponse.pending_action — see
    # its comment. Delivered via a local notification, so a tap on it (see
    # frontend/src/lib/coach.ts) runs this directly too.
    pending_action: PendingAction | None = None
    # "{type}:{subject_id}" — used for the local-notification id and to route
    # a tap back to the right chat action.
    subject_key: str


class CoachPlanResponse(CamelModel):
    checkpoints: list[CoachCheckpoint] = []


class ChatResponse(CamelModel):
    reply: str
    actions: list[ChatAction] = []


# ---- Calendar sync (device calendars -> read-only mirror) ----
# One-way: the frontend reads Apple/Google/Outlook events via the native
# EventKit/CalendarContract plugin and pushes them here so the AI weekly
# planner and timeline can see them. Never editable from disciplined —
# writing disciplined's own events back to a device calendar happens
# entirely client-side (see frontend/src/lib/deviceCalendarSync.ts) and
# never touches this table.


class CalendarEventIn(CamelModel):
    external_event_id: str
    title: str
    location: str | None = None
    start_at: str  # ISO datetime, UTC
    end_at: str
    all_day: bool = False


class CalendarSyncRequest(CamelModel):
    calendar_id: str
    calendar_name: str
    source_label: str = "other"
    range_start: str  # ISO datetime, UTC — window this payload is authoritative for
    range_end: str
    events: list[CalendarEventIn] = Field(max_length=1000)


class CalendarEventOut(CamelModel):
    id: str
    device_calendar_id: str
    device_calendar_name: str
    source_label: str
    external_event_id: str
    title: str
    location: str | None = None
    start_at: str
    end_at: str
    all_day: bool


class CalendarSyncResponse(CamelModel):
    synced: int
    pruned: int
    pending_actions: list[PendingAction] = []
