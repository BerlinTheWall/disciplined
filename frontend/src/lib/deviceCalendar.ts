import { Capacitor } from "@capacitor/core";
import {
  CalendarPermissionScope,
  CapacitorCalendar,
  type Calendar,
} from "@ebarooni/capacitor-calendar";

// Read/write access to the device's calendars (Apple/iCloud, Google, Outlook —
// whichever accounts the user has added in their phone's own Settings) via
// EventKit (iOS) / CalendarContract (Android). No web fallback exists —
// browsers have no calendar API — so every export here no-ops off-native,
// same shape as useSpeech.ts's native/web split but calendar access is
// native-only.

export const deviceCalendarSupported = Capacitor.isNativePlatform();

export type CalendarSourceLabel = "icloud" | "google" | "outlook" | "other";

// iOS reports a real source type (MOBILE_ME/EXCHANGE/CAL_DAV/...); Android
// only gives an account name string. Best-effort in both cases — used for
// display/grouping only, never relied on for correctness (see
// ExternalCalendarEvent.source_label on the backend).
export function sourceLabelFor(cal: Calendar): CalendarSourceLabel {
  const haystack =
    `${cal.source?.title ?? ""} ${cal.accountName ?? ""} ${cal.ownerAccount ?? ""}`.toLowerCase();
  // iOS source.type: 3 = MOBILE_ME (iCloud), 1 = EXCHANGE.
  if (cal.source?.type === 3 || haystack.includes("icloud")) return "icloud";
  if (
    cal.source?.type === 1 ||
    haystack.includes("outlook") ||
    haystack.includes("office365") ||
    haystack.includes("hotmail") ||
    haystack.includes("live.com")
  ) {
    return "outlook";
  }
  if (haystack.includes("gmail") || haystack.includes("google")) return "google";
  return "other";
}

export async function requestFullCalendarAccess(): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    const { result } = await CapacitorCalendar.requestFullCalendarAccess();
    return result === "granted";
  } catch (e) {
    // Typically "not implemented": the native plugin isn't in this build —
    // npm install + npx cap sync + rebuild.
    console.warn("[calendar] permission request failed", e);
    return false;
  }
}

export async function hasCalendarAccess(): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    const { result } = await CapacitorCalendar.checkPermission({
      scope: CalendarPermissionScope.READ_CALENDAR,
    });
    return result === "granted";
  } catch {
    return false;
  }
}

export async function listDeviceCalendars(): Promise<Calendar[]> {
  if (!deviceCalendarSupported) return [];
  const { result } = await CapacitorCalendar.listCalendars();
  return result;
}

export interface DeviceCalendarEvent {
  id: string;
  calendarId: string | null;
  title: string;
  location: string | null;
  startAt: string; // ISO datetime, UTC
  endAt: string;
  allDay: boolean;
}

// Every event across every calendar on the device in range — the plugin has
// no per-calendar variant, so callers that only want specific calendars
// (see deviceCalendarSync.ts) group/filter this by `calendarId` themselves
// rather than issuing one native call per calendar.
export async function listEventsInRange(
  fromMs: number,
  toMs: number
): Promise<DeviceCalendarEvent[]> {
  if (!deviceCalendarSupported) return [];
  const { result } = await CapacitorCalendar.listEventsInRange({ from: fromMs, to: toMs });
  return result.map((e) => ({
    id: e.id,
    calendarId: e.calendarId,
    title: e.title,
    location: e.location,
    startAt: new Date(e.startDate).toISOString(),
    endAt: new Date(e.endDate).toISOString(),
    allDay: e.isAllDay,
  }));
}

// Mirrors a disciplined Task onto the device's chosen write-calendar. Returns
// the native event id (to remember for the next update/delete) or null if it
// failed — best-effort, never blocks the caller (see deviceCalendarSync.ts).
export async function createDeviceEvent(
  calendarId: string,
  title: string,
  startAt: Date,
  endAt: Date
): Promise<string | null> {
  if (!deviceCalendarSupported) return null;
  try {
    const { id } = await CapacitorCalendar.createEvent({
      calendarId,
      title,
      startDate: startAt.getTime(),
      endDate: endAt.getTime(),
    });
    return id;
  } catch (e) {
    console.warn("[calendar] createEvent failed", e);
    return null;
  }
}

export async function updateDeviceEvent(
  eventId: string,
  title: string,
  startAt: Date,
  endAt: Date
): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    await CapacitorCalendar.modifyEvent({
      id: eventId,
      title,
      startDate: startAt.getTime(),
      endDate: endAt.getTime(),
    });
    return true;
  } catch (e) {
    console.warn("[calendar] modifyEvent failed", e);
    return false;
  }
}

export async function deleteDeviceEvent(eventId: string): Promise<boolean> {
  if (!deviceCalendarSupported) return false;
  try {
    await CapacitorCalendar.deleteEvent({ id: eventId });
    return true;
  } catch (e) {
    // Already gone (deleted directly in the calendar app) is fine — either
    // way, the caller should forget its mapping for this id.
    console.warn("[calendar] deleteEvent failed", e);
    return false;
  }
}
