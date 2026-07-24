import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SIGMA_LINES } from "@/lib/sigma";

// Sigma Mode: a personal, unpublished hype gimmick — flips the whole app to a
// harsh black-and-red theme (see index.css [data-sigma="on"]) and barks
// motivation at you. Never surfaced to other users; toggled from Settings.

function applySigma(on: boolean) {
  if (on) document.documentElement.setAttribute("data-sigma", "on");
  else document.documentElement.removeAttribute("data-sigma");
}

export type SigmaMediaKind = "image" | "video" | "audio";

// Metadata only — the actual bytes live in IndexedDB (lib/sigmaMedia.ts),
// keyed by this same id. Keeping blobs out of this store is what keeps it
// safe to persist to localStorage.
export interface SigmaMediaItem {
  id: string;
  kind: SigmaMediaKind;
  name: string;
  addedAt: number;
}

interface SigmaState {
  on: boolean;
  toggle: () => void;

  // User-editable hype lines, seeded from the built-in defaults so "edit them
  // all" means exactly that — there's one list, not defaults-plus-overrides.
  lines: string[];
  addLine: (text: string) => void;
  updateLine: (index: number, text: string) => void;
  removeLine: (index: number) => void;

  media: SigmaMediaItem[];
  addMedia: (item: SigmaMediaItem) => void;
  removeMedia: (id: string) => void;

  // Ephemeral UI state (not persisted): lets both the Home section and
  // Settings open the same manager sheet, mounted once at the app root.
  managerOpen: boolean;
  openManager: () => void;
  closeManager: () => void;
}

export const useSigmaStore = create<SigmaState>()(
  persist(
    (set, get) => ({
      on: false,
      toggle: () => {
        const next = !get().on;
        applySigma(next);
        set({ on: next });
      },

      lines: [...SIGMA_LINES],
      addLine: (text) => set((s) => ({ lines: [...s.lines, text] })),
      updateLine: (index, text) =>
        set((s) => ({ lines: s.lines.map((l, i) => (i === index ? text : l)) })),
      removeLine: (index) => set((s) => ({ lines: s.lines.filter((_, i) => i !== index) })),

      media: [],
      addMedia: (item) => set((s) => ({ media: [...s.media, item] })),
      removeMedia: (id) => set((s) => ({ media: s.media.filter((m) => m.id !== id) })),

      managerOpen: false,
      openManager: () => set({ managerOpen: true }),
      closeManager: () => set({ managerOpen: false }),
    }),
    {
      name: "disciplined-sigma",
      partialize: (state) => ({ on: state.on, lines: state.lines, media: state.media }),
      onRehydrateStorage: () => (state) => {
        if (state) applySigma(state.on);
      },
    }
  )
);
