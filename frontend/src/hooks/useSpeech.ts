import { useEffect, useRef, useState } from "react";
import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { create } from "zustand";

import { api } from "@/lib/api";
import { useSettingsStore } from "@/store/settingsStore";

// Voice input/output. Speech-to-text has two implementations behind one hook:
// the browser's SpeechRecognition API (Chrome/Edge/Safari; Firefox lacks it),
// and — in the packaged iOS app, where WKWebView has no Web Speech API at
// all — the OS speech recognizer via @capacitor-community/speech-recognition.
// Text-to-speech uses speechSynthesis, which WKWebView does support.
// SpeechRecognition is missing from TypeScript's DOM lib, so the minimal
// surface we use is declared here.

const isNativeSpeech = Capacitor.isNativePlatform();

interface SRAlternative {
  transcript: string;
}

interface SRResult {
  isFinal: boolean;
  [index: number]: SRAlternative;
}

interface SREvent {
  results: { length: number; [index: number]: SRResult };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SRConstructor = new () => SpeechRecognitionLike;

const SpeechRecognitionCtor: SRConstructor | undefined =
  typeof window === "undefined"
    ? undefined
    : ((window as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor })
        .SpeechRecognition ??
      (window as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition);

export const speechInputSupported = isNativeSpeech || Boolean(SpeechRecognitionCtor);

interface SpeechHandlers {
  // Live partial transcript while the user is still talking.
  onInterim?: (text: string) => void;
  // The finished utterance.
  onFinal: (text: string) => void;
}

// How long of a pause ends a native utterance. The Web Speech API detects
// silence itself; iOS's recognizer keeps listening until told to stop, so the
// hook finalizes after a pause (short once something was heard, longer while
// still waiting for the first words).
const NATIVE_SILENCE_MS = 1_800;
const NATIVE_NO_SPEECH_MS = 6_000;

export function useSpeechRecognition(handlers: SpeechHandlers) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest handlers without re-creating the recognizer.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // ── Native (packaged iOS app) ──────────────────────────────────────
  const nativeActive = useRef(false);
  const nativeText = useRef("");
  const nativeListener = useRef<PluginListenerHandle | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function armSilenceTimer() {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(
      () => void nativeStop(true),
      nativeText.current ? NATIVE_SILENCE_MS : NATIVE_NO_SPEECH_MS
    );
  }

  async function nativeStart() {
    if (nativeActive.current) return;
    stopSpeaking(); // don't transcribe our own text-to-speech
    try {
      const perm = await NativeSpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") return;
    } catch (e) {
      // Typically "not implemented": the native plugin isn't in this build —
      // npm install + npx cap sync ios + rebuild in Xcode.
      console.warn("[speech] native permission request failed", e);
      return;
    }
    nativeActive.current = true;
    nativeText.current = "";
    nativeListener.current = await NativeSpeechRecognition.addListener("partialResults", (data) => {
      const text = data.matches?.[0] ?? "";
      if (!text) return;
      nativeText.current = text;
      handlersRef.current.onInterim?.(text);
      armSilenceTimer();
    });
    setListening(true);
    armSilenceTimer();
    void NativeSpeechRecognition.start({
      language: navigator.language || "en-US",
      maxResults: 3,
      partialResults: true,
      popup: false,
    }).catch((e) => {
      console.warn("[speech] native recognition failed", e);
      void nativeStop(false);
    });
  }

  async function nativeStop(fireFinal: boolean) {
    if (!nativeActive.current) return;
    nativeActive.current = false;
    clearTimeout(silenceTimer.current);
    try {
      await NativeSpeechRecognition.stop();
    } catch {
      // already stopped
    }
    void nativeListener.current?.remove();
    nativeListener.current = null;
    setListening(false);
    const text = nativeText.current.trim();
    nativeText.current = "";
    if (fireFinal && text) handlersRef.current.onFinal(text);
  }

  // ── Browser ────────────────────────────────────────────────────────
  function start() {
    if (isNativeSpeech) {
      void nativeStart();
      return;
    }
    if (!SpeechRecognitionCtor || recRef.current) return;
    stopSpeaking(); // don't transcribe our own text-to-speech
    const rec = new SpeechRecognitionCtor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false; // one utterance per tap
    rec.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final.trim()) handlersRef.current.onFinal(final.trim());
      else if (interim) handlersRef.current.onInterim?.(interim);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      // "no-speech", "not-allowed", … — onend fires right after and cleans up.
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stop() {
    // Tapping stop while native-listening sends what was heard so far.
    if (isNativeSpeech) {
      void nativeStop(true);
      return;
    }
    recRef.current?.stop();
  }

  useEffect(
    () => () => {
      recRef.current?.abort();
      if (nativeActive.current) void nativeStop(false);
    },
    []
  );

  return { supported: speechInputSupported, listening, start, stop };
}

export const speechOutputSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// The OS-provided voices. They load asynchronously in Chrome — empty on first
// call, then voiceschanged fires — so UI should use the useVoices hook below.
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechOutputSupported) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

// interrupt (default) replaces whatever is currently being spoken — right for
// chat replies. Pass interrupt: false to queue behind the current utterance
// instead, so back-to-back reminders don't cut each other off.
// The voice is the user's choice from Settings (voiceURI overrides it; the
// system default is used when unset or when the saved voice no longer exists).
export function speak(
  text: string,
  {
    interrupt = true,
    voiceURI,
    onDone,
    onStart,
  }: {
    interrupt?: boolean;
    voiceURI?: string | null;
    onDone?: () => void;
    onStart?: () => void;
  } = {}
) {
  if (!speechOutputSupported) {
    onDone?.();
    return;
  }
  if (interrupt) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const uri = voiceURI !== undefined ? voiceURI : useSettingsStore.getState().voiceURI;
  const voice = uri
    ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri)
    : undefined;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = navigator.language || "en-US";
  }
  if (onStart) utterance.onstart = onStart;
  if (onDone) {
    utterance.onend = onDone;
    utterance.onerror = onDone;
  }
  window.speechSynthesis.speak(utterance);
  // Chromium sometimes leaves the queue in a paused state for hidden tabs —
  // nudging resume() is harmless when playing and un-sticks it when not.
  window.speechSynthesis.resume();
}

