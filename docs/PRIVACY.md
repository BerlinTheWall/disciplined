> **Draft — not yet legally reviewed, and not yet published.**
>
> This was written from what the code actually does, table by table and
> third-party call by third-party call, so the facts in it are accurate as of
> the date below. It is not legal advice, and it is not a substitute for a
> lawyer reading it against the jurisdictions you operate in (GDPR, UK GDPR,
> CCPA and the App Store / Play Store policies all impose specific wording and
> rights you may need beyond this).
>
> **Four values still need filling** — they are marked in capitals inside square brackets below:
> the postal address, the contact email, the governing jurisdiction and the
> liability cap. The Pages workflow refuses to publish while any of them
> remain, so this cannot reach a public URL half-finished.

> Once a lawyer has read it and the values are in, delete this block. That is
> the switch that publishes it to
> `https://berlinthewall.github.io/disciplined/privacy`.

# Privacy Policy for Disciplined

**Last updated: 10 September 2026**

Disciplined is a personal scheduling assistant. This policy explains what it
collects, why, who else sees it, and how to get rid of it.

The short version: your schedule is stored so the app can show it to you on
your devices, some of it is sent to AI providers to produce the features you
asked for, none of it is sold, and you can delete all of it from inside the
app at any time.

## Who we are

Disciplined is operated by **Hooman Shahidi**,
**[POSTAL ADDRESS]**. For any privacy question, or to exercise the rights
below, contact **[PRIVACY CONTACT EMAIL]**.

## What we collect

**Account information.** Your email address, a hashed version of your password
(we never store the password itself), your name and display name, your time
zone, the date you signed up, whether your email is verified, and your
subscription tier. If you answer the optional "what best describes you"
question during onboarding, we store that answer.

**Your content.** The things you create in the app: scheduled events and tasks
(title, date, time, duration, priority, reminders, completion), habits (name,
which days, which days you completed or skipped), goals (title, description,
milestones, weighting, progress) and interests.

**Connected calendars.** If you connect a Google or Microsoft account, we store
the access and refresh tokens that authorise us to read and write that
calendar, and the email address of the connected account. **These tokens are
encrypted at rest.** We use them only to sync calendar events between that
account and Disciplined.

**Security and abuse-prevention data.** Failed login counts and lockout
timestamps, and short-lived numeric codes sent to your email for verification
and password resets.

**Usage counters.** Aggregate counts used to enforce plan limits: characters of
speech synthesised this month, daily briefings generated today, and assistant
messages sent today. These are counts, not content.

**Device permissions you grant.** The app may ask for access to your calendar,
to send notifications, and to your microphone for voice capture. Speech
recognition runs on your device; we receive the resulting text, not the audio.

### What we do not collect

We do not use advertising or analytics trackers. We do not collect your
location, contacts, photos, or browsing activity. We do not store your
conversations with the assistant on our servers — the conversation lives on
your device and is sent with each request only so the assistant has context.

## Why we use it, and on what basis

| Purpose | Data used | Legal basis (GDPR) |
|---|---|---|
| Provide the app: store and show your schedule | Account info, your content | Performance of a contract |
| AI features: planning, milestones, briefings, chat | Your content, your message | Performance of a contract |
| Calendar sync | Connected-calendar tokens, events | Performance of a contract |
| Sign-in, verification and password reset emails | Email address, codes | Performance of a contract |
| Prevent brute-force attacks and abuse | Failed login counts, usage counters | Legitimate interests |
| Diagnose crashes and errors | Technical error data (see below) | Legitimate interests |

## Who else sees it

We do not sell your data and we do not share it for advertising. We share the
minimum necessary with these processors:

| Provider | What it receives | Why |
|---|---|---|
| **Google (Gemini API)** | The text of your assistant messages, and the schedule, goal or habit content relevant to the request | To generate plans, milestones, briefings and replies |
| **Microsoft Azure (AI Speech)** | The text to be spoken aloud | To produce spoken reminders and replies |
| **Google Calendar / Microsoft Graph** | Event data you choose to sync | To sync your connected calendar |
| **Resend** | Your email address and the message body | To send verification and password-reset email |
| **Railway** | All stored data, as our hosting and database provider | To run the service |
| **Sentry** | Technical error reports | To diagnose crashes |

Error reports are deliberately stripped: they never include request bodies (so
never your messages, goals or schedule), authentication headers, cookies or
URL query strings, and they identify you only by an opaque account
identifier — never your email address or IP. We do not use session replay.

These providers process data on our behalf under their own terms. Some are
located outside your country; transfers out of the EEA/UK rely on the
providers' Standard Contractual Clauses.

## How long we keep it

Your content is kept until you delete it or delete your account. Email
verification and reset codes expire shortly after they are issued. Usage
counters are kept per month or per day as described above.

When you delete your account we remove your account record and every row
associated with it — schedule, habits, goals, interests, connected-calendar
tokens and usage counters — permanently and immediately. This is not a flag on
a retained record. Deleting the stored tokens ends our access to your connected
calendars; you can also revoke the grant from your Google or Microsoft account
settings.

Backups taken by our hosting provider may retain data for a short period after
deletion before rotating out.

## Your rights

Depending on where you live, you may have the right to access, correct, export,
delete or restrict processing of your data, to object to processing based on
legitimate interests, and to complain to your data protection authority.

You can exercise the two most important of these immediately, in the app:

- **Correct** your name and profile from the Profile screen.
- **Delete everything** from **Profile → Account → Delete account**. This is
  permanent and takes effect at once.

For anything else — including a copy of your data — contact
**[PRIVACY CONTACT EMAIL]** and we will respond within 30 days.

## Security

Passwords are hashed with bcrypt and never stored in readable form. Connected
calendar tokens are encrypted at rest. All traffic between the app and our
servers uses HTTPS. Access tokens can be invalidated across every device at
once from **Profile → Account → Log out of other devices**.

No system is perfectly secure, but if a breach affects you we will notify you
and the relevant authority as required by law.

## Children

Disciplined is not directed at children under **[13 / 16 — CHECK YOUR
JURISDICTION]** and we do not knowingly collect their data. If you believe a
child has created an account, contact us and we will delete it.

## Changes

If we change this policy materially we will update the date above and notify
you in the app before the change takes effect.

## Contact

**[PRIVACY CONTACT EMAIL]**
