import { create } from "zustand";

// Not persisted — purely a live readout of lib/sync.ts's own internal state,
// recomputed as it changes. Exists so the UI can show something honest about
// whether "kept until you're back online" is actually happening right now,
// instead of the sync machinery being entirely invisible.
interface SyncStatusState {
  pendingCount: number; // items across all synced domains not yet confirmed on the server
  syncing: boolean; // a push or hydrate is actively in flight right now
}

export const useSyncStatusStore = create<SyncStatusState>(() => ({
  pendingCount: 0,
  syncing: false,
}));
