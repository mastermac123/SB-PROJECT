import { motion } from 'framer-motion'
import { MapPinOff, RefreshCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, cx } from './ui'

/** Empty, error and informational states share one layout. */
export function StateView({
  icon,
  tone = 'brand',
  title,
  body,
  actions,
  compact,
}: {
  icon: ReactNode
  tone?: 'brand' | 'neutral' | 'error' | 'warning' | 'success'
  title: string
  body?: ReactNode
  actions?: ReactNode
  compact?: boolean
}) {
  return (
    <motion.div
      className="state"
      style={compact ? { paddingTop: 24, paddingBottom: 24 } : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
    >
      <div className={cx('state__art', tone !== 'brand' && `state__art--${tone}`)}>{icon}</div>
      <h2 className="state__title">{title}</h2>
      {body && <p className="state__body">{body}</p>}
      {actions && <div className="state__actions">{actions}</div>}
    </motion.div>
  )
}

export function NetworkError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <StateView
      tone="neutral"
      icon={<WifiOff />}
      title="You’re offline"
      body="We couldn’t reach RideSync. Your search is saved — try again when you’re back online."
      actions={
        <Button variant="secondary" block icon={<RefreshCw />} loading={retrying} onClick={onRetry}>
          Try again
        </Button>
      }
    />
  )
}

export function LocationDenied({ onManual, onRetry }: { onManual: () => void; onRetry?: () => void }) {
  return (
    <StateView
      tone="warning"
      icon={<MapPinOff />}
      title="Location is off"
      body="Allow location in your browser settings to use your current position, or choose your pickup manually."
      actions={
        <>
          <Button block onClick={onManual}>
            Choose pickup manually
          </Button>
          {onRetry && (
            <Button variant="ghost" block onClick={onRetry}>
              Try again
            </Button>
          )}
        </>
      }
    />
  )
}
