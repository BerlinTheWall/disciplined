import { api } from "./api";

// Motivation for Sigma Mode. Deep, aggressive lines barked over Gemini's
// "sigma" voice preset (deep, gravelly, drill-sergeant delivery) and flashed
// on screen. Falls back to the device's local voice when the backend is
// unreachable — same "best-effort" pattern as reminder speech.

export const SIGMA_LINES = [
  "Who's gonna carry the boats?!",
  "Stay hard!",
  "You don't stop when you're tired. You stop when you're DONE.",
  "Get comfortable being uncomfortable.",
  "Nobody cares. Work harder.",
  "Discipline beats motivation. MOVE.",
  "Your excuses are lies you tell yourself.",
  "Callous your mind. Suffer now, win later.",
  "The only person stopping you is YOU.",
  "Take souls. Get after it.",
  "Do something your future self will thank you for.",
  "Motivation is garbage. Discipline is everything.",
  "You are capable of so much more. PROVE IT.",
  "Pain is your friend. Embrace it.",
  "They don't know you, SON!",
  "Stop scrolling. Start grinding.",
  "Comfort is the enemy. Attack the day.",
  "One more rep. One more page. One more mile.",
];

export function sigmaLine(): string {
  return SIGMA_LINES[Math.floor(Math.random() * SIGMA_LINES.length)];
}

// Synthesizes a line with Gemini's intense "sigma" voice preset. Throws on
// any failure (offline, backend down, quota) — callers fall back to
// speakHard(), same contract as the rest of the app's TTS call sites.
export async function synthesizeSigmaLine(text: string): Promise<Blob> {
  return api.tts(text, 12_000, "sigma");
}

// Speak a line with a low, forceful delivery on the device voice. Prefers a
// deep English voice when the OS offers one. Best-effort — silent if speech
// synthesis is unavailable or blocked.
export function speakHard(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 0.4;
    u.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const deep =
      voices.find(
        (v) =>
          /en/i.test(v.lang) &&
          /(daniel|arthur|aaron|fred|rishi|google uk english male|male)/i.test(v.name)
      ) ?? voices.find((v) => /en/i.test(v.lang));
    if (deep) u.voice = deep;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore — motivation is best-effort
  }
}
