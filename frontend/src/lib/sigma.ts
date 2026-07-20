// Motivation for Sigma Mode. Deep, aggressive lines barked over the device
// voice and flashed on screen.

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
