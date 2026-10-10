import { LocateFixed, LocateOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { bookings } from '@/services/api'

/**
 * Rider: send this phone's live location to the driver until pickup (like Uber/Ola), so the
 * driver can drive to exactly where you are — even if you walk to a different gate.
 * Sends at most every 5 s, or sooner after moving 25 m. The rider can pause it.
 */
export function useShareRiderLocation(bookingId: string, active: boolean) {
  const [state, setState] = useState<'off' | 'waiting' | 'live' | 'blocked' | 'paused'>('off')
  const [paused, setPaused] = useState(false)
  const last = useRef<{ t: number; lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (!active || paused) {
      setState(paused ? 'paused' : 'off')
      return
    }
    if (!('geolocation' in navigator)) return setState('blocked')
    setState('waiting')
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords
        const prev = last.current
        const moved = prev ? Math.hypot((lat - prev.lat) * 111_000, (lng - prev.lng) * 105_000) : Infinity
        setState('live')
        if (!prev || Date.now() - prev.t > 5000 || moved > 25) {
          last.current = { t: Date.now(), lat, lng }
          bookings.riderLocation(bookingId, lat, lng, Number.isFinite(accuracy) ? Math.round(accuracy) : null).catch(() => {})
        }
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? 'blocked' : 'waiting'),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [bookingId, active, paused])
  return { state, paused, setPaused }
}

/** Small status bar: "Sharing your live location with Sara until pickup · Stop". */
export function RiderLiveBar({ driver, share }: { driver: string; share: ReturnType<typeof useShareRiderLocation> }) {
  if (share.state === 'off') return null
  const on = share.state === 'live' || share.state === 'waiting'
  return (
    <div className={`rider-live rider-live--${share.state}`} role="status">
      <span className="rider-live__icon">{on ? <LocateFixed /> : <LocateOff />}</span>
      <span className="grow t-sm">
        {share.state === 'live'
          ? `${driver} can see where you are until pickup`
          : share.state === 'waiting'
            ? 'Finding your location…'
            : share.state === 'paused'
              ? `Live location paused — ${driver} sees your pickup pin`
              : 'Location is blocked. Allow it in your browser so your driver can find you.'}
      </span>
      {share.state !== 'blocked' && (
        <button type="button" className="t-sm t-strong t-primary" onClick={() => share.setPaused(!share.paused)}>
          {share.paused ? 'Share' : 'Stop'}
        </button>
      )}
    </div>
  )
}
