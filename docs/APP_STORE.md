# App Store & Play Store readiness

What the stores require, what is done, and what is still on you. Derived from
the code, so the privacy answers below match what the app actually does.

## Blockers

| Requirement | Status |
|---|---|
| In-app account deletion | **Done** — Profile → Account → Delete account (`POST /api/auth/delete-account`) |
| Privacy policy at a public URL | **Drafted**, not published — [PRIVACY.md](PRIVACY.md) |
| Terms of service at a public URL | **Drafted**, not published — [TERMS.md](TERMS.md) |
| Privacy questionnaire answers | Prepared below |
| iOS permission purpose strings | **Blocked** — no `ios/` project generated yet |
| Play restricted-permission declarations | **Needed** — see below |
| Screenshots, description, support URL | Not started |

Both stores require account deletion to be reachable *inside* the app for any
app that offers account creation — a support email is not sufficient, and this
is a common rejection. That part is now implemented and tested.

## Still on you

1. **Publish the two documents** at stable URLs (GitHub Pages, or your
   marketing site) and paste the links into App Store Connect and the Play
   Console. A file in this repository is not a URL the reviewer can open.
2. **Fill in every `[BRACKETED]` placeholder** in both documents: legal
   entity, address, contact email, minimum age, jurisdiction, liability cap.
3. **Have a lawyer read them.** They were written from the code, so the facts
   are right; the legal sufficiency for your jurisdiction is not something
   this repository can settle.
4. **Generate the iOS project and write its purpose strings.** There is no
   `ios/` directory in this repository yet — it is created by `npx cap add ios`
   on a Mac. Once it exists, `ios/App/App/Info.plist` needs
   `NSCalendarsUsageDescription`, `NSMicrophoneUsageDescription` and
   `NSSpeechRecognitionUsageDescription`. iOS rejects builds where these are
   missing, and reviewers reject generic ones — say what the app does with each
   and why, in a sentence a user would understand.
5. **Declare the restricted Android permissions** in the Play Console. The
   merged manifest requests two that Google gates behind a declaration form,
   and an undeclared one is a rejection:
   - `SCHEDULE_EXACT_ALARM` — justified here by reminders that must fire at the
     exact minute the user set.
   - `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — Google scrutinises this one
     closely; be ready to justify it or drop it.
6. **Decide the age rating** consistent with the minimum age in the policy.

### Android permissions, as actually requested

Most are merged in by the Capacitor plugins rather than written in
`android/app/src/main/AndroidManifest.xml`, so read the merged manifest, not
the source one, before answering any store question about permissions:

`INTERNET`, `READ_CALENDAR`, `WRITE_CALENDAR`, `RECORD_AUDIO` (speech capture,
merged from the speech plugin), `POST_NOTIFICATIONS` (merged from local
notifications), `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `DUMP`.

```sh
# regenerate and inspect
cd frontend && npx cap sync android
grep -oE 'android.permission.[A-Z_]+'   android/app/build/intermediates/merged_manifest/debug/*/AndroidManifest.xml | sort -u
```

## Privacy questionnaire answers

Both stores ask what you collect and whether it is linked to the user. From the
schema and the third-party calls:

| Category | Collected | Linked to user | Used for tracking |
|---|---|---|---|
| Contact info (email address) | Yes | Yes | No |
| Name | Yes | Yes | No |
| User content (schedule, goals, habits, assistant messages) | Yes | Yes | No |
| Identifiers (account ID) | Yes | Yes | No |
| Usage data (feature counters for plan limits) | Yes | Yes | No |
| Diagnostics (crash and error reports) | Yes | No — opaque account id only | No |
| Location, contacts, photos, browsing history, advertising data | No | — | — |

**Tracking: none.** There are no advertising or analytics SDKs, and nothing is
shared with data brokers, so App Tracking Transparency does not apply.

Purposes to declare: **App Functionality** for everything above, plus
**Analytics** only if you later add product analytics (there are none today).

Third parties that receive data — Google Gemini, Azure AI Speech, Google
Calendar, Microsoft Graph, Resend, Railway, Sentry — are processors acting on
our behalf, not independent controllers, and are listed in the privacy policy.

## Notes for the reviewer

Reviewers regularly reject apps whose main feature is behind a login they
cannot get past. Supply a working demo account in App Store Connect's review
notes, on the Pro tier, with some schedule and goal data already in it so the
AI features have something to work with.
