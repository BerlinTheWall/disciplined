import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The user's identity for the profile hub. Local-only (no account/backend); it
// just personalizes the app and feeds the side-menu user card.
interface ProfileStore {
  name: string
  tagline: string
  setName: (name: string) => void
  setTagline: (tagline: string) => void
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set) => ({
      name: 'Hooman',
      tagline: 'Staying disciplined',
      setName: (name) => set({ name }),
      setTagline: (tagline) => set({ tagline }),
    }),
    { name: 'disciplined-profile' },
  ),
)
