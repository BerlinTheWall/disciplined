# CI and the development pipeline

What runs, when, why each check exists, and how to reproduce a failure locally.
The workflow itself is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## When it runs

Every pull request, and every push to `main`. Pushing again to the same branch
cancels the previous run — there is no point paying for a build of a commit
nobody will look at.

`main` is protected. **`Frontend` and `Backend` are required**: a red build
physically blocks the merge. The branch must also be up to date with `main`
before merging, so the checks that passed are the checks against what will
actually land — expect an **Update branch** step on a pull request that has sat
while something else merged.

`End-to-end` runs on every pull request but is **not** required yet. Approvals
are set to zero deliberately; see [CONTRIBUTING](../CONTRIBUTING.md) for why.

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

## End-to-end job

Playwright, against the built app talking to a real API and Postgres, both
started by the job. Four tests: the login page, a refused password, a
successful sign-in, and an event created through the API appearing on the
schedule.

Two details that are load-bearing rather than incidental:

- **The API starts before the account is seeded.** Startup runs
  `alembic upgrade head`; seeding first would create the schema out from under
  Alembic.
- **`VITE_API_URL` is set explicitly.** `frontend/.env.production` is committed
  and points at the deployed Railway backend, and `vite build` runs in
  production mode and loads it — so without an override the suite silently
  tests *production*. The suite now refuses to start unless that variable is a
  localhost origin.

Not required to merge yet: a browser test crossing the whole stack earns that
only once it has proved it is not flaky.

## Deploy check

Railway rebuilds on every push to `main`. `deploy-check.yml` then polls
`/api/health/ready` until the reported release matches the pushed commit —
rather than sleeping and hoping — and asserts the backend reaches its database,
that an unknown API route 404s, and that the frontend serves its shell.

The 404 assertion is not padding: the frontend service answers *every* path
with its SPA shell and a `200`, so a smoke test aimed at the wrong host, or one
that reads status codes instead of response bodies, passes against a completely
dead backend.

## Release

Pushing a `v*` tag publishes a GitHub Release with notes taken from
`CHANGELOG.md`. It refuses to publish if the tag is not an ancestor of `main`,
or if the changelog has no section for that version, so a release cannot ship
unreviewed code or empty notes. See [CONTRIBUTING](../CONTRIBUTING.md) for the
steps to cut one.

## Known gaps

- **The end-to-end suite is not a required check**, and one of its tests has
  been seen to pass only on retry. Promote it once it has been boring for a
  couple of weeks — and fix that flake first.
- **No test drives the packaged app.** The suite runs the web build, so the
  Capacitor plugin paths (notifications, speech, device calendar) are still
  only ever verified by hand on a device.
- **The quick-add bar is untested end to end.** It routes everything through
  the Gemini assistant, so testing it needs the assistant stubbed.
- **No staging environment.** `main` deploys straight to production.
- **No alerting.** Sentry records errors; nothing pages anyone.
- **The Netlify preview is failing** and the cause is unresolved — it succeeded
  on PRs #1–3 in June/July and has failed since #4 in September. The site it
  deploys serves a build that predates authentication, and duplicates the
  frontend Railway already hosts, so the open question is whether to fix it or
  disconnect it.
