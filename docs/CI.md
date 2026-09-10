# CI and the development pipeline

What runs, when, why each check exists, and how to reproduce a failure locally.
The workflow itself is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## When it runs

Every pull request, and every push to `main`. Pushing again to the same branch
cancels the previous run — there is no point paying for a build of a commit
nobody will look at.

Nothing is a *required* check today, because `main` has no branch protection.
That is a deliberate gap, not an oversight: see [Gaps](#known-gaps).

## Frontend job

Runs in `frontend/`, Node 22, `npm ci` (not `install` — it installs exactly what
the lockfile pins and fails if the lockfile has drifted from `package.json`).

| Step | Command | Catches |
|---|---|---|
| Formatting | `npm run format:check` | Style drift. `format` *writes* files, which is wrong for a check — hence the separate script. |
| Lint | `npm run lint` | ESLint + Prettier rules. Generated native output (`android/`, `ios/`) and vendor code are ignored. |
| Types | `npm run typecheck` | `tsc -b --force` |
| Tests | `npm run test` | Vitest, 55 tests |
| Build | `npm run build` | That it actually compiles and bundles |

Separate steps rather than one chained script, so a failure names itself in the
job summary instead of hiding behind `&&`.

Locally, all of it: `npm run ci`.

## Backend job

Runs in `backend/`, Python 3.13, against a `postgres:17-alpine` service — the
same major version `docker-compose` runs in dev.

| Step | Catches |
|---|---|
| **Import smoke test** — `python -c "import app.main"` | Executes every router and service import with no database and no `.env` (every setting in `config.py` has a default). **A bad import is what breaks a deploy**, and it never appears in a unit test that only touches one pure module. This is the class of failure behind the earlier `fix: deploy issue` commit. |
| **Single migration head** — `alembic heads` must return exactly one | Two branches each adding a migration from the same parent. Alembic resolves scripts from disk, so this needs no database. Without it the collision surfaces at deploy, where `alembic upgrade head` aborts and takes the release with it. |
| **Tests** — `pytest -q`, 74 tests | Against real Postgres via `TEST_DATABASE_URL` |

## Running the tests

Neither suite needs anything running.

```bash
cd backend  && python -m pytest -q      # in-memory SQLite, seconds
cd frontend && npm run ci
```

To reproduce a CI-only database failure — see
[ADR 0002](adr/0002-sqlite-locally-postgres-in-ci.md) for why these can differ:

```bash
docker compose up -d
TEST_DATABASE_URL=postgresql+asyncpg://disciplined:disciplined@localhost:5432/disciplined_test \
  python -m pytest -q
```

## What the tests cover

Aimed at code where a bug is a *security* bug, and at pure logic that is
painful to verify by hand.

**Backend (74).** Auth: lockout after repeated failures — including that the
lock holds against the *correct* password, since guessing right is the
attacker's goal; that login does not reveal which emails exist; that
`logout-everywhere` genuinely invalidates issued tokens. Tiers: the full
free/plus/pro matrix, that an unknown tier fails closed, and that gated routes
still refuse a free account — a real regression guard, because billing is
unwired and every account defaults to `pro`, making that failure invisible in
manual testing. Events: CRUD plus isolation between accounts. Account deletion,
observability, and the calendar time conversions.

**Frontend (55).** `lib/date.ts` (local-midnight parsing and local-calendar
formatting — off-by-one-day bugs that only appear in some timezones at some
times of day), `lib/quickAdd.ts` (the natural-language parser, with the clock
injected so expectations do not drift), and `ErrorBoundary`.

## Deployment

Railway builds and deploys `main` — frontend and backend as separate services.
It is configured in Railway's UI, not in this repository; there is no
Dockerfile or `railway.json` here.

A separate Netlify site (`disciplined-me`) builds deploy previews for pull
requests targeting `main`. It is not a required check.

## Branching and merging

`main` is always deployable. Work goes on a `type/short-kebab-description`
branch and through a pull request, because the pull request is where CI runs.
See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for commit format and definition of
done.

**Stacked pull requests need care.** A PR based on another branch merges into
*that branch*, not into `main`. Two ways through:

- **PR by PR** — merge the bottom one, retarget the next to `main`
  (`gh pr edit N --base main`), merge, repeat. Slower, but every PR ends up
  correctly marked as merged.
- **Fast-forward the whole stack** — `git merge --ff-only <top-branch>` on
  `main`. One move, perfectly linear history. The catch: only the PR whose base
  was `main` shows as *Merged*; the rest can only be **closed**, because GitHub
  refuses to retarget a PR once no commits remain between it and the new base.
  This is what happened on 2026-09-10; PRs #5–#7 are closed despite their code
  being on `main`.

Never squash-merge the base of a stack — it rewrites the commits the PRs above
it are built on.

## Known gaps

- **No required checks.** `main` has no branch protection, so a red build does
  not physically prevent a merge. Turning on protection with both jobs required
  is a one-time settings change and the natural next step.
- **No deploy verification.** CI proves the code builds; nothing checks that
  the deployed service is healthy afterwards. `/api/health` exists and is
  unused by any automation.
- **No end-to-end tests.** Nothing drives a real device or the packaged app,
  so the Capacitor plugin paths (notifications, speech, calendar) are only ever
  verified by hand.
- **The Netlify preview is failing** and the cause is unresolved — it succeeded
  on PRs #1–3 in June/July and failed on #4 in September.
