import { User, Sun, Moon, LogOut, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { tap } from '../lib/motion'
import { useThemeStore } from '../store/themeStore'

interface SideMenuProps {
  isOpen: boolean
  onClose: () => void
}

export default function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
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
            {/* Close */}
            <div className="flex justify-end p-4 pt-12 shrink-0">
              <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
                <X size={20} />
              </motion.button>
            </div>

            {/* User section */}
            <div className="px-6 pb-5 border-b border-border">
              <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center mb-3">
                <User size={26} className="text-fg-muted" />
              </div>
              <p className="font-semibold text-fg">My Account</p>
              <p className="text-sm text-fg-faint mt-0.5">user@example.com</p>
            </div>

            <div className="flex-1" />

            {/* Theme + logout */}
            <div className="px-3 py-4 border-t border-border">
              <motion.button
                onClick={toggleTheme}
                whileTap={tap}
                className="flex items-center justify-between w-full px-3 py-3 rounded-2xl hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center gap-3">
                  {theme === 'light'
                    ? <Moon size={18} className="text-fg-muted" />
                    : <Sun size={18} className="text-fg-muted" />}
                  <span className="font-medium text-fg">
                    {theme === 'light' ? 'Dark mode' : 'Light mode'}
                  </span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${theme === 'dark' ? 'bg-fg' : 'bg-surface-subtle'}`}>
                  <motion.div
                    className="w-5 h-5 rounded-full bg-surface shadow-sm"
                    animate={{ x: theme === 'dark' ? 16 : 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  />
                </div>
              </motion.button>

              <motion.button
                whileTap={tap}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={18} />
                <span className="font-medium">Log out</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
