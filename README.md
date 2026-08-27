# Disciplined

An AI personal assistant and scheduler, built as a cross-platform mobile app.
Plan your day by talking to it, and let it handle the structure — tasks,
calendar, and reminders in one place.

> In active development. **[FILL: one sentence on where it is — private beta,
> pre-release, targeting an App Store submission, whatever is true]**

## What it does

**[FILL: 4–6 bullets of actual capabilities, written as what a user does, not
what the code contains. Some of these are implied by the dependencies — keep
only what is genuinely built:]**

- Capture tasks by voice, using on-device speech recognition
- Read and write to the device calendar so scheduling stays in one place
- Reorder and reschedule by dragging
- Local notifications for reminders that work without a server round-trip
- **[FILL: what the AI actually does — plan the day? break tasks down? re-prioritise? summarise? Be specific, this is the part people care about]**

## Screenshots

**[FILL: add two or three. A mobile app with no screenshots in its README loses
most of its readers before they scroll. Drop images in `docs/` and reference
them here.]**

## Architecture

Native mobile clients built from a single React codebase via Capacitor, talking
to a FastAPI service over HTTP.

```
React 19 + TypeScript (Vite)
        │
   Capacitor bridge  ──  iOS · Android
        │
        │  local notifications · calendar · speech recognition · filesystem
        │
        ▼
FastAPI (async)  ──  Google Gemini
        │
        ▼
PostgreSQL (SQLAlchemy async + Alembic)
```

**Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4. State in Zustand
with Immer. Animation with Framer Motion, drag-and-drop with dnd-kit, icons
from Lucide. Packaged for iOS and Android through Capacitor, using its App,
Browser, Filesystem, Local Notifications, Calendar and Speech Recognition
plugins.

**Backend** — FastAPI on Uvicorn. Async SQLAlchemy over asyncpg against
PostgreSQL, with Alembic handling migrations. Authentication via JWT and
bcrypt. LLM calls through `google-genai`. Settings validated with Pydantic.

**Testing** — pytest on the backend, Playwright for end-to-end browser tests.

## Running it locally

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # [FILL: add a .env.example — list every variable, no values]
alembic upgrade head
uvicorn main:app --reload   # [FILL: correct the module path if it differs]
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Mobile builds

```bash
npm run build
npx cap sync
npx cap open ios        # requires Xcode
npx cap open android    # requires Android Studio
```

## Configuration

**[FILL: list every environment variable the backend needs — database URL,
JWT secret, Gemini API key — with a one-line description each and NO values.]**

## Project status

**[FILL: what's done, what's in progress, what's planned. Honest is better than
impressive here — a clear roadmap reads as a real project, a vague one reads
like a template.]**

## Why I built it

**[FILL: two or three sentences. Every good side project has a reason someone
started it, and it's usually the most memorable thing in the README.]**
