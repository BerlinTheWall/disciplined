import { registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

import { api } from "./api";
import { useSettingsStore } from "@/store/settingsStore";

// Local native plugin (vendor/reminder-voice): renders the iOS device voice
// straight into Library/Sounds — the natural-sounding offline fallback.
interface ReminderVoicePlugin {
  synthesizeToSound(options: {
    text: string;
    fileName: string;
    language?: string;
    rate?: number;
  }): Promise<{ fileName: string }>;
}
const ReminderVoice = registerPlugin<ReminderVoicePlugin>("ReminderVoice");

// Spoken notification sounds for the packaged iOS app.
//
// iOS never runs app code when a notification is delivered, so live TTS is
// impossible with the app closed. Instead, while the app is open, each
// upcoming reminder's spoken line is synthesized by the backend (24kHz 16-bit
// PCM WAV — a format UNNotificationSound accepts) and saved under the app's
// Library/Sounds directory, which is exactly where iOS resolves notification
// sound names. The notification is then scheduled with that file as its
// sound: when it fires, the phone speaks the reminder through the speaker.
//
// Files are cached by a hash of the spoken text (the line is deterministic
// per reminder — see assistantReminderLine's variantSeed) and pruned once no
// scheduled reminder references them.

// Library/Sounds — the location UNNotificationSound(named:) searches after
// the app bundle.
const SOUND_DIR = "Sounds";
// localStorage index of synthesized files: { [textHash]: filename }.
const INDEX_KEY = "disciplined-reminder-sounds";
// Notification sounds cap at 30s; the backend line is one sentence, but guard
// anyway — synthesis time and file size both grow with text length.
const MAX_TEXT_CHARS = 300;
// After the natural (Gemini) voice fails once, skip it for a while instead of
// paying its timeout on every line of every sync; robot-voiced files are
// upgraded once it recovers.
const NATURAL_RETRY_COOLDOWN_MS = 10 * 60_000;
let naturalFailedAt = 0;

// The natural voice, when the setting allows and it isn't cooling down.
async function naturalWav(text: string): Promise<Blob | null> {
  if (!useSettingsStore.getState().naturalVoice) return null;
  if (Date.now() - naturalFailedAt < NATURAL_RETRY_COOLDOWN_MS) return null;
  try {
    return await api.tts(text, 20_000);
  } catch (e) {
    naturalFailedAt = Date.now();
    console.warn("[reminders] natural voice unavailable, using offline voice", e);
    return null;
  }
}

// Fallback-voiced files carry a -d suffix (device voice; -r was the retired
// robot voice) so a later sync can tell them apart and upgrade them to the
// natural voice when it's available again.
const isFallbackFile = (filename: string) =>
  filename.endsWith("-d.caf") || filename.endsWith("-r.wav");
const canTryNatural = () =>
  useSettingsStore.getState().naturalVoice &&
  Date.now() - naturalFailedAt >= NATURAL_RETRY_COOLDOWN_MS;

function textHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

type SoundIndex = Record<string, string>;

function loadIndex(): SoundIndex {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}") as SoundIndex;
  } catch {
    return {};
  }
}

function saveIndex(index: SoundIndex) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // result is a data: URL; the payload after the comma is the base64 body.
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error as Error);
    reader.readAsDataURL(blob);
  });
}

// One synthesis per text at a time, across overlapping syncs.
const inFlight = new Map<string, Promise<string | null>>();

async function ensureSound(text: string, hash: string): Promise<string | null> {
  try {
    const line = text.slice(0, MAX_TEXT_CHARS);
    const natural = await naturalWav(line);
    if (natural) {
      const filename = `rem-${hash}.wav`;
      await Filesystem.writeFile({
        path: `${SOUND_DIR}/${filename}`,
        data: await blobToBase64(natural),
        directory: Directory.Library,
        recursive: true,
      });
      return filename;
    }
    // Device-voice fallback, rendered natively straight into Library/Sounds.
    const filename = `rem-${hash}-d.caf`;
    await ReminderVoice.synthesizeToSound({
      text: line,
      fileName: filename,
      language: navigator.language || undefined,
    });
    return filename;
  } catch (e) {
    console.warn("[reminders] sound synthesis failed", e);
    return null; // scheduled with the default sound; next sync retries
  }
}

// Cache-only lookup: text -> filename for lines whose audio already exists.
// Synchronous and instant — used to schedule immediately before synthesis.
export function lookupReminderSounds(lines: string[]): Map<string, string> {
  const index = loadIndex();
  const ready = new Map<string, string>();
  for (const text of lines) {
    const hash = textHash(text);
    if (index[hash]) ready.set(text, index[hash]);
  }
  return ready;
}

// Ensure spoken audio exists for the given lines (nearest reminders first).
// Returns text -> filename for every line that has a ready file. Lines beyond
// `limit` are skipped this pass — they move up as their date approaches.
export async function prepareReminderSounds(
  lines: string[],
  limit = 20
): Promise<Map<string, string>> {
  const index = loadIndex();
  const ready = new Map<string, string>();
  const wanted = new Set<string>();

  let prepared = 0;
  for (const text of lines) {
    const hash = textHash(text);
    wanted.add(hash);
    const existing = index[hash];
    // A natural-voice file is final; a fallback-voiced one still works but
    // gets re-synthesized (upgraded) when the natural voice is back.
    if (existing && (!isFallbackFile(existing) || !canTryNatural())) {
      ready.set(text, existing);
      continue;
    }
    if (prepared >= limit) {
      if (existing) ready.set(text, existing);
      continue;
    }
    prepared++;
    let job = inFlight.get(hash);
    if (!job) {
      job = ensureSound(text, hash).finally(() => inFlight.delete(hash));
      inFlight.set(hash, job);
    }
    const filename = await job;
    if (filename) {
      if (existing && existing !== filename) {
        void Filesystem.deleteFile({
          path: `${SOUND_DIR}/${existing}`,
          directory: Directory.Library,
        }).catch(() => undefined);
      }
      index[hash] = filename;
      ready.set(text, filename);
    } else if (existing) {
      ready.set(text, existing);
    }
  }

  // Drop files no scheduled reminder references anymore.
  for (const [hash, filename] of Object.entries(index)) {
    if (wanted.has(hash)) continue;
    delete index[hash];
    void Filesystem.deleteFile({
      path: `${SOUND_DIR}/${filename}`,
      directory: Directory.Library,
    }).catch(() => undefined);
  }

  saveIndex(index);
  return ready;
}
