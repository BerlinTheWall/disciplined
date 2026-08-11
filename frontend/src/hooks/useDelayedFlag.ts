import { useEffect, useState } from "react";

// Mirrors `active`, but only flips to true once it's stayed true continuously
// for `delayMs` — and flips back to false immediately as soon as `active`
// does. Used to keep brief blips (a quick sync, a momentary reconnect) from
// ever surfacing in the UI at all.
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);

  // Reset immediately on the false transition — the React-documented
  // "adjusting state when a prop changes" pattern (tracked via state, not a
  // ref, so it stays safe to read/write during render): catches it in this
  // same render, no extra commit where a stale `true` could flash first.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setShown(false);
  }

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return shown;
}
