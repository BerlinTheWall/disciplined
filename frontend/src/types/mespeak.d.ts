// Minimal surface of the bundled eSpeak synthesizer (mespeak) used for
// offline reminder-notification audio. The package ships no types.
declare module "mespeak" {
  interface MeSpeak {
    loadConfig(config: unknown): void;
    loadVoice(voice: unknown): void;
    // With { rawdata: "array" } returns the synthesized WAV as a byte array
    // instead of playing it; null/undefined on failure.
    speak(text: string, options?: Record<string, unknown>): number[] | null | undefined;
  }
  const meSpeak: MeSpeak;
  export default meSpeak;
}

declare module "mespeak/src/mespeak_config.json" {
  const config: unknown;
  export default config;
}

declare module "mespeak/voices/en/en-us.json" {
  const voice: unknown;
  export default voice;
}
