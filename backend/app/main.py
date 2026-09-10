import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, init_db
from app.observability import (
    RequestIdMiddleware,
    configure_logging,
    init_sentry,
    release_name,
)
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

# Logging first, so anything the Sentry setup itself reports is readable, then
# Sentry before the app is constructed so its integrations can instrument it.
configure_logging()
init_sentry()

log = logging.getLogger(__name__)


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

# Added last, so it runs first: Starlette applies middleware in reverse, and
# the request id has to exist before anything downstream logs or raises.
app.add_middleware(RequestIdMiddleware)

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
    """Liveness: is the process up and serving?

    Deliberately touches nothing. A liveness probe that depends on the database
    turns a brief database blip into a restart loop, which is strictly worse
    than the blip. Use /api/health/ready to answer "is this deploy working".
    """
    return {"status": "ok"}


@app.get("/api/health/ready")
async def ready(db: AsyncSession = Depends(get_db)):
    """Readiness: is this deploy actually able to serve requests?

    Reports the commit it is running, which is what makes automated deploy
    verification possible — the workflow polls until the reported release
    matches the commit it just pushed, instead of sleeping for an arbitrary
    number of seconds and hoping.

    Returns 503 rather than raising, so a caller can distinguish "deployed but
    the database is unreachable" from "not deployed yet" (connection refused
    or an older release).
    """
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        log.error("readiness check failed: %s: %s", type(e).__name__, e)
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable", "release": release_name()},
        )
    return {"status": "ok", "database": "ok", "release": release_name()}
