import { api, type BriefingItemPayload, type BriefingPayload } from "./api";
import { useProfileStore } from "@/store/profileStore";

// Fetches the LLM-written briefing script for a day, cached per exact payload
// so re-opening the same unchanged day doesn't regenerate (or re-bill) it.
// Resolves null on any failure — callers fall back to the local template text.

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
const CACHE_MAX = 6;

export function fetchBriefingScript(
  dayLabel: string,
  items: BriefingItemPayload[],
  streaks: { title: string; days: number }[] = []
): Promise<string | null> {
  const payload: BriefingPayload = {
    dayLabel,
    name: useProfileStore.getState().name.trim(),
    items: [...items].sort((a, b) => a.startMinutes - b.startMinutes),
    streaks,
  };
  const key = JSON.stringify(payload);

  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = api
    .briefing(payload)
    .then(({ script }) => {
      cache.set(key, script);
      while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value!;
        cache.delete(oldest);
      }
      return script;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
