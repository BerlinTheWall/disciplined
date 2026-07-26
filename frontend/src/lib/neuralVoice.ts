// On-device neural text-to-speech: a single Piper (VITS) voice, synthesized
// fully locally via ONNX Runtime Web's WASM backend after a one-time model
// download (~60MB, cached in the browser's Origin Private File System). Once
// downloaded it needs no network and costs nothing per use — unlike the
// Gemini-backed natural voice (see useSpeech.ts), which is a live API call
// every time. Everything here is dynamically imported so the ~1MB of ONNX
// Runtime glue code never loads for users who don't turn this on.

import type { Progress, TtsSession as TtsSessionType, VoiceId } from "@mintplex-labs/piper-tts-web";

// hfc_female is Piper's reference "medium" quality English voice — good
// balance of naturalness vs. download size (other medium voices are similar).
const VOICE_ID: VoiceId = "en_US-hfc_female-medium";

// piper-tts-web's default wasmPaths.onnxWasm points at cdnjs, which does not
// actually mirror this file for onnxruntime-web — confirmed by hand (a plain
// 404 on the exact URL it builds), not a platform-specific quirk. jsdelivr
// mirrors npm directly instead, so point there at the exact version this app
// installs. Keep this version and the onnxruntime-web dependency version in
// package.json in lockstep: bumping one without the other 404s the same way.
const ONNX_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";

export const neuralVoiceSupported =
  typeof window !== "undefined" &&
  typeof WebAssembly !== "undefined" &&
  typeof navigator !== "undefined" &&
  "storage" in navigator &&
  "getDirectory" in navigator.storage;

// piper-tts-web sets ort.env.wasm.numThreads = navigator.hardwareConcurrency
// on first use, which only actually works under cross-origin isolation
// (SharedArrayBuffer) — COOP/COEP headers the packaged iOS app's WKWebView
// has no reliable way to set on its bundled assets. Pin it to 1 first so
// ONNX Runtime falls back to (slower, but working) single-threaded WASM
// instead of silently failing to spin up worker threads. Idempotent: the
// getter/setter trap survives, later writes are just ignored.
let threadsPinned: Promise<void> | null = null;
function pinSingleThread(): Promise<void> {
  threadsPinned ??= import("onnxruntime-web").then((ort) => {
    Object.defineProperty(ort.env.wasm, "numThreads", {
      configurable: true,
      get: () => 1,
      set: () => {},
    });
  });
  return threadsPinned;
}

export async function isNeuralVoiceDownloaded(): Promise<boolean> {
  if (!neuralVoiceSupported) return false;
  const { stored } = await import("@mintplex-labs/piper-tts-web");
  return (await stored()).includes(VOICE_ID);
}

export async function downloadNeuralVoice(onProgress?: (fraction: number) => void): Promise<void> {
  await pinSingleThread();
  const { download } = await import("@mintplex-labs/piper-tts-web");
  await download(VOICE_ID, (p: Progress) => {
    if (p.total) onProgress?.(p.loaded / p.total);
  });
}

export async function removeNeuralVoice(): Promise<void> {
  const { remove } = await import("@mintplex-labs/piper-tts-web");
  await remove(VOICE_ID);
}

// A singleton session, created once with the wasmPaths override above (the
// TtsSession class itself also singletons internally — see the library
// source — so this just avoids re-awaiting the dynamic import every call).
let sessionPromise: Promise<TtsSessionType> | null = null;
async function createSession(): Promise<TtsSessionType> {
  await pinSingleThread();
  const { TtsSession, WASM_BASE } = await import("@mintplex-labs/piper-tts-web");
  return TtsSession.create({
    voiceId: VOICE_ID,
    wasmPaths: {
      onnxWasm: ONNX_WASM_BASE,
      piperData: `${WASM_BASE}.data`,
      piperWasm: `${WASM_BASE}.wasm`,
    },
  });
}
function getSession(): Promise<TtsSessionType> {
  sessionPromise ??= createSession();
  return sessionPromise;
}

// TtsSession's init (model load + InferenceSession.create) occasionally
// fails right after a *just-finished* download — looks like a browser OPFS
// write/read timing race (the exact same file read moments later always
// succeeds), not a deterministic bug. piper-tts-web caches a failed session
// forever in its own internal static singleton (TtsSession._instance is
// assigned in the constructor before init() even resolves), so a plain retry
// would just hand back the same broken instance — reset that too.
async function resetSession(): Promise<void> {
  sessionPromise = null;
  const { TtsSession } = await import("@mintplex-labs/piper-tts-web");
  TtsSession._instance = null;
}

// Recently synthesized clips, keyed by exact text — same pattern as
// useSpeech.ts's natural-voice cache, so a replayed reminder/briefing line
// skips inference entirely instead of re-running the model.
const cache = new Map<string, Blob>();
const CACHE_MAX = 16;

// Synthesizes `text` with the on-device voice. Resolves null (never throws)
// when the feature isn't supported, the model isn't downloaded yet, or
// inference fails twice in a row — every caller treats this as "not
// available right now" and falls through to the next voice tier, same as
// the natural-voice path.
export async function synthesizeNeuralVoice(text: string): Promise<Blob | null> {
  const cached = cache.get(text);
  if (cached) return cached;
  if (!(await isNeuralVoiceDownloaded())) return null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const session = await getSession();
      const blob = await session.predict(text);
      cache.set(text, blob);
      while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value!;
        cache.delete(oldest);
      }
      return blob;
    } catch (e) {
      if (attempt === 2) {
        console.warn("[neuralVoice] synthesis failed", e);
        return null;
      }
      console.warn("[neuralVoice] synthesis failed, retrying once", e);
      await resetSession();
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return null;
}
