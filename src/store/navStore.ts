import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Page, PAGE_ORDER } from '../lib/pages'

const DEFAULT_NAVBAR: Page[] = ['schedule', 'meals', 'workout', 'habits']

interface NavStore {
  navbarPages: Page[]
  toggleNavbar: (page: Page) => void
}

export const useNavStore = create<NavStore>()(
  persist(
    (set, get) => ({
      navbarPages: DEFAULT_NAVBAR,
      toggleNavbar: (page: Page) => {
        if (page === 'schedule') return
        const current = get().navbarPages
        const inNav = current.includes(page)
        if (inNav) {
          set({ navbarPages: current.filter((p) => p !== page) })
        } else if (current.length < 4) {
          const next = PAGE_ORDER.filter((p) => [...current, page].includes(p))
          set({ navbarPages: next })
        }
      },
    }),
    { name: 'nav-config' },
  ),
)
