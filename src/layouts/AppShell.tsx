import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { BottomNav, Sidebar } from '@/components/Nav'
import { useToast } from '@/components/Toast'
import { Button, cx } from '@/components/ui'
import { useOnline } from '@/hooks'
import { connectEvents, onNotification, revalidate, useMe } from '@/services/api'

/** Authenticated shell: sidebar (desktop) / bottom nav (mobile), live updates, toasts. */
export function AppShell({ nav }: { nav: boolean }) {
  const { user, error } = useMe()
  const loc = useLocation()
  const online = useOnline()

  useEffect(() => {
    if (user) connectEvents()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (online) revalidate()
  }, [online])
  useNotificationToasts()

  if (user === undefined) {
    if (error)
      return (
        <div className="boot">
          <Logo height={28} />
          <p className="t-body t-muted t-center">{error.message}</p>
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => revalidate()}>
            Try again
          </Button>
        </div>
      )
    return (
      <div className="boot" aria-busy>
        <Logo variant="mark" height={44} />
      </div>
    )
  }
  if (user === null) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />
  if (!user.onboarded && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  if (user.onboarded && loc.pathname === '/onboarding') return <Navigate to="/home" replace />

  return (
    <div className={cx('app', nav ? 'app--with-nav' : 'app--with-sidebar')}>
      {user.onboarded && <Sidebar />}
      <main className="app__main">
        <AnimatePresence>
          {!online && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', position: 'relative', zIndex: 40 }}>
              <div role="status" className="row gap-2 t-sm" style={{ justifyContent: 'center', padding: '8px 16px', paddingTop: 'calc(8px + var(--safe-top))', background: 'var(--ink-900)', color: '#fff' }}>
                <WifiOff size={15} />
                You’re offline — changes will sync when you reconnect
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

/** New notifications from the server → toast (and a system notification when the tab is hidden). */
function useNotificationToasts() {
  const toast = useToast()
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(
    () =>
      onNotification((n) => {
        if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const sys = new Notification(n.title, { body: n.body, icon: '/apple-touch-icon.png', tag: n.id })
            sys.onclick = () => {
              window.focus()
              if (n.link) nav(n.link)
            }
          } catch {
            /* some mobile browsers only allow notifications from a service worker */
          }
        }
        if (n.link && window.location.pathname === n.link) return
        if (n.kind === 'chat' && window.location.pathname.startsWith('/chat/')) return
        toast({
          tone: n.kind === 'rejected' || n.kind === 'cancelled' ? 'error' : n.kind === 'accepted' || n.kind === 'payment' ? 'success' : 'info',
          message: n.title,
          action: n.link ? { label: 'View', onClick: () => nav(n.link!) } : undefined,
        })
      }),
    [toast, nav, loc.pathname],
  )
}
