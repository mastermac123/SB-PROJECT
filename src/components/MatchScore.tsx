import { motion } from 'framer-motion'
import { CircleCheck, Info, TriangleAlert, Users } from 'lucide-react'
import { fmtKm, TIER_LABEL, WEIGHTS } from '@/lib/matching'
import type { MatchFactors, MatchResult } from '@/lib/types'
import { cx } from './ui'

const TIER_CLASS: Record<MatchResult['tier'], string> = {
  excellent: '',
  good: 'match--good',
  fair: 'match--fair',
  poor: 'match--poor',
}

/** Compact "94% match" pill with a progress ring. */
export function MatchScore({ score, tier, size, label = 'match' }: { score: number; tier: MatchResult['tier']; size?: 'lg'; label?: string }) {
  const r = 7.5
  const c = 2 * Math.PI * r
  return (
    <span className={cx('match', TIER_CLASS[tier], size === 'lg' && 'match--lg')} aria-label={`${score}% AI match — ${TIER_LABEL[tier]}`}>
      <svg className="match__ring" viewBox="0 0 20 20" aria-hidden>
        <circle className="track" cx="10" cy="10" r={r} />
        <circle className="value" cx="10" cy="10" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      {score}% {label}
    </span>
  )
}

const FACTOR_ROWS: { key: keyof MatchFactors; label: string }[] = [
  { key: 'route', label: 'Route similarity' },
  { key: 'time', label: 'Time compatibility' },
  { key: 'pickup', label: 'Pickup proximity' },
  { key: 'preference', label: 'Preference match' },
  { key: 'reliability', label: 'Driver reliability' },
]

function factorNote(key: keyof MatchFactors, m: MatchResult): string {
  switch (key) {
    case 'route':
      return m.dropDistanceKm < 0.6 ? 'Drops you right at your destination' : `Drop-off ${fmtKm(m.dropDistanceKm)} from your destination`
    case 'time':
      return Math.abs(m.timeDiffMin) <= 5 ? 'Right on your preferred time' : `${Math.abs(m.timeDiffMin)} min ${m.timeDiffMin > 0 ? 'after' : 'before'} your preferred time`
    case 'pickup':
      return `Route passes ${fmtKm(m.pickupDistanceKm)} from your pickup`
    case 'preference':
      return m.factors.preference === 1 ? 'Meets everything you asked for' : 'Some preferences not met'
    case 'reliability':
      return `★ ${m.driver.rating.toFixed(1)} from ${m.driver.ratingCount} ratings · ${Math.round(m.driver.completionRate * 100)}% rides completed`
  }
}

/** "Why this match?" — factor breakdown with plain-language notes. */
export function MatchBreakdown({ match, compact }: { match: MatchResult; compact?: boolean }) {
  return (
    <div className="stack gap-5">
      <div className="factors">
        {FACTOR_ROWS.map(({ key, label }, i) => {
          const pct = Math.round(match.factors[key] * 100)
          return (
            <div className="factor" key={key}>
              <span className="factor__label">{label}</span>
              <span className="factor__value">{pct}%</span>
              <div className="factor__bar">
                <motion.div
                  className={cx('factor__fill', pct < 55 && 'factor__fill--low')}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct / 100 }}
                  transition={{ duration: 0.5, delay: 0.05 * i, ease: [0.2, 0, 0, 1] }}
                />
              </div>
              {!compact && <span className="factor__note">{factorNote(key, match)}</span>}
            </div>
          )
        })}
      </div>

      {(match.reasons.length > 0 || match.history) && (
        <ul className="stack gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {match.history && (
            <li className="row row--top gap-2 t-sm">
              <Users size={16} className="t-primary" style={{ flex: 'none', marginTop: 1 }} />
              {match.history}
            </li>
          )}
          {match.reasons.map((r) => (
            <li key={r} className="row row--top gap-2 t-sm">
              <CircleCheck size={16} className="t-success" style={{ flex: 'none', marginTop: 1 }} />
              {r}
            </li>
          ))}
          {match.caveats.map((r) => (
            <li key={r} className="row row--top gap-2 t-sm">
              <TriangleAlert size={16} style={{ flex: 'none', marginTop: 1, color: 'var(--warning-500)' }} />
              {r}
            </li>
          ))}
        </ul>
      )}

      {!compact && (
        <p className="row row--top gap-2 t-caption t-muted" style={{ fontWeight: 400 }}>
          <Info size={14} style={{ flex: 'none', marginTop: 1 }} />
          Score weights: route {pct(WEIGHTS.route)}, pickup {pct(WEIGHTS.pickup)}, time {pct(WEIGHTS.time)}, reliability {pct(WEIGHTS.reliability)}, preferences {pct(WEIGHTS.preference)}. Rides that can’t work — wrong direction, no seats, too big a detour — are never shown.
        </p>
      )}
    </div>
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`
