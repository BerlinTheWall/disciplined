import * as Sentry from "@sentry/react";

/**
 * Client-side error reporting.
 *
 * Disabled unless VITE_SENTRY_DSN is set, so dev, CI and anyone building this
 * from source get no reporting and no network calls.
 *
 * What this deliberately does NOT do:
 *
 *  - No Session Replay. Replay records the DOM, and this app's DOM is the
 *    user's calendar, goals and chat with the assistant. That is the most
 *    personal data the product holds and it is not going to a third party to
 *    make a bug slightly easier to reproduce.
 *  - No PII. sendDefaultPii stays false (no email, no IP address), and the
 *    user is identified by opaque account id only — enough to see that one
 *    account hit an error fifty times, not enough to know who they are.
 *  - No console breadcrumbs. console.log lines in this app quote assistant
 *    replies and task titles.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN;

export const errorReportingEnabled = Boolean(DSN);

/** Strip anything after "?" — an OAuth callback carries `code` and `state`. */
function stripQuery(url: string): string {
  const cut = url.indexOf("?");
  return cut === -1 ? url : `${url.slice(0, cut)}?[stripped]`;
}

export function initErrorReporting(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // "" when the build could not resolve a commit; undefined leaves the
    // event unversioned rather than tagging it with an empty string.
    release: __APP_RELEASE__ || undefined,
    sendDefaultPii: false,
    // Performance tracing is billed per transaction and answers a question
    // nobody is asking yet.
    tracesSampleRate: 0,
    integrations: (defaults) =>
      // The default set includes a console integration that turns every
      // console.* call into a breadcrumb attached to the next error.
      defaults.filter((integration) => integration.name !== "Console"),
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "console") return null;
      // fetch/xhr breadcrumbs carry the full URL.
      if (typeof breadcrumb.data?.url === "string") {
        breadcrumb.data.url = stripQuery(breadcrumb.data.url);
      }
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = stripQuery(event.request.url);
      // Never ship the request body: on this API that is a chat message,
      // a goal, or someone's schedule.
      if (event.request) delete event.request.data;
      return event;
    },
  });
}

/**
 * Tie subsequent errors to an account without identifying the person.
 * Pass null on logout so the next user's errors are not attributed to the
 * previous one on a shared device.
 */
export function setReportingUser(userId: string | null): void {
  if (!DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Report an error explicitly, for the paths where the app catches a failure
 * and handles it rather than letting it reach the error boundary.
 *
 * A no-op without a DSN, so callers never have to check.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    // Without a reporter, at least make it visible to whoever is looking at
    // a dev console instead of swallowing it.
    if (import.meta.env.DEV) console.error("[error]", error, context ?? "");
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
