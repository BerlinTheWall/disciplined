# Disciplined backend

FastAPI + async SQLAlchemy (SQLite) + Gemini scheduling assistant.

## Setup

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env        # then put your GEMINI_API_KEY in .env
```

## Run

```sh
uvicorn app.main:app --reload --port 8000
```

Interactive docs at http://localhost:8000/docs. The SQLite file
(`disciplined.db`) is created automatically on first start.

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
