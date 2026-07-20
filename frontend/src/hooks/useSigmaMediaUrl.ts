import { useEffect, useState } from "react";

import { getSigmaBlob } from "@/lib/sigmaMedia";

// Resolves a Sigma media id to a playable/renderable object URL, revoking it
// when the id changes or the component unmounts. Returns null while loading
// or if the blob is missing.
export function useSigmaMediaUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    // Resolve even the "no id" case through a microtask so state updates never
    // happen synchronously inside the effect body.
    void Promise.resolve()
      .then(() => (id ? getSigmaBlob(id) : undefined))
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else {
          setUrl(null);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return url;
}
