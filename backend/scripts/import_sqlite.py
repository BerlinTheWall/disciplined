"""One-off: copy the old SQLite database into Postgres.

    python -m scripts.import_sqlite                      # into $DATABASE_URL
    python -m scripts.import_sqlite --dry-run            # just report what it'd do
    python -m scripts.import_sqlite --db ../old.db       # a different source file

Reads rows straight out of the SQLite file with the stdlib driver (no ORM, so a
drifted old schema can't break it) and inserts them into the current models.
Safe to re-run: rows whose id already exists in Postgres are skipped, never
overwritten — so a partial run can just be run again.

Run it AFTER `alembic upgrade head` has created the tables.
"""

import argparse
import asyncio
import json
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import Event, Habit, Meal, User, WorkoutSession

DEFAULT_SQLITE = Path(__file__).resolve().parent.parent / "disciplined.db"

# Model -> the JSON-encoded text columns SQLite stored as strings. Postgres wants
# real lists/dicts for its JSON(B) columns, so these get decoded on the way in.
TABLES: list[tuple[type, str, tuple[str, ...]]] = [
    # users first: everything else carries a user_id pointing at them.
    (User, "users", ()),
    (Event, "events", ()),
    (Habit, "habits", ("days_of_week", "completed_dates", "skipped_dates")),
    (WorkoutSession, "workout_sessions", ("exercises",)),
    (Meal, "meals", ("components",)),
]


def read_rows(conn: sqlite3.Connection, table: str, json_columns: tuple[str, ...]) -> list[dict]:
    cursor = conn.execute(f'SELECT * FROM "{table}"')
    rows = []
    for row in cursor.fetchall():
        data = dict(row)
        for column in json_columns:
            value = data.get(column)
            if isinstance(value, str):
                data[column] = json.loads(value)
        rows.append(data)
    return rows


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_SQLITE, help="source SQLite file")
    parser.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    args = parser.parse_args()

    if not args.db.exists():
        print(f"No SQLite database at {args.db} — nothing to import.")
        return 1
    if "sqlite" in settings.database_url:
        print("DATABASE_URL still points at SQLite. Point it at Postgres first.")
        return 1

    print(f"source: {args.db}")
    print(f"target: {settings.database_url.rsplit('@', 1)[-1]}")  # no credentials in the log
    print()

    source = sqlite3.connect(args.db)
    source.row_factory = sqlite3.Row

    imported, skipped = 0, 0
    async with SessionLocal() as db:
        for model, table, json_columns in TABLES:
            try:
                rows = read_rows(source, table, json_columns)
            except sqlite3.OperationalError:
                print(f"{table:18} — not in the SQLite file, skipping")
                continue

            existing = set((await db.execute(select(model.id))).scalars())
            fields = {column.name for column in model.__table__.columns}

            new = 0
            for row in rows:
                if row["id"] in existing:
                    skipped += 1
                    continue
                # Drop columns the old schema had and the models no longer do.
                db.add(model(**{k: v for k, v in row.items() if k in fields}))
                new += 1

            imported += new
            note = f"{len(rows) - new} already present" if len(rows) > new else ""
            print(f"{table:18} {new:3} imported   {note}")

        if args.dry_run:
            await db.rollback()
            print(f"\ndry run — rolled back. Would import {imported}, skip {skipped}.")
        else:
            await db.commit()
            print(f"\ndone — imported {imported}, skipped {skipped} already-present rows.")

    source.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
