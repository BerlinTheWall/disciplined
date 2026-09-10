# 0001 — Enforce LF line endings repo-wide

**Date:** 2026-09-09 · **Status:** Accepted

## Context

The git index had always stored LF. A global `core.autocrlf=true` converted
that to CRLF in the Windows working tree, and Prettier was configured
`endOfLine: "crlf"` to match what the developer saw locally.

Those two facts cannot both hold once anything runs on Linux. A CI checkout
gets LF from the index, Prettier demands CRLF, and **every one of the 281
tracked text files fails the format check**. Locally the situation was already
degrading: files written by tooling arrived with LF and never went through a
checkout, so 962 `Insert CR` lint errors had accumulated across six files.

This blocked adding CI at all, which is why it was fixed first.

## Decision

`.gitattributes` sets `* text=auto eol=lf`, which overrides `core.autocrlf` and
makes the working tree LF on every platform. Prettier is set to
`endOfLine: "lf"`. Windows script types (`.bat`, `.cmd`, `.ps1`) keep CRLF
explicitly, because they need it to run.

## Consequences

The conversion touched 172 files and changed **zero bytes of content** — the
index already held LF, so the blobs were byte-identical before and after
(verified by comparing object hashes, not by eyeballing the diff).

The cost is that a contributor whose editor is configured to write CRLF will
see spurious diffs. `.gitattributes` normalises on commit, so the damage is
contained, and `CONTRIBUTING.md` says not to "fix" this by changing
`core.autocrlf`.

## What would change our mind

Nothing realistic. The alternative — `endOfLine: "auto"` — makes Prettier
accept whatever it finds, which means the repo silently accumulates a mix of
both and the question comes back the first time anyone diffs across platforms.
