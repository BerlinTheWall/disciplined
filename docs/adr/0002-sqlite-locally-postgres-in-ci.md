# 0002 — Test on SQLite locally, Postgres in CI

**Date:** 2026-09-10 · **Status:** Accepted

## Context

The backend runs on Postgres and uses `JSONB` columns (habits' completed dates,
goals' milestones, weights and linked ids). A test suite has to pick a database,
and the two obvious options each give up something real:

- **Postgres only.** Faithful, but every developer needs Docker running before
  `pytest` does anything, and the local loop pays container startup. Docker was
  not running on the machine this was built on, which is exactly the friction
  that stops people running tests.
- **SQLite only.** Fast and dependency-free, but SQLite has no `JSONB` DDL, and
  a suite that only ever runs on SQLite quietly becomes a suite that only
  *passes* on SQLite.

## Decision

Both. `tests/conftest.py` defaults to in-memory SQLite so `pytest` works with
nothing installed and finishes in seconds; CI sets `TEST_DATABASE_URL` to a
real `postgres:17-alpine` service — the same major version `docker-compose`
runs in dev — so the identical tests also run against the production engine.

The only glue required is a compiler hook rendering `JSONB` as `JSON` on
SQLite. `JSONB` is a subclass of the generic `JSON` type, so the driver already
knows how to serialise values; only the `CREATE TABLE` keyword differs.

## Consequences

This justified itself on its first run. The suite was **green locally and
37-of-67 failed in CI**: `pytest-asyncio` was running tests on a per-function
event loop while the session-scoped engine held asyncpg connections created on
the session loop. aiosqlite tolerates that mismatch; asyncpg raises
`attached to a different loop`. A SQLite-only suite would have shipped that.

The cost is a second configuration path to keep working, and the standing risk
that a test depending on Postgres-specific behaviour passes locally for the
wrong reason. `CONTRIBUTING.md` tells you to run such a test against Postgres
before trusting it.

Related: cleanup between tests truncates tables rather than rolling back a
transaction, because the code under test commits — a rollback-based fixture
makes those commits invisible and produces a green suite over broken code.

## What would change our mind

If the schema grows enough Postgres-specific behaviour that the SQLite run
stops being meaningful, drop SQLite and require Docker. The signal for that is
tests needing dialect conditionals to pass on both.
