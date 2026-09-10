## What and why

<!-- What changes, and the reason it needs to. Link the issue if there is one:
     Closes #123 -->

## How to test it

<!-- The steps a reviewer follows to see this working. Be specific: which
     screen, which account state, what to look for. "Tested locally" is not
     testable by anyone else. -->

1.

## Checklist

- [ ] `npm run ci` (frontend) and `python -m pytest -q` (backend) pass locally
- [ ] Tested on a device or simulator — required for UI, notifications, speech
      or calendar changes, which the web dev server does not exercise
- [ ] New behaviour has a test, or I have said below why it does not
- [ ] Schema change has a reviewed Alembic migration, single head
- [ ] No secret, key or token in a tracked file
- [ ] README / backend README updated if setup or the API changed

## Screenshots

<!-- Before and after for anything visual. Delete this section if not. -->

## Anything reviewers should know

<!-- Trade-offs taken, things deliberately left out, follow-up work. Delete if
     there is nothing. -->
