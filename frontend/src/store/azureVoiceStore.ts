import { create } from "zustand";
import { persist } from "zustand/middleware";

// The two Azure AI Speech (Neural HD) voices picked after listening at
// speech.microsoft.com/portal/voicegallery.
export const AZURE_VOICES = [
  { id: "en-US-Ava:DragonHDLatestNeural", label: "Amy" },
  { id: "en-US-Andrew:DragonHDLatestNeural", label: "Frank" },
];

interface AzureVoiceState {
  voice: string;
  setVoice: (voice: string) => void;
  // The voice today's day briefing was actually synthesized in (date is the
  // UTC day, matching the backend's quota day in routers/tts.py). The backend
  // allows one briefing synthesis a day, so when a different voice gets
  // blocked, this is what lets the limit dialog offer switching back to it.
  briefingVoice: { date: string; voice: string } | null;
  setBriefingVoice: (date: string, voice: string) => void;
}

export const useAzureVoiceStore = create<AzureVoiceState>()(
  persist(
    (set) => ({
      voice: AZURE_VOICES[0].id,
      setVoice: (voice) => set({ voice }),
      briefingVoice: null,
      setBriefingVoice: (date, voice) => set({ briefingVoice: { date, voice } }),
    }),
    { name: "disciplined-azure-voice" }
  )
);
