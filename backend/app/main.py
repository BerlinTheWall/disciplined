from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import auth, chat, events, habits, meals, tts, workouts


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Disciplined API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Any localhost port: Vite hops to 5174+ when 5173 is busy, `vite preview`
    # uses 4173, and Capacitor serves from capacitor://localhost.
    allow_origin_regex=r"^(https?|capacitor)://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(habits.router)
app.include_router(workouts.router)
app.include_router(meals.router)
app.include_router(chat.router)
app.include_router(tts.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
