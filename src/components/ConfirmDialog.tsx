/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { spring, tap } from '../lib/motion'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean // styles the confirm button as a red, irreversible action
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Returns a function that opens the confirm dialog and resolves to true (user
// confirmed) or false (cancelled/dismissed). Lets callers guard an action with a
// single line: `if (!(await confirm({ ... }))) return`.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}

interface Pending {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  )

  function close(result: boolean) {
    setPending((curr) => {
      curr?.resolve(result)
      return null
    })
  }

  const opts = pending?.options

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {createPortal(
        <AnimatePresence>
          {opts && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/40 z-60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => close(false)}
              />
              <div className="fixed inset-0 z-70 flex items-center justify-center p-6 pointer-events-none">
                <motion.div
                  role="alertdialog"
                  className="w-full max-w-xs bg-surface rounded-2xl shadow-xl p-5 pointer-events-auto"
                  initial={{ opacity: 0, scale: 0.92, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={spring.snappy}
                >
                  <h3 className="text-lg font-semibold text-fg">{opts.title}</h3>
                  {opts.message && (
                    <p className="text-sm text-fg-muted mt-1.5 leading-snug">
                      {opts.message}
                    </p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <motion.button
                      onClick={() => close(false)}
                      whileTap={tap}
                      className="flex-1 rounded-xl py-2.5 font-medium bg-surface-raised text-fg"
                    >
                      {opts.cancelLabel ?? 'Cancel'}
                    </motion.button>
                    <motion.button
                      onClick={() => close(true)}
                      whileTap={tap}
                      className={`flex-1 rounded-xl py-2.5 font-medium ${
                        opts.destructive
                          ? 'bg-red-500 text-white'
                          : 'bg-surface-inverse text-fg-inverse'
                      }`}
                    >
                      {opts.confirmLabel ?? 'Confirm'}
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </ConfirmContext.Provider>
  )
}
