import { haversineKm, polylineLengthKm, ROAD_CIRCUITY, syntheticRoute } from '../src/lib/geo'
import type { LatLng } from '../src/lib/types'
import { env } from './env'
import { googleConfigured, googleRoute } from './google'

export type Route = { coords: LatLng[]; distanceKm: number; durationMin: number; source: 'google' | 'osrm' | 'estimate' }

const cache = new Map<string, Route>()
const key = (a: LatLng, b: LatLng) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`

export function estimateRoute(a: LatLng, b: LatLng): Route {
  const coords = syntheticRoute(a, b)
  const distanceKm = Math.max(polylineLengthKm(coords), haversineKm(a, b) * ROAD_CIRCUITY)
  return { coords, distanceKm, durationMin: Math.round((distanceKm / (distanceKm < 40 ? 22 : 50)) * 60 + 5), source: 'estimate' }
}

/** Road route from OSRM, simplified to keep rows small. Falls back to an estimate. */
function simplify(pts: LatLng[]) {
  const step = Math.max(1, Math.floor(pts.length / 250))
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1)
}

/** OpenRouteService (when ORS_API_KEY is set). */
async function orsRoute(a: LatLng, b: LatLng): Promise<Route> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: env.orsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
    })
    if (!res.ok) throw new Error(`ors ${res.status}`)
    const json = (await res.json()) as { features?: { geometry: { coordinates: [number, number][] }; properties: { summary: { distance: number; duration: number } } }[] }
    const f = json.features?.[0]
    if (!f) throw new Error('no route')
    return {
      coords: simplify(f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))),
      distanceKm: f.properties.summary.distance / 1000,
      durationMin: Math.round(f.properties.summary.duration / 60),
      source: 'osrm',
    }
  } finally {
    clearTimeout(t)
  }
}

export async function getRoute(a: LatLng, b: LatLng): Promise<Route> {
  const k = key(a, b)
  const hit = cache.get(k)
  if (hit) return hit
  if (googleConfigured()) {
    try {
      const r = await googleRoute(a, b)
      const route: Route = { ...r, coords: simplify(r.coords), source: 'google' }
      if (cache.size > 500) cache.clear()
      cache.set(k, route)
      return route
    } catch (e) {
      console.error('[ridesync] Google routes failed, falling back', (e as Error).message)
    }
  }
  if (env.orsKey) {
    try {
      const route = await orsRoute(a, b)
      cache.set(k, route)
      return route
    } catch (e) {
      console.error('[ridesync] openrouteservice failed, falling back to OSRM', (e as Error).message)
    }
  }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${env.osrmUrl}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(String(res.status))
    const json = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
    const r = json.routes?.[0]
    if (!r) throw new Error('no route')
    const coords = simplify(r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })))
    const route: Route = { coords, distanceKm: r.distance / 1000, durationMin: Math.round(r.duration / 60), source: 'osrm' }
    if (cache.size > 500) cache.clear()
    cache.set(k, route)
    return route
  } catch {
    return estimateRoute(a, b)
  }
}
