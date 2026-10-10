import type { LatLng } from '../src/lib/types'
import { all, db, one, run } from './db'
import { olaDirections } from './landmarks'
import { mapplsDirections } from './mappls'
import { tomtomConfigured, tomtomRoute } from './traffic'

/**
 * Self-calibration from RideSync's own trips. At pickup we ask every traffic source how long the
 * trip will take; at drop-off we know how long it really took. The ratio actual/predicted for each
 * source, per day type and time of day, then corrects that source's future estimates — so TomTom
 * and Ola become as accurate as our real Mumbai trips show they can be.
 */

db.exec(`
CREATE TABLE IF NOT EXISTS eta_samples (
  booking_id TEXT PRIMARY KEY,
  slot TEXT NOT NULL,
  km REAL NOT NULL,
  shown INTEGER,
  tomtom INTEGER,
  ola INTEGER,
  mappls INTEGER,
  actual INTEGER,
  started_at TEXT NOT NULL
);
`)

export type Source = 'tomtom' | 'ola' | 'mappls'
export type Band = 'rush' | 'day' | 'evening' | 'night'
export type Day = 'weekday' | 'saturday' | 'sunday'

const ist = (when: Date, part: 'hour' | 'weekday') =>
  new Intl.DateTimeFormat('en-GB', part === 'hour' ? { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' } : { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(when)
export const bandOf = (when: Date): Band => {
  const h = Number(ist(when, 'hour'))
  return (h >= 8 && h < 11) || (h >= 17 && h < 21) ? 'rush' : h >= 11 && h < 17 ? 'day' : h >= 21 && h < 23 ? 'evening' : 'night'
}
export const dayOf = (when: Date): Day => {
  const d = ist(when, 'weekday')
  return d === 'Sun' ? 'sunday' : d === 'Sat' ? 'saturday' : 'weekday'
}
export const slotOf = (when: Date) => `${dayOf(when)}:${bandOf(when)}`

/** Driver picked the rider up: note what every source predicts for pickup → drop right now. */
export async function recordPickup(bookingId: string, a: LatLng, b: LatLng, shown?: number) {
  try {
    const [tt, ola, mappls] = await Promise.all([
      tomtomConfigured() ? tomtomRoute(a, b).catch(() => null) : null,
      olaDirections(a, b),
      mapplsDirections(a, b),
    ])
    const km = tt?.distanceKm ?? ola?.distanceKm ?? mappls?.distanceKm ?? 0
    run(
      `INSERT OR REPLACE INTO eta_samples (booking_id, slot, km, shown, tomtom, ola, mappls, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bookingId,
      slotOf(new Date()),
      km,
      shown ?? null,
      tt?.durationMin ?? null,
      ola?.durationMin ?? null,
      mappls?.durationMin ?? null,
      new Date().toISOString(),
    )
  } catch (e) {
    console.error('[ridesync] could not record trip-time sample', (e as Error).message)
  }
}

/** Rider dropped: store how long it really took. */
export function recordDrop(bookingId: string) {
  const s = one<{ started_at: string }>(`SELECT started_at FROM eta_samples WHERE booking_id = ?`, bookingId)
  if (!s) return
  const min = Math.round((Date.now() - new Date(s.started_at).getTime()) / 60_000)
  if (min >= 2 && min <= 240) run(`UPDATE eta_samples SET actual = ? WHERE booking_id = ?`, min, bookingId)
  factorsCache = null
}

type Factors = Partial<Record<Source, { slot: Record<string, number>; overall?: number }>>
let factorsCache: { at: number; f: Factors } | null = null
const median = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)]
const clamp = (x: number) => Math.min(3, Math.max(0.6, x))

/** actual ÷ predicted for each source: per slot with 5+ trips, overall with 8+ trips. */
export function sourceFactors(): Factors {
  if (factorsCache && Date.now() - factorsCache.at < 10 * 60_000) return factorsCache.f
  const rows = all<{ slot: string; tomtom: number | null; ola: number | null; mappls: number | null; actual: number }>(
    `SELECT slot, tomtom, ola, mappls, actual FROM eta_samples WHERE actual IS NOT NULL AND started_at >= ?`,
    new Date(Date.now() - 90 * 86_400_000).toISOString(),
  )
  const f: Factors = {}
  for (const src of ['tomtom', 'ola', 'mappls'] as Source[]) {
    const bySlot: Record<string, number[]> = {}
    const every: number[] = []
    for (const r of rows) {
      const p = r[src]
      if (!p || p < 2) continue
      const ratio = r.actual / p
      ;(bySlot[r.slot] ??= []).push(ratio)
      every.push(ratio)
    }
    const slot: Record<string, number> = {}
    for (const [k, v] of Object.entries(bySlot)) if (v.length >= 5) slot[k] = clamp(median(v))
    if (Object.keys(slot).length || every.length >= 8) f[src] = { slot, overall: every.length >= 8 ? clamp(median(every)) : undefined }
  }
  factorsCache = { at: Date.now(), f }
  return f
}

/** Correction for a source's estimate at this time, or null if we don't have enough trips yet. */
export function factorFor(src: Source, when = new Date()): number | null {
  const f = sourceFactors()[src]
  return f?.slot[slotOf(when)] ?? f?.overall ?? null
}

/** For the admin dashboard: how close trip times were to reality. */
export function accuracy() {
  const rows = all<{ shown: number | null; tomtom: number | null; ola: number | null; mappls: number | null; actual: number }>(
    `SELECT shown, tomtom, ola, mappls, actual FROM eta_samples WHERE actual IS NOT NULL ORDER BY started_at DESC LIMIT 200`,
  )
  const err = (k: 'shown' | Source) => {
    const v = rows.filter((r) => r[k]).map((r) => Math.abs(r.actual - (r[k] as number)))
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }
  return { trips: rows.length, shownErrorMin: err('shown'), tomtomErrorMin: err('tomtom'), olaErrorMin: err('ola'), mapplsErrorMin: err('mappls') }
}

/** Test hook. */
export const resetFactors = () => {
  factorsCache = null
}
