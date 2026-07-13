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

from sqlalchemy import JSON, Boolean, Column, select

from app.config import settings
from app.database import SessionLocal
from app.models import Event, Habit, Meal, User, WorkoutSession

DEFAULT_SQLITE = Path(__file__).resolve().parent.parent / "disciplined.db"

# users first: every other row carries a user_id pointing at them.
TABLES: list[tuple[type, str]] = [
    (User, "users"),
    (Event, "events"),
    (Habit, "habits"),
    (WorkoutSession, "workout_sessions"),
    (Meal, "meals"),
]


def coerce(column: Column, value: object) -> object:
    """Re-type a raw SQLite value for the column the model declares.

    SQLite is dynamically typed and stores what it likes: booleans as 0/1
    integers, JSON as text. aiosqlite let that slide; asyncpg will not — it type-
    checks every bind param, so an int reaching a BOOLEAN column is a DataError.
    """
    if value is None:
        return None
    if isinstance(column.type, Boolean):
        return bool(value)
    if isinstance(column.type, JSON) and isinstance(value, str):
        return json.loads(value)
    return value


def read_rows(conn: sqlite3.Connection, model: type, table: str) -> list[dict]:
    columns = {column.name: column for column in model.__table__.columns}
    cursor = conn.execute(f'SELECT * FROM "{table}"')
    # Columns the old schema had and the models no longer do are dropped here.
    return [
        {key: coerce(columns[key], value) for key, value in dict(row).items() if key in columns}
        for row in cursor.fetchall()
    ]


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
        # An account that already registered on the server has the same email but
        # a different, server-generated id. That is the same person, so map the
        # old id onto the existing one and re-point their rows at it — otherwise
        # the imported data would belong to a user id nobody can log in as.
        id_map: dict[str, str] = {}
        for row in read_rows(source, User, "users"):
            existing_id = (
                await db.execute(select(User.id).where(User.email == row["email"]))
            ).scalar_one_or_none()
            if existing_id is not None:
                id_map[row["id"]] = existing_id
                skipped += 1
                print(f"users              — {row['email']} already registered, merging into it")
                continue
            db.add(User(**row))
            imported += 1
            print(f"users              + {row['email']}")

        # Flush the new users before their rows arrive, and stop autoflush from
        # firing mid-query below (which is what made the last failure so noisy).
        await db.flush()

        for model, table in TABLES[1:]:
            try:
                rows = read_rows(source, model, table)
            except sqlite3.OperationalError:
                print(f"{table:18} — not in the SQLite file, skipping")
                continue

            existing = set((await db.execute(select(model.id))).scalars())

            new = 0
            for row in rows:
                if row["id"] in existing:
                    skipped += 1
                    continue
                row["user_id"] = id_map.get(row["user_id"], row["user_id"])
                db.add(model(**row))
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
