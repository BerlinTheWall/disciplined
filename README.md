# Disciplined

An AI personal assistant and scheduler, built as a cross-platform mobile app.
Plan your day by talking to it, and let it handle the structure — tasks,
calendar, goals and reminders in one place.

> In active development, pre-release. The app runs end to end on iOS and
> Android; subscription tiers are wired up but billing is not, so every account
> currently runs with all features unlocked.

## What it does

- **Plan a day by talking to it.** A chat assistant with tool access creates,
  moves, reschedules and deletes real schedule blocks, habits and goals —
  "move my dentist appointment to 6pm tomorrow" edits the calendar rather than
  replying with advice.
- **Capture by voice.** On-device speech recognition turns a spoken sentence
  into a scheduled item.
- **Break a goal into a plan.** A goal gets an AI-drafted description,
  suggested milestones, and a proposed schedule you can accept or edit; goals
  track progress, weighting and streaks.
- **Plan the week in one pass.** A guided week-plan flow picks up habits and
  goal work and lays them across the coming week.
- **Keep one calendar.** Two-way pull-and-push against the device's own
  calendars (Apple, Google, Outlook) through a native bridge, plus direct
  Google Calendar and Microsoft Graph account connections.
- **Get nudged, not nagged.** A daily briefing, contextual nudges and a coach
  surface what matters next; reminders fire as local notifications, so they
  work without a server round-trip.
- **Hear it.** Reminders and assistant replies can be read aloud in a natural
  voice (Azure AI Speech), split across a cheaper standard voice for routine
  speech and an HD voice for the assistant.
- **Drag to reschedule.** Reorder and re-time the day directly on the timeline.

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
FastAPI (async)  ──  Google Gemini · Azure AI Speech
        │
        ▼
PostgreSQL (SQLAlchemy async + Alembic)
```

**Frontend** — React 19, TypeScript, Vite, Tailwind CSS 4. State in Zustand
with Immer. Animation with Framer Motion, drag-and-drop with dnd-kit, icons
from Lucide. Packaged for iOS and Android through Capacitor, using its App,
Browser, Filesystem, Local Notifications, Calendar, Secure Storage and Speech
Recognition plugins.

**Backend** — FastAPI on Uvicorn. Async SQLAlchemy over asyncpg against
PostgreSQL, with Alembic handling migrations. Authentication via JWT and
bcrypt. LLM calls through `google-genai`, text-to-speech through Azure AI
Speech, transactional email through Resend. Settings validated with Pydantic.
Stored OAuth tokens are encrypted at rest with Fernet.

**Testing** — pytest on the backend. There is no end-to-end suite yet; see
[Project status](#project-status).

## Running it locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then fill in the values it describes
docker compose up -d             # Postgres on localhost:5432
uvicorn app.main:app --reload --port 8000
```

Interactive API docs at http://localhost:8000/docs. Migrations run on startup,
so the schema is created on first boot.

See [backend/README.md](backend/README.md) for the migration workflow and API
reference.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Mobile builds

```bash
cd frontend
npm run ios         # builds, syncs, opens Xcode (macOS only)
npm run android     # builds, syncs, opens Android Studio
```

## Configuration

The backend reads its configuration from environment variables, all of them
defined with defaults in `app/config.py` and documented — with links to where
each credential is issued — in [backend/.env.example](backend/.env.example).
Copy that file to `.env` and fill it in; nothing is required to boot, and each
unset key disables its feature with a clear error rather than a broken flow.

The keys that matter most: `GEMINI_API_KEY` (the assistant), `JWT_SECRET`
(never deploy with the built-in default), `DATABASE_URL`, and
`TOKEN_ENCRYPTION_KEY` (encrypts stored calendar OAuth tokens).

## Development

Before opening a pull request:

```bash
cd frontend && npm run ci     # format check, lint, types, build
cd backend  && python -m pytest -q
```

CI runs exactly these on every pull request. See
[CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit format and what
"done" means.

## Project status

**Working** — auth with email verification and password reset, the schedule
timeline, goals with AI-assisted milestones and scheduling, habits, the chat
assistant with tool-calling, week planning, daily briefing, nudges, coach,
device calendar sync, Google Calendar and Outlook connections, text-to-speech,
onboarding, and per-tier rate limiting on the AI endpoints.

**In progress** — subscription tiers. The gating dependency
(`app/tiers.py`) and the Free/Plus/Pro split exist and are enforced on routes,
but no billing is connected, so `User.subscription_tier` defaults to `pro` for
everyone.

**Next** — billing, an end-to-end test suite, crash reporting, and the App
Store prerequisites (privacy policy, terms, in-app account deletion).

**Out of scope for now** — standalone Meals, Workout and Expenses sections;
they remain useful only as passive signals for nudges and the digest.

## Why I built it

Every scheduling app I tried made me do the scheduling. They were good at
storing a plan and useless at making one — so the hard part, deciding what
actually goes where in a finite day, stayed manual. Disciplined starts from the
opposite end: you say what you want out of the week, and the assistant does the
placing, the moving and the re-planning when the day inevitably goes sideways.
