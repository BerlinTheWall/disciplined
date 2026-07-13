# Disciplined backend

FastAPI + async SQLAlchemy (Postgres) + Gemini scheduling assistant.

## Setup

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env        # then put your GEMINI_API_KEY and JWT_SECRET in .env
docker compose up -d          # Postgres on localhost:5432
```

## Run

```sh
uvicorn app.main:app --reload --port 8000
```

Interactive docs at http://localhost:8000/docs. Migrations run automatically on
startup, so the schema is created on first boot.

## Database

Postgres, reached over asyncpg. `DATABASE_URL` is the only knob — Railway
injects its own in production, and the app rewrites the `postgresql://` form it
hands out into the `postgresql+asyncpg://` one SQLAlchemy needs
(`normalize_database_url` in `app/config.py`).

Schema changes go through **Alembic**. After editing `app/models.py`:

```sh
alembic revision --autogenerate -m "add expenses"   # writes migrations/versions/…
alembic upgrade head                                # apply (startup does this too)
alembic downgrade -1                                # undo the last one
alembic current                                     # what's applied
```

Always read the generated migration before committing it — autogenerate is good
at added tables and columns, and unreliable at renames (it sees a drop plus an
add, which silently destroys the data in that column).

### Importing the old SQLite data

One-off, for a database that predates Postgres. Run it after the tables exist:

```sh
python -m scripts.import_sqlite --dry-run   # report what it would copy
python -m scripts.import_sqlite             # copy it
```

Re-running is safe: rows whose id is already in Postgres are skipped, not
overwritten.

## API

- `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/{id}` — schedule blocks
  (`?start=&end=` ISO-date range filter on the list route)
- `GET/POST /api/habits`, `GET/PATCH/DELETE /api/habits/{id}`
- `GET/POST /api/workouts`, `GET/PATCH/DELETE /api/workouts/{id}`
- `GET/POST /api/meals`, `GET/PATCH/DELETE /api/meals/{id}` (`?start=&end=`)
- `POST /api/chat` — conversational scheduling assistant

All JSON is camelCase, matching the frontend types in `src/types/`.

### Chat

```json
POST /api/chat
{
  "message": "Move my workout to 6pm tomorrow",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "model", "content": "..." }
  ]
}
```

Response: `{ "reply": "...", "actions": [{ "tool", "args", "result" }] }`.
`actions` lists every tool call Gemini executed this turn — if it contains
`create_event`, `move_event`, `delete_event`, or `swap_events`, refetch the
schedule.

The assistant gets the current week's schedule (with event IDs) in its system
prompt and can call: `create_event`, `list_events`, `move_event`,
`delete_event`, `check_conflicts`, `swap_events`.
