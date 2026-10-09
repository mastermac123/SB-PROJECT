import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { uid } from '@/lib/format'

type Toast = { id: string; tone: 'success' | 'error' | 'info'; message: string; action?: { label: string; onClick: () => void } }

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('t_')
    setToasts((list) => [...list.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 5000 : 3200)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast toast--${t.tone}`}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              role="status"
            >
              {t.tone === 'success' ? <CircleCheck /> : t.tone === 'error' ? <CircleAlert /> : <Info />}
              <span>{t.message}</span>
              {t.action && (
                <button
                  className="toast__action"
                  onClick={() => {
                    t.action!.onClick()
                    setToasts((list) => list.filter((x) => x.id !== t.id))
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
