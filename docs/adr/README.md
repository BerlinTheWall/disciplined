# Architecture decision records

One file per decision that was **non-obvious and expensive to revisit**. Not a
log of everything that changed — the git history already does that, and better.

The test for whether something belongs here: in six months, will someone look
at this and ask "why on earth is it done that way?" If the answer is in the
diff, it does not need an ADR. If the answer is a trade-off that was weighed
and settled, it does.

Each record states the context, the decision, what it costs, and what would
make us change our mind. They are not updated as the world moves on: a
superseded ADR gets a note at the top pointing at the one that replaced it, so
the reasoning chain stays readable.

| # | Decision | Date |
|---|---|---|
| [0001](0001-lf-line-endings.md) | Enforce LF line endings repo-wide | 2026-09-09 |
| [0002](0002-sqlite-locally-postgres-in-ci.md) | Test on SQLite locally, Postgres in CI | 2026-09-10 |
| [0003](0003-error-reporting-privacy-posture.md) | What error reports may and may not contain | 2026-09-10 |
| [0004](0004-account-deletion.md) | Hard-delete accounts, with the table list derived from metadata | 2026-09-10 |
