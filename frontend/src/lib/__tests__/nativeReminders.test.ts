import { beforeEach, describe, expect, it, vi } from "vitest";

// The reminder scheduler's failure modes are all timing-shaped and only show
// up on a real phone hours later, which makes them exactly the thing to pin
// down here: a reminder that fires late, fires for a deleted task, or silently
// never fires at all.

const schedule = vi.fn();
const cancel = vi.fn();
const getPending = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    schedule: (...a: unknown[]) => schedule(...a),
    cancel: (...a: unknown[]) => cancel(...a),
    getPending: () => getPending(),
    requestPermissions: async () => ({ display: "granted" }),
    checkPermissions: async () => ({ display: "granted" }),
    createChannel: async () => {},
    registerActionTypes: async () => {},
    addListener: async () => {},
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { getUri: async () => ({ uri: "file:///sound.wav" }) },
  Directory: { Library: "LIBRARY" },
}));
vi.mock("@/lib/nativeTts", () => ({
  ReminderTts: {
    scheduleBatch: async () => {},
    isBatteryExempt: async () => ({ granted: true }),
    isExactAlarmAllowed: async () => ({ granted: true }),
  },
}));
vi.mock("@/lib/reminderAudio", () => ({
  lookupReminderSounds: () => new Map(),
  prepareReminderSounds: async () => new Map(),
  SOUND_DIR: "sounds",
}));
vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ voiceEnabled: false, remindersEnabled: true }) },
}));

const reminder = (key: string, fireAt: number) => ({
  key,
  title: `Task ${key}`,
  body: "Starts at 18:30",
  speech: `time for ${key}`,
  fireAt,
  data: { key, kind: "task" as const, id: key, date: "2026-09-21" },
});

// Drives one debounced sync to completion.
async function sync(
  mod: typeof import("@/lib/nativeReminders"),
  items: ReturnType<typeof reminder>[]
) {
  mod.syncNativeReminders(items);
  await vi.advanceTimersByTimeAsync(600);
}

async function load() {
  vi.resetModules();
  const mod = await import("@/lib/nativeReminders");
  await mod.requestNativeNotifyPermission();
  return mod;
}

describe("native reminder scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    schedule.mockClear();
    cancel.mockClear();
    getPending.mockReset();
    getPending.mockResolvedValue({ notifications: [] });
  });

  it("asks Android for a wakeup alarm that survives Doze", async () => {
    const mod = await load();
    const fireAt = Date.now() + 60_000;
    await sync(mod, [reminder("a", fireAt)]);

    const [{ notifications }] = schedule.mock.calls[0];
    // Without allowWhileIdle the plugin uses setExact(AlarmManager.RTC, ...),
    // which does not wake the device and which Doze defers — the reason an
    // 18:30 reminder could arrive at 20:00, or a day late.
    expect(notifications[0].schedule).toEqual({
      at: new Date(fireAt),
      allowWhileIdle: true,
    });
  });

  it("never hands the OS a fire time that has already passed", async () => {
    const mod = await load();
    await sync(mod, [
      reminder("past", Date.now() - 30_000),
      reminder("future", Date.now() + 60_000),
    ]);

    const scheduled = schedule.mock.calls.flatMap(([{ notifications }]) => notifications);
    expect(scheduled.map((n: { title: string }) => n.title)).toEqual(["Task future"]);
  });

  it("leaves a just-due reminder's alarm alone instead of cancelling it", async () => {
    const mod = await load();
    const justDue = reminder("due", Date.now() - 1_000);
    // The OS is holding it and is about to deliver it.
    getPending.mockResolvedValue({ notifications: [{ id: mod.notifId(justDue.key) }] });
    await sync(mod, [justDue]);

    // Cancelling here would swallow the reminder in its delivery window.
    expect(cancel).not.toHaveBeenCalled();
  });

  it("clears a notification left pending by an earlier app session", async () => {
    const mod = await load();
    const orphan = mod.notifId("task:deleted:2026-09-19:1110:0");
    // scheduledSignatures is empty on a fresh launch, so this is only
    // discoverable by asking the OS what it is actually holding.
    getPending.mockResolvedValue({ notifications: [{ id: orphan }] });
    await sync(mod, [reminder("live", Date.now() + 60_000)]);

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: orphan }] });
  });

  it("does not touch coach check-ins, which own the negative id space", async () => {
    const mod = await load();
    getPending.mockResolvedValue({ notifications: [{ id: -42 }] });
    await sync(mod, [reminder("live", Date.now() + 60_000)]);

    expect(cancel).not.toHaveBeenCalled();
  });

  it("retries a reminder the OS refused rather than recording it as scheduled", async () => {
    const mod = await load();
    const item = reminder("refused", Date.now() + 60_000);
    // Plugin-level rejection: schedule() resolves, but the id never appears in
    // the pending list. Recording it would make the signature diff skip it for
    // good, and the reminder would silently never fire.
    getPending.mockResolvedValue({ notifications: [] });
    await sync(mod, [item]);
    expect(schedule).toHaveBeenCalledTimes(1);

    await sync(mod, [item]);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it("does not reschedule a reminder the OS is already holding unchanged", async () => {
    const mod = await load();
    const item = reminder("stable", Date.now() + 60_000);
    getPending.mockResolvedValue({ notifications: [{ id: mod.notifId(item.key) }] });
    await sync(mod, [item]);
    expect(schedule).toHaveBeenCalledTimes(1);

    await sync(mod, [item]);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
