import { create } from "zustand";
import { persist } from "zustand/middleware";

// The two Google Cloud TTS (Chirp3-HD) voices picked after listening at
// cloud.google.com/text-to-speech — same persona names Gemini's native TTS
// uses (Chirp3-HD shares that voice family).
export const GOOGLE_VOICES = [
  { id: "en-US-Chirp3-HD-Aoede", label: "Amy" },
  { id: "en-US-Chirp3-HD-Sadaltager", label: "Frank" },
];

interface GoogleVoiceState {
  voice: string;
  setVoice: (voice: string) => void;
}

export const useGoogleVoiceStore = create<GoogleVoiceState>()(
  persist(
    (set) => ({
      voice: GOOGLE_VOICES[0].id,
      setVoice: (voice) => set({ voice }),
    }),
    { name: "disciplined-google-voice" }
  )
);