// The natural-voice clip currently playing, so stopSpeaking can cut it off.
let currentAudio: HTMLAudioElement | null = null;

// A reusable audio element unlocked inside a user gesture. iOS (and strict
// mobile browsers) reject audio.play() outside a gesture on fresh elements —
// but an element that already played during a tap may be reused for playback
// that arrives seconds later (an assistant reply after its network round
// trip). primeAudioChannel() must be called synchronously from tap handlers
// that lead to delayed speech.
let audioChannel: HTMLAudioElement | null = null;
const SILENT_WAV =
  "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function primeAudioChannel() {
  if (typeof window === "undefined") return;
  if (!audioChannel) audioChannel = new Audio();
  // Only unlock when idle — don't cut off something already playing.
  if (audioChannel.paused) {
    audioChannel.src = SILENT_WAV;
    void audioChannel.play().catch(() => {});
  }
  // Unlock the fallback voice the same way (silent, zero-length utterance).
  if ("speechSynthesis" in window && !window.speechSynthesis.speaking) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  useSpeechState.setState({ pending: false, speaking: false });
}

// Recently synthesized clips, keyed by their exact text, so replays and
// prefetched briefings start instantly instead of waiting on generation.
const ttsCache = new Map<string, Blob>();
const ttsInFlight = new Map<string, Promise<Blob | null>>();
const TTS_CACHE_MAX = 8;

async function fetchSpeech(text: string, timeoutMs?: number): Promise<Blob | null> {
  const cached = ttsCache.get(text);
  if (cached) return cached;
  const inFlight = ttsInFlight.get(text);
  if (inFlight) return inFlight;

  const promise = api
    .tts(text, timeoutMs)
    .then((blob) => {
      ttsCache.set(text, blob);
      // Evict oldest entries; Maps iterate in insertion order.
      while (ttsCache.size > TTS_CACHE_MAX) {
        const oldest = ttsCache.keys().next().value!;
        ttsCache.delete(oldest);
      }
      return blob;
    })
    .catch(() => null)
    .finally(() => {
      ttsInFlight.delete(text);
    });
  ttsInFlight.set(text, promise);
  return promise;
}

// Warm the cache for text that's about to be spoken (e.g. the day briefing,
// generated while the page is still being looked at). No-op when the natural
// voice is off or the audio is already cached/being fetched.
export function prefetchAssistantVoice(text: string, timeoutMs = 30_000) {
  if (!useSettingsStore.getState().naturalVoice) return;
  void fetchSpeech(text, timeoutMs);
}

interface SpeakCallbacks {
  // Fired the moment audio is actually audible (playback started).
  onStart?: () => void;
  // Fired when playback finishes (not when stopped early via stopSpeaking).
  onDone?: () => void;
  timeoutMs?: number;
}

// Whether assistant speech is being prepared (synthesis/network) or playing —
// lets any component show a loader between "reply arrived" and "voice heard".
export const useSpeechState = create<{ pending: boolean; speaking: boolean }>(() => ({
  pending: false,
  speaking: false,
}));

// Fetches the human-like AI voice from the backend and plays it. Resolves true
// only once playback has started; any failure (offline server, missing key,
// blocked autoplay) resolves false so the caller can fall back.
async function playNaturalVoice(
  text: string,
  { onStart, onDone, timeoutMs }: SpeakCallbacks = {}
): Promise<boolean> {
  try {
    const blob = await fetchSpeech(text, timeoutMs);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    // Prefer the gesture-unlocked channel so playback works when this runs
    // long after the tap (mobile browsers block fresh elements there).
    const audio = audioChannel ?? new Audio();
    audio.src = url;
    const finish = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      audio.onended = null;
      onDone?.();
    };
    audio.onended = finish;
    await audio.play();
    currentAudio = audio;
    onStart?.();
    return true;
  } catch {
    return false;
  }
}

// Natural voice only, reporting whether audio actually started. Auto-play
// attempts (no user gesture) need this: Audio.play() rejects when the browser
// blocks unprompted sound, while the device-voice path fails silently.
export function speakNaturalOnly(text: string, onDone?: () => void): Promise<boolean> {
  if (!useSettingsStore.getState().naturalVoice) return Promise.resolve(false);
  return playNaturalVoice(text, { onDone, timeoutMs: 30_000 });
}

// Assistant speech: the natural (server) voice when enabled and reachable, the
// local device voice otherwise. Queued, so stacked reminders don't collide.
// Updates useSpeechState so UIs can show "preparing voice" / "speaking".
export async function speakAssistant(text: string, callbacks: SpeakCallbacks = {}) {
  const { onStart, onDone, timeoutMs } = callbacks;
  useSpeechState.setState({ pending: true });
  const wrapStart = () => {
    useSpeechState.setState({ pending: false, speaking: true });
    onStart?.();
  };
  const wrapDone = () => {
    useSpeechState.setState({ pending: false, speaking: false });
    onDone?.();
  };
  if (
    useSettingsStore.getState().naturalVoice &&
    (await playNaturalVoice(text, { onStart: wrapStart, onDone: wrapDone, timeoutMs }))
  ) {
    return;
  }
  speak(text, { interrupt: false, onStart: wrapStart, onDone: wrapDone });
}
