from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
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
    display_name: str = ""


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class UserOut(CamelModel):
    id: str
    email: str
    display_name: str


class AuthResponse(CamelModel):
    token: str
    user: UserOut


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
    days_of_week: list[int] = []  # 0 = Sunday ... 6 = Saturday
    completed_dates: list[str] = []
    skipped_dates: list[str] = []
    reminder_minutes_before: int | None = Field(default=None, ge=0)
    workout_session_id: str | None = None
    recipe_id: str | None = None


class HabitCreate(HabitBase):
    id: str | None = None


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


class HabitOut(HabitBase):
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


class ChatResponse(CamelModel):
    reply: str
    actions: list[ChatAction] = []
