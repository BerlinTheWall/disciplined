import { useEffect, useState } from "react";

// Live clock: re-renders with a fresh Date on the given interval so "happening
// now" highlights track real time while a view stays mounted.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
