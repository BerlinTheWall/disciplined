# Security policy

## Reporting a vulnerability

Please report security issues privately — do not open a public GitHub issue.

Use GitHub's [private vulnerability
reporting](https://github.com/BerlinTheWall/disciplined/security/advisories/new)
on this repository, which notifies the maintainers directly.

Include what you can: the affected endpoint or screen, the steps to reproduce,
and what an attacker gains. A proof of concept helps but is not required.

Expect an acknowledgement within a week. Please give us a reasonable window to
ship a fix before disclosing publicly.

## Supported versions

Disciplined is pre-release and ships from `main`. Only the currently deployed
version is supported; there are no maintained older releases.

## What we consider sensitive

The service stores account credentials, schedule and goal content, and OAuth
refresh tokens for connected Google and Microsoft calendars. Those tokens are
encrypted at rest with Fernet (`TOKEN_ENCRYPTION_KEY`). Anything that exposes
another user's data, forges authentication, or reads those tokens in plaintext
is in scope and worth reporting.

Reports we already know about and do not need: missing rate limits on
non-AI endpoints, and the absence of refresh-token rotation on the app's own
JWTs. Both are tracked.

## If a secret leaks

Rotate first, rewrite history second. Anything pushed to a remote should be
assumed compromised even after a force-push. The credentials in use are listed
in `backend/.env.example`; each is issued by the provider named there.
