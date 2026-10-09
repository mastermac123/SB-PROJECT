import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { RouteArt } from '@/components/RouteArt'

/** Auth screens: single column on mobile; brand panel + form on desktop. */
export function AuthLayout({ children, top }: { children: ReactNode; top?: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth__brand" aria-hidden>
        <Logo variant="compact" height={36} />
        <RouteArt />
        <div className="stack gap-2">
          <p className="t-h2" style={{ maxWidth: 380 }}>Smart rides. Shared journeys.</p>
          <p className="t-body t-muted" style={{ maxWidth: 380 }}>
            AI-powered carpooling built exclusively for the VIT community.
          </p>
        </div>
      </aside>
      <main className="auth__main">
        {top}
        <div className="auth__inner">{children}</div>
      </main>
    </div>
  )
}
