import type { LatLng } from './types'

const R = 6371 // km
const rad = (d: number) => (d * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function polylineLengthKm(line: LatLng[]): number {
  let d = 0
  for (let i = 1; i < line.length; i++) d += haversineKm(line[i - 1], line[i])
  return d
}

/** Project to a local planar frame (km) — accurate enough at city scale. */
function toXY(p: LatLng, ref: LatLng) {
  return {
    x: rad(p.lng - ref.lng) * Math.cos(rad(ref.lat)) * R,
    y: rad(p.lat - ref.lat) * R,
  }
}

export type Projection = {
  distanceKm: number // perpendicular distance from point to the line
  alongKm: number // distance along the line to the projected point
  segment: number
  point: LatLng
}

/** Nearest point on a polyline to `p`. */
export function projectOnPolyline(p: LatLng, line: LatLng[]): Projection {
  let best: Projection = { distanceKm: Infinity, alongKm: 0, segment: 0, point: line[0] }
  let along = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const A = toXY(a, p)
    const B = toXY(b, p)
    const dx = B.x - A.x
    const dy = B.y - A.y
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : -(A.x * dx + A.y * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const x = A.x + t * dx
    const y = A.y + t * dy
    const dist = Math.hypot(x, y)
    const segLen = Math.sqrt(len2)
    if (dist < best.distanceKm) {
      best = {
        distanceKm: dist,
        alongKm: along + segLen * t,
        segment: i - 1,
        point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      }
    }
    along += segLen
  }
  return best
}

/** Point at `km` along a polyline, plus heading in degrees. */
export function pointAlong(line: LatLng[], km: number): { point: LatLng; heading: number } {
  let remaining = km
  for (let i = 1; i < line.length; i++) {
    const seg = haversineKm(line[i - 1], line[i])
    if (remaining <= seg || i === line.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg)
      const a = line[i - 1]
      const b = line[i]
      return {
        point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
        heading: bearing(a, b),
      }
    }
    remaining -= seg
  }
  return { point: line[line.length - 1], heading: 0 }
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Sub-section of a polyline between two along-distances. */
export function slicePolyline(line: LatLng[], fromKm: number, toKm: number): LatLng[] {
  const out: LatLng[] = [pointAlong(line, fromKm).point]
  let along = 0
  for (let i = 1; i < line.length; i++) {
    along += haversineKm(line[i - 1], line[i])
    if (along > fromKm && along < toKm) out.push(line[i])
  }
  out.push(pointAlong(line, toKm).point)
  return out
}

/**
 * Deterministic road-like route used when the routing service is unreachable.
 * A gently curving path (cubic Bézier with a seeded lateral offset) sampled
 * into ~60 points; road distance is approximated with a 1.25 circuity factor.
 */
export function syntheticRoute(a: LatLng, b: LatLng): LatLng[] {
  const seed = Math.abs(Math.sin(a.lat * 12.9898 + b.lng * 78.233) * 43758.5453) % 1
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const bend = (seed - 0.5) * 0.35
  const c1 = { lat: a.lat + dy * 0.3 - dx * bend, lng: a.lng + dx * 0.3 + dy * bend }
  const c2 = { lat: a.lat + dy * 0.7 + dx * bend * 0.6, lng: a.lng + dx * 0.7 - dy * bend * 0.6 }
  const pts: LatLng[] = []
  const n = 60
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push({
      lat: u ** 3 * a.lat + 3 * u * u * t * c1.lat + 3 * u * t * t * c2.lat + t ** 3 * b.lat,
      lng: u ** 3 * a.lng + 3 * u * u * t * c1.lng + 3 * u * t * t * c2.lng + t ** 3 * b.lng,
    })
  }
  return pts
}

export const ROAD_CIRCUITY = 1.25
