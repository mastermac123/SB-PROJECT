import { haversineKm, polylineLengthKm, ROAD_CIRCUITY, syntheticRoute } from '@/lib/geo'
import type { LatLng } from '@/lib/types'

export type Route = {
  coords: LatLng[]
  distanceKm: number
  durationMin: number
  source: 'osrm' | 'estimate'
}

/**
 * Road routing. Uses an OSRM-compatible endpoint (VITE_OSRM_URL, defaults to
 * the public OSRM demo server). When it is unreachable we fall back to a
 * deterministic estimate so matching keeps working offline; the UI labels
 * those distances as estimates.
 */
const OSRM = (import.meta.env.VITE_OSRM_URL as string | undefined) ?? 'https://router.project-osrm.org'
const CACHE_KEY = 'ridesync:routes:v1'
const memory = new Map<string, Route>()
const inflight = new Map<string, Promise<Route>>()
let unavailableUntil = 0 // brief circuit breaker so offline searches stay fast

try {
  const raw = localStorage.getItem(CACHE_KEY)
  if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Route>)) memory.set(k, v)
} catch {
  /* storage unavailable */
}

function persist() {
  try {
    const entries = [...memory.entries()].filter(([, r]) => r.source === 'osrm').slice(-80)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota or private mode — cache stays in memory */
  }
}

const key = (a: LatLng, b: LatLng) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`

export function estimateRoute(a: LatLng, b: LatLng): Route {
  const coords = syntheticRoute(a, b)
  const distanceKm = Math.max(polylineLengthKm(coords), haversineKm(a, b) * ROAD_CIRCUITY)
  return { coords, distanceKm, durationMin: estimateDuration(distanceKm), source: 'estimate' }
}

export function estimateDuration(km: number) {
  // City traffic for short hops, highway speeds for intercity trips.
  const speed = km < 40 ? 26 : 55
  return Math.round((km / speed) * 60 + 4)
}

/** Synchronous best-known route: cached road geometry, else estimate. */
export function routeNow(a: LatLng, b: LatLng): Route {
  return memory.get(key(a, b)) ?? estimateRoute(a, b)
}

export async function getRoute(a: LatLng, b: LatLng, timeoutMs = 3500): Promise<Route> {
  const k = key(a, b)
  const hit = memory.get(k)
  if (hit?.source === 'osrm') return hit
  const pending = inflight.get(k)
  if (pending) return pending
  if (Date.now() < unavailableUntil) return hit ?? estimateRoute(a, b)

  const job = (async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const url = `${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`routing ${res.status}`)
      const json = await res.json()
      const r = json.routes?.[0]
      if (!r) throw new Error('no route')
      const coords: LatLng[] = (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }))
      const route: Route = { coords, distanceKm: r.distance / 1000, durationMin: Math.round(r.duration / 60), source: 'osrm' }
      memory.set(k, route)
      persist()
      return route
    } catch {
      unavailableUntil = Date.now() + 60_000
      const est = estimateRoute(a, b)
      memory.set(k, est)
      return est
    } finally {
      clearTimeout(t)
      inflight.delete(k)
    }
  })()
  inflight.set(k, job)
  return job
}
