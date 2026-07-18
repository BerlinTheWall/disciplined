import { Directory, Filesystem } from "@capacitor/filesystem";

import { api } from "./api";

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
  const filename = `rem-${hash}.wav`;
  try {
    const wav = await api.tts(text.slice(0, MAX_TEXT_CHARS), 20_000);
    await Filesystem.writeFile({
      path: `${SOUND_DIR}/${filename}`,
      data: await blobToBase64(wav),
      directory: Directory.Library,
      recursive: true,
    });
    return filename;
  } catch (e) {
    console.warn("[reminders] sound synthesis failed", e);
    return null; // scheduled without a spoken sound; next sync retries
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
    if (index[hash]) {
      ready.set(text, index[hash]);
      continue;
    }
    if (prepared >= limit) continue;
    prepared++;
    let job = inFlight.get(hash);
    if (!job) {
      job = ensureSound(text, hash).finally(() => inFlight.delete(hash));
      inFlight.set(hash, job);
    }
    const filename = await job;
    if (filename) {
      index[hash] = filename;
      ready.set(text, filename);
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
