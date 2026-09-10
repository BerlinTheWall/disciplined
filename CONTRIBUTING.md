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
cd frontend && npm run ci      # format check, lint, types, build
cd backend  && python -m pytest -q
```

CI runs exactly these, plus an import smoke test and a check that Alembic has a
single migration head. Running them locally first is faster than waiting for a
red build.

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

## Reviews

Every pull request needs one approval before merge. Squash-merge, and make the
squashed subject a proper Conventional Commit — it becomes the permanent
history and the source for release notes.

## Security

Never commit a `.env`, an API key, a keystore or a token. If you commit a
secret by accident, rotate it first and rewrite history second — assume
anything pushed is compromised. Report a vulnerability privately per
[SECURITY.md](SECURITY.md) rather than opening a public issue.
