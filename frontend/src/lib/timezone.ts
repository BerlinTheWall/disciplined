// The device's current IANA zone (e.g. "America/New_York"). Sent at signup
// and re-checked on every launch/resume (see authStore's syncTimezone) so an
// account stays correct for someone who travels, without ever asking them.
export function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
