# Changelog

Notable changes to Disciplined. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project has no released versions yet — nothing is tagged and the app has
not shipped to a store, so everything so far sits under Unreleased. The first
`[0.1.0]` heading should be cut when the first build goes to review.

## [Unreleased]

### Added

- **Continuous integration.** Every pull request runs lint, formatting,
  typecheck, both test suites and a production build, plus an import smoke test
  and a guard against two Alembic migration heads. See [docs/CI.md](docs/CI.md).
- **Test suites.** 74 backend tests (pytest, in-memory SQLite locally and real
  Postgres in CI) and 55 frontend tests (Vitest + Testing Library), from a
  starting point of one backend test file and no frontend runner.
- **Error reporting.** Sentry on both halves, off entirely without a DSN, with
  request bodies, credentials and PII kept out by construction
  ([ADR 0003](docs/adr/0003-error-reporting-privacy-posture.md)).
- **Request IDs.** Every backend request carries one, returned as
  `X-Request-ID` and printed on every log line it produces; an inbound header
  is honoured so a trace survives a proxy hop.
- **Error boundary** on the frontend — a render crash previously unmounted the
  tree and left a blank white screen.
- **Account deletion.** `Profile → Account → Delete account` permanently
  removes the account and every row belonging to it
  ([ADR 0004](docs/adr/0004-account-deletion.md)). Required by both app stores.
- **Process documentation** — `CONTRIBUTING.md`, `SECURITY.md`, a pull request
  template, and architecture decision records in [docs/adr/](docs/adr/).
- **Legal drafts** — [privacy policy](docs/PRIVACY.md) and
  [terms](docs/TERMS.md), written from the code. Both need placeholders filled,
  a legal review and a public URL before submission; see
  [docs/APP_STORE.md](docs/APP_STORE.md).
- Release stamping: builds record the commit they came from.

### Changed

- Line endings are LF everywhere, enforced by `.gitattributes`
  ([ADR 0001](docs/adr/0001-lf-line-endings.md)). Content-neutral: the 172-file
  conversion changed zero bytes.
- The README no longer ships with unfilled `[FILL: …]` template blocks, a wrong
  `uvicorn` module path, or a claim of Playwright end-to-end tests that do not
  exist.

### Fixed

- Frontend lint went from 966 problems to one warning: ESLint was linting
  generated Capacitor build output, and `react-refresh/only-export-components`
  was a false positive on the Vite entry point.
- `.env` was only ignored inside `backend/`, so a `frontend/.env` would have
  been committed.
- Test fixtures and tests now share one event loop — asyncpg connections
  created on a session-scoped loop failed under per-function test loops
  ([ADR 0002](docs/adr/0002-sqlite-locally-postgres-in-ci.md)).

### Security

- SSML injection in `/api/tts` via an unvalidated `voice` parameter, which
  could inject a whole `<voice>` element into the SSML sent to Azure and bypass
  the character cap. Fixed at the root by validating `voice` against the two
  voices the app offers.
- `/api/briefing` gated behind `require_tier("plus")`.
- Subscription tier enforcement and rate limiting added across the chat, TTS
  and goal endpoints, which previously had none.
