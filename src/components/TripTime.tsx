import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { duration, time } from '@/lib/format'
import type { LatLng } from '@/lib/types'
import { liveEta, type LiveEta } from '@/services/api'

/**
 * "48 min · 22 km · arrive 5:03 AM", plus live traffic ("Heavy traffic now · +8 min")
 * when the trip starts within 90 minutes or is under way. Refreshes every 2 minutes.
 */
export function TripTime({ from, to, departAt, plannedMin, distanceKm, live }: { from: LatLng; to: LatLng; departAt: string; plannedMin: number; distanceKm: number; live?: boolean }) {
  const soon = live || new Date(departAt).getTime() - Date.now() < 90 * 60_000
  const [eta, setEta] = useState<LiveEta | null>(null)
  // ~1 km steps for a moving car, so live GPS doesn't trigger a lookup on every update.
  const key = `${from.lat.toFixed(2)},${from.lng.toFixed(2)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`

  useEffect(() => {
    if (!soon) return
    let stop = false
    const load = () =>
      liveEta(from, to)
        .then((r) => !stop && setEta(r))
        .catch(() => {})
    void load()
    const t = window.setInterval(load, 120_000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, soon])

  const minutes = eta?.durationMin ?? plannedMin
  const start = Math.max(Date.now(), new Date(departAt).getTime())
  const arrive = new Date((live ? Date.now() : start) + minutes * 60_000)
  const tone = eta?.traffic === 'heavy' ? 'var(--error-600)' : eta?.traffic === 'moderate' ? 'var(--warning-600)' : 'var(--success-600)'

  return (
    <div className="stack gap-1">
      <span className="row gap-2 t-body">
        <Clock size={16} style={{ color: 'var(--ink-500)' }} />
        <span>
          <strong>{duration(minutes)}</strong> · {Math.round(eta?.distanceKm ?? distanceKm)} km · arrive ~{time(arrive)}
        </span>
      </span>
      {eta?.traffic && (
        <span className="t-sm" style={{ color: tone, paddingLeft: 24, fontWeight: 600 }}>
          {eta.traffic === 'light' ? 'Light traffic now · live' : `${eta.traffic === 'heavy' ? 'Heavy' : 'Some'} traffic now · +${eta.trafficDelayMin} min · live`}
        </span>
      )}
    </div>
  )
}
