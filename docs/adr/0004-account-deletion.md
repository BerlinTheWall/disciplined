# 0004 — Hard-delete accounts, with the table list derived from metadata

**Date:** 2026-09-10 · **Status:** Accepted

## Context

The App Store and Play Store both require an app that offers account creation
to offer account deletion **from inside the app**. A support email does not
satisfy it, and its absence is one of the most common rejections. It is also
the only truthful answer to "delete my data".

The data is spread across eleven tables and there are **no foreign keys** —
`user_id` columns are plain indexed strings — so nothing cascades. Deletion has
to name every table, and the failure mode of naming them by hand is silent: a
model added next year is simply not deleted, and no test notices.

## Decision

**Hard delete, not a flag.** There is no `deleted_at` to forget to filter on
later, and a flag is not a deletion in the sense the stores and the user mean.

**The table list is derived from the model metadata.** Every per-user table has
a `user_id` column, so `user_owned_tables()` asks the metadata which tables have
one. A model added later is covered the day it is defined, without anyone
remembering `app/services/account_deletion.py` exists. A test asserts the
discovery matches the schema — a version that silently returned nothing would
leave every other deletion test passing while deleting almost nothing.

**`POST /api/auth/delete-account`, not `DELETE`.** The password travels in the
body, and a DELETE carrying a body is stripped by enough proxies and HTTP
clients to be a real risk for an operation that must not half-happen.

**Password re-entry, and the failure is not counted toward the login lockout.**
A token alone is enough for an unlocked, borrowed or stolen phone. But a wrong
password here is an authenticated user fumbling a confirmation, not someone
guessing their way in — counting it would let a mistyped delete lock you out of
your own account.

## Consequences

Deleting the stored OAuth tokens ends our access to connected calendars. It
deliberately does **not** call Google or Microsoft to revoke the grant: we
should not be making calls on behalf of an account we are in the middle of
deleting, and the user can revoke from their own account page. The privacy
policy says so.

Deletion is immediate and irreversible. There is no grace period and no undo,
so a compromised account can be destroyed by whoever holds the password — which
is why the password is required and why `logout-everywhere` exists alongside it.

Hosting backups may retain data briefly after deletion before rotating out.
Stated in the privacy policy rather than papered over.

## What would change our mind

A legal or support requirement for a recovery window. That would mean a
scheduled purge rather than an immediate one — and the flag we are avoiding
today, with all the filtering discipline it demands.
