# Runbook

What to do when something is on fire, or when you need to change something in
production. Written to be followed at 2am by someone who did not write the code.

| | |
|---|---|
| Backend | `https://disciplined-production-807b.up.railway.app` |
| Frontend | `https://disciplined-production.up.railway.app` |
| Liveness | `GET /api/health` — process is up, touches nothing |
| Readiness | `GET /api/health/ready` — reports database state and the running commit |
| Hosting | Railway, two services, deploying from `main` |
| Errors | Sentry, if `SENTRY_DSN` is set on the service |

> **The frontend service answers every path with its SPA shell**, including
> `/api/…`, with a `200`. Checking `/api/health` against the frontend host
> tells you nothing. Always use the backend host, and always read the JSON
> body rather than the status code.

## Deploying

Push to `main` — Railway rebuilds both services. That is the whole deploy.
`main` is protected, so this means merging a pull request with CI green.

The **Deploy check** workflow then polls readiness until the running release
matches the commit you pushed, and asserts the backend can reach its database.
If it goes red, the deploy did not land or the service is failing to start;
open Railway's deploy log.

To verify by hand:

```sh
curl -s https://disciplined-production-807b.up.railway.app/api/health/ready
# {"status":"ok","database":"ok","release":"<commit sha>"}
```

If `release` does not match what you expect, Railway is still building, or the
build failed and the previous release is still serving.

## Rolling back

Railway keeps previous deploys. **Redeploy the last good one from Railway's
dashboard** — Deployments → the one before the bad one → Redeploy. This is
faster than reverting through git and waiting for a rebuild, and it is the
right first move while you work out what broke.

Then fix forward: revert the offending commit on a branch, open a pull request,
let CI prove it, merge.

**Careful with migrations.** Redeploying old code does not undo an applied
migration. If the bad release migrated the schema, roll the code back first,
then decide about the schema — see below.

## Migrations

Migrations run automatically at startup (`init_db` in `app/database.py`), so a
deploy applies them. That is convenient and it means **a bad migration takes
the deploy with it**: the service will not start.

```sh
cd backend
alembic current           # what is applied
alembic history           # what exists
alembic downgrade -1      # undo the last one
```

Downgrading production means pointing `DATABASE_URL` at the production
database from your machine and running it deliberately. Read the migration
first: autogenerate is reliable for added tables and columns and unreliable for
renames, where it emits a drop plus an add and destroys that column's data.

There is only ever one migration head — CI enforces it. If a merge produces
two, rebase and re-point your migration's `down_revision`.

## Rotating a secret

Set the new value in Railway's service variables and redeploy. The blast radius
differs sharply per secret — read before rotating.

| Secret | Effect of rotating |
|---|---|
| `GEMINI_API_KEY` | None visible. AI features fail until the new key is live. |
| `AZURE_SPEECH_KEY` | None visible. Spoken reminders fail until the new key is live. |
| `RESEND_API_KEY` | Verification and reset emails fail until the new key is live. |
| `JWT_SECRET` | **Logs out every user on the platform.** Every issued token becomes unverifiable. Do this only for a suspected secret compromise. |
| `TOKEN_ENCRYPTION_KEY` | **Permanently destroys every stored Google and Microsoft calendar connection.** See below. |
| `DATABASE_URL` | Railway manages this. Do not hand-edit it. |

### TOKEN_ENCRYPTION_KEY is not reversible

Connected-calendar OAuth tokens are Fernet-encrypted with this key. Rotating it
does not re-encrypt anything — the old values simply stop decrypting, and
`crypto.decrypt` raises for every one of them. Every affected user must
disconnect and reconnect their calendar in Settings.

If you must rotate it (the key leaked), the honest sequence is: rotate, then
delete the now-unreadable connection rows so users get a clean "not connected"
state rather than a broken one, then tell them to reconnect.

```sql
DELETE FROM outlook_connections;
DELETE FROM google_calendar_connections;
```

### If a secret leaks

Rotate first, rewrite git history second. Anything pushed to a remote must be
assumed compromised even after a force-push. Then check whether it was ever
used: for `JWT_SECRET`, assume tokens were forgeable for the exposure window.

## Locking out one account, not everyone

To invalidate one user's sessions — a stolen device, a suspicious login — bump
their `token_version` instead of touching `JWT_SECRET`:

```sql
UPDATE users SET token_version = token_version + 1 WHERE email = 'them@example.com';
```

Every token issued to that account before this stops working on its next
request. The user can also do this themselves from
**Profile → Account → Log out of other devices**.

## Common failures

**The service will not start.** Almost always a bad import or a failed
migration. Railway's deploy log has the traceback. CI runs an import smoke test
and a single-head migration check on every pull request precisely to stop these
reaching production, so a failure here usually means something merged that
bypassed CI, or an environment variable is missing in Railway that exists
locally.

**`JWT_SECRET is still the built-in default`, and the service refuses to
start.** Deliberate: `app/config.py` refuses to boot on Railway with the
default signing key, because that key is public and tokens would be forgeable.
Set a real one:
`python -c "import secrets; print(secrets.token_hex(32))"`.

**Database unreachable.** `/api/health/ready` returns `503` with
`"database":"unreachable"`. Check the Postgres service in Railway is running
and that `DATABASE_URL` is still injected into the backend service.

**AI features return "hit the Gemini rate limit".** Upstream quota, not a bug.
It surfaces as a `429` from Gemini and the app translates it. Wait, or raise the
quota in Google AI Studio.

**Users report notifications not arriving.** Reminders are local notifications
scheduled on the device, not pushed from the server — so this is a client-side
problem, and nothing in the backend logs will show it. Check the OS-level
notification permission first.

**Everything looks fine but users report errors.** Get the `X-Request-ID` from
them if you can (it is on every response), and search the logs for it. Every
log line produced while handling that request carries it.

## Where to look

| Question | Where |
|---|---|
| Is it deployed, and did it start? | Railway deploy log |
| What broke, with a stack trace | Sentry, filtered by release |
| What happened during one request | Logs, filtered by the request id |
| Is the database reachable right now | `GET /api/health/ready` |
| Did CI actually pass on this commit | GitHub Actions |

## What is missing from this runbook

Stated rather than pretended:

- **No documented database backup or restore.** Railway takes its own backups;
  nobody here has tested restoring one. Until someone does, treat the restore
  path as unverified.
- **No staging environment.** `main` deploys straight to production, so a
  change is verified in production or not at all.
- **No alerting.** Sentry records errors; nothing pages anyone. You find out
  when you look, or when a user tells you.
