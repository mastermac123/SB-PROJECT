import type { LatLng } from '../src/lib/types'
import { env } from './env'

/**
 * Live traffic from TomTom (free plan, no card: developer.tomtom.com → API keys).
 *   TOMTOM_KEY → routes and ETAs that include current traffic, and the
 *                green/orange/red traffic layer on the map.
 * Free plan: 2,500 route requests and 50,000 map tiles a day.
 */

export const tomtomConfigured = () => !!env.tomtomKey

export type TrafficLevel = 'light' | 'moderate' | 'heavy'

/**
 * A stretch of the route with traffic, by point index (Google-style colours):
 * slow = orange, heavy = red, severe = dark red (standstill or closure). Everything else is clear (blue).
 */
export type TrafficSegment = { from: number; to: number; level: 'slow' | 'heavy' | 'severe' }

/** How bad traffic is, from the extra time it adds to the trip. */
export function trafficLevel(delayMin: number, freeFlowMin: number): TrafficLevel {
  const ratio = freeFlowMin > 0 ? delayMin / freeFlowMin : 0
  return delayMin >= 10 || ratio >= 0.4 ? 'heavy' : delayMin >= 3 || ratio >= 0.15 ? 'moderate' : 'light'
}

type TTRoute = {
  summary: {
    lengthInMeters: number
    travelTimeInSeconds: number
    trafficDelayInSeconds?: number
    noTrafficTravelTimeInSeconds?: number
    /** With computeTravelTimeFor=all: typical traffic for this weekday/hour, and live incidents only. */
    historicTrafficTravelTimeInSeconds?: number
    liveTrafficIncidentsTravelTimeInSeconds?: number
  }
  legs: { points: { latitude: number; longitude: number }[] }[]
  sections?: { sectionType?: string; startPointIndex: number; endPointIndex: number; magnitudeOfDelay?: number; simpleCategory?: string }[]
}

/** TomTom's delay size (1 minor … 3 major, 4 unknown/closure) → our colours. */
function segmentLevel(magnitude = 0, category = ''): TrafficSegment['level'] | null {
  if (category === 'ROAD_CLOSURE' || magnitude >= 3) return 'severe'
  if (magnitude === 2) return 'heavy'
  if (magnitude === 1 || category === 'JAM') return 'slow'
  return null
}

export async function tomtomRoute(a: LatLng, b: LatLng, departAt?: Date) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    // Leaving now → live traffic; a later time → TomTom's typical traffic for that hour.
    const when = departAt && departAt.getTime() > Date.now() + 10 * 60_000 ? `&departAt=${encodeURIComponent(departAt.toISOString())}` : ''
    const res = await fetch(
      `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lng}:${b.lat},${b.lng}/json?key=${encodeURIComponent(env.tomtomKey)}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all&sectionType=traffic${when}`,
      { signal: ctrl.signal },
    )
    if (!res.ok) throw new Error(`tomtom ${res.status}`)
    const r = ((await res.json()) as { routes?: TTRoute[] }).routes?.[0]
    if (!r) throw new Error('tomtom: no route')
    // TomTom's live feed is thin on many Mumbai roads, while its history for the same weekday and
    // hour already knows the usual rush. Take the slowest of live, typical and incidents.
    const s = r.summary
    const seconds = Math.max(s.travelTimeInSeconds, s.historicTrafficTravelTimeInSeconds ?? 0, s.liveTrafficIncidentsTravelTimeInSeconds ?? 0)
    const durationMin = Math.max(1, Math.round(seconds / 60))
    const freeFlowMin = Math.round((s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds) / 60)
    const trafficDelayMin = Math.max(0, Math.round((seconds - (s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds)) / 60), Math.round((s.trafficDelayInSeconds ?? 0) / 60))
    const segments: TrafficSegment[] = []
    for (const sec of r.sections ?? []) {
      if (sec.sectionType !== 'TRAFFIC') continue
      const level = segmentLevel(sec.magnitudeOfDelay, sec.simpleCategory)
      if (level && sec.endPointIndex > sec.startPointIndex) segments.push({ from: sec.startPointIndex, to: sec.endPointIndex, level })
    }
    return {
      coords: r.legs.flatMap((l) => l.points.map((p) => ({ lat: p.latitude, lng: p.longitude }))),
      segments,
      distanceKm: r.summary.lengthInMeters / 1000,
      durationMin,
      trafficDelayMin,
      traffic: trafficLevel(trafficDelayMin, freeFlowMin),
    }
  } finally {
    clearTimeout(t)
  }
}

/* ---- Traffic map layer (proxied so the key stays on the server) ---- */

const tiles = new Map<string, { at: number; body: Buffer }>()

export async function trafficTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const k = `${z}/${x}/${y}`
  const hit = tiles.get(k)
  if (hit && Date.now() - hit.at < 120_000) return hit.body
  const res = await fetch(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(env.tomtomKey)}&tileSize=256&thickness=6`, {
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const body = Buffer.from(await res.arrayBuffer())
  if (tiles.size > 3000) tiles.clear()
  tiles.set(k, { at: Date.now(), body })
  return body
}

/** Startup check so a wrong key is reported once instead of silently showing no traffic. */
export async function checkTomTom(): Promise<'ok' | 'rejected' | 'unreachable' | 'none'> {
  if (!env.tomtomKey) return 'none'
  try {
    const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/19.0222,72.8711:19.0176,72.8562/json?key=${encodeURIComponent(env.tomtomKey)}&traffic=true`, { signal: AbortSignal.timeout(6000) })
    if (res.status === 401 || res.status === 403) return 'rejected'
    return res.ok ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
