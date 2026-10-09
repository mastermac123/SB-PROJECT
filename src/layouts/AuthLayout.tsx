import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { RouteArt } from '@/components/RouteArt'

/** Auth screens: single column on mobile; brand panel + form on desktop. */
export function AuthLayout({ children, top }: { children: ReactNode; top?: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth__brand" aria-hidden>
        <div>
          <Logo height={30} />
        </div>
        <RouteArt />
        <div className="stack gap-2">
          <p className="t-h1" style={{ maxWidth: 420 }}>Your campus. Your route. Your ride.</p>
          <p className="t-body t-muted" style={{ maxWidth: 420 }}>
            Carpooling only for Vidyalankar Institute of Technology students. Every driver and rider is verified with a college email.
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
