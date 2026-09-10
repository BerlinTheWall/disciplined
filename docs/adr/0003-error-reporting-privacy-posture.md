# 0003 — What error reports may and may not contain

**Date:** 2026-09-10 · **Status:** Accepted

## Context

Production failures left nothing behind: the access log recorded *that* a 500
happened, never why, and a render crash on a packaged mobile build was
invisible to everyone including the user. That needed an error reporter.

But the default posture of every error reporter is to attach the request that
failed, and on this service that request body is a chat message, a goal, or
someone's schedule. It also holds OAuth refresh tokens for users' connected
Google and Microsoft calendars. Shipping that to a third party to make a bug
marginally easier to reproduce is not a trade we are willing to make, and it
would make the privacy policy a lie.

## Decision

Sentry, on both halves, configured to keep user data out:

| Control | Backend | Frontend |
|---|---|---|
| Request bodies | `max_request_body_size="never"` | deleted in `beforeSend` |
| Auth headers, cookies | scrubbed in `before_send` | n/a |
| Query strings | scrubbed — an OAuth callback carries `code` in the URL | stripped |
| PII (email, IP) | `send_default_pii=False` | `sendDefaultPii: false` |
| Session Replay | n/a | **never enabled** |
| Console breadcrumbs | n/a | dropped |

**Session Replay is the one to not quietly turn on later.** It records the DOM,
and this app's DOM is the user's calendar. Console breadcrumbs go for the same
reason: log lines here quote assistant replies and task titles.

Users are identified by opaque account id only — enough to see that one account
hit an error fifty times, not enough to know who they are.

Reporting is off entirely without a DSN. On the frontend that is stronger than
it sounds: Vite inlines `VITE_SENTRY_DSN` at build time, so an unset DSN folds
the guard to a constant and the whole SDK is tree-shaken out — an unconfigured
build ships zero Sentry bytes.

## Consequences

Some bugs will be harder to reproduce, because the report says a request failed
without saying what was in it. That is the intended trade. The request id
(ADR-adjacent, see `docs/CI.md`) exists partly to compensate: it ties an event
to its server log lines without carrying content.

The build-time inlining has a sharp edge worth remembering: **the DSN must be
set when the bundle is built, not when it is deployed.** Setting it in the web
host's runtime environment produces an app with no reporting in it.

## What would change our mind

Nothing on Session Replay while the app displays personal schedules. The body
capture could be revisited only with per-field allow-listing, never by flipping
the flag.
