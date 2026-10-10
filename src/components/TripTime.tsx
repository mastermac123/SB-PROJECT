import { useEffect, useState } from 'react'
import { haversineKm } from '@/lib/geo'
import type { LatLng } from '@/lib/types'
import { liveEta, type LiveEta, type TrafficSegment } from '@/services/api'
import type { MapMarker } from './MapView'

type TripEtaInput = { from: LatLng; to: LatLng; departAt: string; plannedMin: number; distanceKm: number; live?: boolean }
export type TripEta = {
  minutes: number
  km: number
  arrive: Date
  traffic: LiveEta['traffic']
  delay: number
  /** Live route and its slow stretches (when the server has live traffic). */
  coords?: LatLng[]
  segments?: TrafficSegment[]
}

/**
 * Trip time and arrival from the server: live traffic for trips starting soon or under way,
 * typical traffic for that hour for later trips (refreshed every 2 minutes).
 * Falls back to the planned route time.
 */
export function useTripEta({ from, to, departAt, plannedMin, distanceKm, live }: TripEtaInput): TripEta {
  const soon = live || new Date(departAt).getTime() - Date.now() < 90 * 60_000
  const later = !soon && new Date(departAt).getTime() > Date.now()
  const [eta, setEta] = useState<LiveEta | null>(null)
  // ~1 km steps for a moving car, so live GPS doesn't trigger a lookup on every update.
  const key = `${from.lat.toFixed(2)},${from.lng.toFixed(2)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`

  useEffect(() => {
    let stop = false
    const load = () =>
      liveEta(from, to, { route: soon, departAt: later ? departAt : undefined })
        .then((r) => !stop && setEta(r))
        .catch(() => {})
    void load()
    const t = window.setInterval(load, 120_000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, soon, departAt])

  const minutes = eta?.durationMin ?? plannedMin
  const start = live ? Date.now() : Math.max(Date.now(), new Date(departAt).getTime())
  return { minutes, km: eta?.distanceKm ?? distanceKm, arrive: new Date(start + minutes * 60_000), traffic: eta?.traffic ?? null, delay: eta?.trafficDelayMin ?? 0, coords: eta?.coords, segments: eta?.segments }
}

/** The point `frac` of the way along a route (by distance). */
export function pointAlong(coords: LatLng[], frac = 0.5): LatLng | null {
  if (coords.length === 0) return null
  if (coords.length === 1) return coords[0]
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = haversineKm(coords[i - 1], coords[i])
    seg.push(d)
    total += d
  }
  let want = total * frac
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, want / seg[i]) : 0
      return { lat: coords[i].lat + (coords[i + 1].lat - coords[i].lat) * k, lng: coords[i].lng + (coords[i + 1].lng - coords[i].lng) * k }
    }
    want -= seg[i]
  }
  return coords.at(-1)!
}

const durationShort = (min: number) => (min < 60 ? `${Math.max(1, Math.round(min))} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`)

/** The time bubble shown on the route: "21 min" + "Light traffic" / "+8 min traffic" / "10 km". */
export function etaBubble(route: LatLng[], eta: TripEta, at?: LatLng | null): MapMarker | null {
  const p = at ?? pointAlong(route, 0.5)
  if (!p) return null
  return {
    id: 'eta',
    kind: 'eta',
    at: p,
    label: durationShort(eta.minutes),
    sublabel: eta.traffic === 'light' ? `Light traffic · ${Math.round(eta.km)} km` : eta.traffic ? `+${eta.delay} min traffic` : `${Math.round(eta.km)} km`,
    tone: eta.traffic ?? undefined,
  }
}
