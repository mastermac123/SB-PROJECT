import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav, Sidebar } from '@/components/Nav'
import { useToast } from '@/components/Toast'
import { cx } from '@/components/ui'
import { useOnline } from '@/hooks'
import { me } from '@/services/api'
import { useDB } from '@/services/db'

/** Authenticated shell: sidebar (desktop) / bottom nav (mobile), page transitions, live toasts. */
export function AppShell({ nav }: { nav: boolean }) {
  const db = useDB()
  const u = me(db)
  const loc = useLocation()
  const online = useOnline()
  const offline = !online || db.settings.simulateOffline
  useNotificationToasts()

  if (!u) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />
  if (!u.commute && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />

  return (
    <div className={cx('app', nav ? 'app--with-nav' : 'app--with-sidebar')}>
      <Sidebar />
      <main className="app__main">
        <AnimatePresence>
          {offline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', position: 'relative', zIndex: 40 }}
            >
              <div role="status" className="row gap-2 t-sm" style={{ justifyContent: 'center', padding: '8px 16px', paddingTop: 'calc(8px + var(--safe-top))', background: 'var(--ink-900)', color: '#fff' }}>
                <WifiOff size={15} />
                You’re offline — showing saved information
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
          <Outlet />
        </motion.div>
      </main>
      {nav && <BottomNav />}
    </div>
  )
}

/** Surface new notifications as toasts while the app is open. */
function useNotificationToasts() {
  const db = useDB()
  const toast = useToast()
  const nav = useNavigate()
  const loc = useLocation()
  const seen = useRef<Set<string> | null>(null)
  const u = me(db)
  useEffect(() => {
    const mine = db.notifications.filter((n) => n.userId === u?.id)
    if (!seen.current) {
      seen.current = new Set(mine.map((n) => n.id))
      return
    }
    for (const n of mine) {
      if (seen.current.has(n.id)) continue
      seen.current.add(n.id)
      if (n.link && loc.pathname === n.link) continue
      if (n.kind === 'chat' && loc.pathname.startsWith('/chat/')) continue
      if (n.kind === 'payment' && loc.pathname.startsWith('/pay/')) continue
      toast({
        tone: n.kind === 'rejected' || n.kind === 'cancelled' ? 'error' : n.kind === 'accepted' || n.kind === 'payment' ? 'success' : 'info',
        message: n.title,
        action: n.link ? { label: 'View', onClick: () => nav(n.link!) } : undefined,
      })
    }
  }, [db.notifications, u?.id, toast, nav, loc.pathname])
}
