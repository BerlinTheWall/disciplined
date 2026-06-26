import { Settings, Palette, LogOut, X } from 'lucide-react'
import logo from '../assets/logo.svg'
import { motion, AnimatePresence } from 'framer-motion'
import { tap } from '../lib/motion'
import { useScrollLock } from '../hooks/useScrollLock'
import { useThemeStore } from '../store/themeStore'
import { useProfileStore } from '../store/profileStore'
import type { Page } from './BottomNav'
import { ALL_TABS } from '../lib/pages'

// Pages intentionally left out of the side menu (still reachable via bottom nav).
const HIDDEN_FROM_MENU: Page[] = ['schedule', 'habits', 'expenses']

interface SideMenuProps {
  isOpen: boolean
  onClose: () => void
  activePage: Page
  onNavigate: (page: Page) => void
  onOpenProfile: () => void
}

export default function SideMenu({ isOpen, onClose, activePage, onNavigate, onOpenProfile }: SideMenuProps) {
  const { theme, toggleTheme } = useThemeStore()
  const name = useProfileStore((s) => s.name)
  useScrollLock(isOpen)

  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 left-0 bottom-0 w-72 bg-surface z-50 flex flex-col shadow-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-8 pb-8">
              <div className="flex items-center gap-3">
                <img src={logo} alt="logo" className={`w-12 h-12 object-contain ${theme === 'light' ? 'brightness-0' : ''}`} />
                <span className="text-2xl font-extrabold text-fg">Disciplined</span>
              </div>
            </div>
              <motion.button onClick={onClose} whileTap={tap} className="absolute top-4 right-4 p-1 text-fg-faint">
                <X size={18} />
              </motion.button>

            {/* User card */}
            <div className="px-5 pb-5">
              <motion.button
                onClick={() => { onClose(); onOpenProfile() }}
                whileTap={tap}
                className="flex items-center gap-3 w-full text-left"
              >
                <div className="w-12 h-12 rounded-full bg-fg flex items-center justify-center shrink-0">
                  <span className="text-base font-bold text-fg-inverse">{initial}</span>
                </div>
                <div>
                  <p className="font-semibold text-fg">{name}</p>
                  <p className="text-sm text-fg-faint">View profile</p>
                </div>
              </motion.button>
            </div>

            {/* Nav items */}
            <div className="px-3 flex-1">
              {ALL_TABS.filter(({ id }) => !HIDDEN_FROM_MENU.includes(id)).map(({ id, icon: Icon, label }) => {
                const isActive = id === activePage
                return (
                  <motion.button
                    key={id}
                    whileTap={tap}
                    onClick={() => { onNavigate(id); onClose() }}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl mb-1 transition-colors ${
                      isActive ? 'bg-fg/10' : 'hover:bg-fg/5'
                    }`}
                  >
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.2 : 1.8}
                      className={isActive ? 'text-fg' : 'text-fg-muted'}
                    />
                    <span className={`font-medium ${isActive ? 'text-fg' : 'text-fg-muted'}`}>
                      {label}
                    </span>
                  </motion.button>
                )
              })}
            </div>

            {/* Divider */}
            <div className="mx-5 border-t border-border my-1" />

            {/* Settings + Theme */}
            <div className="px-3 py-2">
              <motion.button
                whileTap={tap}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl hover:bg-fg/5 transition-colors"
              >
                <Settings size={20} className="text-fg-muted" strokeWidth={1.8} />
                <span className="font-medium text-fg-muted">Settings</span>
              </motion.button>
              <motion.button
                onClick={toggleTheme}
                whileTap={tap}
                className="flex items-center justify-between w-full px-4 py-3 rounded-2xl hover:bg-fg/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Palette size={20} className="text-fg-muted" strokeWidth={1.8} />
                  <span className="font-medium text-fg-muted">Theme</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${theme === 'dark' ? 'bg-fg' : 'bg-surface-subtle'}`}>
                  <motion.div
                    className="w-5 h-5 rounded-full bg-surface shadow-sm"
                    animate={{ x: theme === 'dark' ? 16 : 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  />
                </div>
              </motion.button>
            </div>

            {/* Log out */}
            <div className="px-3 pb-10">
              <motion.button
                whileTap={tap}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={20} strokeWidth={1.8} />
                <span className="font-medium">Log out</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
