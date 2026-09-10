# Contributing

How work gets from an idea to `main` in this repo. The point of writing it down
is that the process should be the same on a good week and a bad one.

## Branches

`main` is always deployable. Never commit to it directly — even a one-line fix
goes through a branch and a pull request, because the pull request is where CI
runs.

Branch names say what the work is, not which number it is:

```
feat/week-plan-drag-reorder
fix/dst-shifts-event-times
chore/bump-capacitor-8.5
docs/api-reference
refactor/extract-calendar-time
```

`type/short-kebab-description`, using the same types as the commit convention
below. Delete the branch after it merges.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). The subject line
completes the sentence "applying this commit will…":

```
<type>(<scope>): <what changes, imperative, lowercase, no full stop>

<why it changes — the part you cannot reconstruct from the diff>
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `revert`.
Scope is the area touched — `chat`, `goals`, `calendar`, `auth`, `tts`,
`nudges`, `ci`, `deps`.

Good:

```
fix(calendar): keep event times correct across a DST boundary

utc_to_local_fields converted with a fixed offset, so every event in a
week spanning the change landed an hour out. Uses the zone's offset at
each event's own instant instead.
```

Not good — these are real examples from this repo's history, and none of them
tell you what broke or why:

```
fix: deploy issue
fix: security vulnarabilites
fix: ui ux issues
```

The body matters more than the prefix. If a commit fixes a reported issue, end
the body with `Closes #123`.

## Before you open a pull request

```bash
cd frontend && npm run ci      # format check, lint, types, tests, build
cd backend  && python -m pytest -q
```

CI runs exactly these, plus an import smoke test and a check that Alembic has a
single migration head. Running them locally first is faster than waiting for a
red build.

## Tests

Neither suite needs anything running.

**Backend** — pytest, with fixtures in `tests/conftest.py`: `client` (the real
app over ASGI), `user` and `auth_headers` (a signed-in account), `make_user`
(more accounts, any tier) and `db`. Async tests need no decorator;
`asyncio_mode = auto` is set in `pytest.ini`.

```python
async def test_cannot_read_another_users_event(client, auth_headers, make_user):
    ...
```

The database is in-memory SQLite by default so the suite runs in seconds.
CI additionally runs it against a real Postgres via `TEST_DATABASE_URL`, so
the Postgres-only bits (the models' JSONB columns) are genuinely exercised
rather than standing in as SQLite JSON. If you write a test that depends on
Postgres behaviour, run it that way locally too:

```bash
docker compose up -d
TEST_DATABASE_URL=postgresql+asyncpg://disciplined:disciplined@localhost:5432/disciplined_test   python -m pytest -q
```

**Frontend** — Vitest with Testing Library, `npm run test` (or `test:watch`).
Test files live next to what they cover, in `__tests__/`.

What is worth testing here, in rough order: anything where a bug is a security
bug (auth, tier gating, one account reading another's rows), the pure logic
that is painful to verify by hand (`lib/quickAdd.ts`, `lib/date.ts`, the
calendar time conversions), and components whose whole job is to appear when
something has gone wrong. Rendering-only components are usually not worth a
test; a snapshot of a div rarely fails for a reason anyone cares about.

## Definition of done

A change is done when all of these are true. If one does not apply, say so in
the pull request rather than skipping it silently.

- [ ] `npm run ci` and `pytest` pass locally
- [ ] Tested on a real device or simulator when it touches UI, notifications,
      speech or the calendar bridge — the web dev server does not exercise the
      Capacitor plugins
- [ ] New behaviour has a test, or the pull request says why it does not
- [ ] Any schema change has a reviewed Alembic migration (see below)
- [ ] User-visible strings read like the rest of the app
- [ ] No secret, key or token added to a tracked file
- [ ] `README.md` / `backend/README.md` updated if setup or the API changed

## Database migrations

Schema changes go through Alembic, never by editing the database directly.

```bash
cd backend
alembic revision --autogenerate -m "add expenses"
alembic upgrade head
```

**Always read the generated migration before committing it.** Autogenerate is
reliable for added tables and columns and unreliable for renames — it emits a
drop plus an add, which silently destroys the data in that column.

Only one migration head may exist at a time. If two branches each add a
migration from the same parent, CI fails; rebase and re-point your migration's
`down_revision` at the other one rather than merging two heads.

## Code style

Formatting is not a matter of opinion here — Prettier and ESLint decide, and CI
enforces it. `npm run format` fixes the frontend.

Line endings are LF everywhere, enforced by `.gitattributes`. Do not change
`core.autocrlf` to work around something; if a file shows up as wholly modified
when you did not touch it, that is the symptom of a line-ending problem, not a
reason to commit it.

Beyond the automated rules, the convention in this codebase is that comments
explain *why*, not *what* — a comment that restates the line below it is noise,
and a comment recording the reason a non-obvious choice was made is the most
valuable thing in the file. Match the density of the code you are editing.

## Reviews and merging

`main` is protected. Everything goes through a pull request, both CI jobs
(`Frontend` and `Backend`) must be green, and force-pushes and deletions are
refused. A red build blocks the merge rather than merely embarrassing it.

**Approvals are set to zero, deliberately.** You cannot approve your own pull
request, so any higher number would make merging impossible for a single
maintainer. Zero still forces the work through a pull request, which is where
CI runs — that is the part doing the work. Raise it to one the day there is a
second person who can review.

That places the burden on self-review: read your own diff on the pull request
page before merging it. It is a different reading from the one you get in your
editor, and it catches things.

Admins can bypass protection in an emergency (`enforce_admins` is off, so you
are never locked out mid-incident). Treat every bypass as an incident worth
explaining in the commit message.

Squash-merge for ordinary work, and make the squashed subject a proper
Conventional Commit — it becomes the permanent history and the source for
release notes. **Never squash the base of a stack of pull requests**: it
rewrites the commits the ones above are built on.

## Releases

Nothing has shipped yet, so there are no tags. When the first build goes to
review, cut a release from `main`:

1. Move the accumulated `## [Unreleased]` entries in `CHANGELOG.md` under a new
   `## [0.1.0]` heading, with the date.
2. Set the same version in `frontend/package.json`.
3. Merge that through a pull request like anything else.
4. Tag the merged commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

The Release workflow turns the tag into a GitHub Release, taking the notes
from the changelog section for that version. It refuses to publish if the tag
is not an ancestor of `main`, or if the changelog has no section for it — so a
release cannot quietly ship unreviewed code or empty notes.

## Operations

Deploys are automatic: Railway rebuilds both services on every push to `main`,
and the **Deploy check** workflow then polls readiness until the running
release matches the commit and asserts the backend can reach its database.

For rollbacks, secret rotation and what to do when something is broken in
production, see the runbook in `docs/RUNBOOK.md`. Read the secret-rotation
table before rotating anything: two of those keys have consequences that cannot
be undone.

## Security

Never commit a `.env`, an API key, a keystore or a token. If you commit a
secret by accident, rotate it first and rewrite history second — assume
anything pushed is compromised. Report a vulnerability privately per
[SECURITY.md](SECURITY.md) rather than opening a public issue.
