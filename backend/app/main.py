import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import (
    auth,
    briefing,
    chat,
    coach,
    events,
    goal_description,
    goal_milestones,
    goal_schedule,
    goals,
    google_calendar,
    habits,
    interests,
    nudges,
    outlook,
    tts,
    week_plan,
)

# uvicorn configures its own loggers and leaves the root alone, so without this
# nothing the app itself logs during startup ever reaches the deploy log.
logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Disciplined API", lifespan=lifespan)


@app.middleware("http")
async def security_headers(request, call_next):
    """Baseline hardening headers on every response. Cheap and harmless even
    where they don't fully apply (HSTS on a local http:// dev server, say) —
    browsers/clients simply ignore what doesn't apply to their connection."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Any localhost port: Vite hops to 5174+ when 5173 is busy and
    # `vite preview` uses 4173. The capacitor/ionic schemes are the WebView
    # origins the packaged native app sends (iOS uses capacitor://localhost).
    allow_origin_regex=r"^(https?|capacitor|ionic)://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(goals.router)
app.include_router(goal_description.router)
app.include_router(goal_milestones.router)
app.include_router(goal_schedule.router)
app.include_router(habits.router)
app.include_router(interests.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(briefing.router)
app.include_router(nudges.router)
app.include_router(coach.router)
app.include_router(week_plan.router)
app.include_router(outlook.router)
app.include_router(google_calendar.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
