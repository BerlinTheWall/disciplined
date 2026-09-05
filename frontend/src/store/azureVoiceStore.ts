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
}

export const useAzureVoiceStore = create<AzureVoiceState>()(
  persist(
    (set) => ({
      voice: AZURE_VOICES[0].id,
      setVoice: (voice) => set({ voice }),
    }),
    { name: "disciplined-azure-voice" }
  )
);
