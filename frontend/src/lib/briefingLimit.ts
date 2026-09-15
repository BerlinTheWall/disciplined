import type { ConfirmOptions } from "@/components/ConfirmDialog";
import { AZURE_VOICES } from "@/store/azureVoiceStore";

// The backend's daily briefing allowance resets on the UTC day (see
// routers/tts.py's _today), so "today" here has to be UTC too.
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function voiceLabel(id: string): string {
  return AZURE_VOICES.find((v) => v.id === id)?.label ?? "your other voice";
}

// What to tell someone whose day summary didn't play because today's one
// briefing synthesis is already spent. `usedVoice` is the voice it was spent
// on (null when unknown — e.g. it was played on another device). `switchTo`
// is set only when switching back would actually replay the already-made
// audio, so the caller never offers a button that just hits the limit again.
export function briefingLimitDialog(
  usedVoice: string | null,
  currentVoice: string
): { options: ConfirmOptions; switchTo: string | null } {
  const title = "Today's summary is used up";
  if (usedVoice && usedVoice !== currentVoice) {
    const used = voiceLabel(usedVoice);
    return {
      options: {
        title,
        message: `You already listened to today's summary in ${used}'s voice, and each day includes one summary voice. Switch back to ${used} to hear it again, or try ${voiceLabel(currentVoice)} tomorrow.`,
        confirmLabel: `Switch to ${used}`,
        cancelLabel: "Not now",
      },
      switchTo: usedVoice,
    };
  }
  return {
    options: {
      title,
      message: usedVoice
        ? "You've already listened to today's summary. A new one will be ready tomorrow."
        : "Today's summary was already played in another voice. Switch back to the voice you used earlier to hear it again, or try this one tomorrow.",
      confirmLabel: "OK",
      hideCancel: true,
    },
    switchTo: null,
  };
}
