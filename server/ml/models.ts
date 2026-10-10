import { projectOnPolyline } from '../../src/lib/geo'
import { suggestFarePerSeat } from '../../src/lib/matching'
import type { LatLng } from '../../src/lib/types'
import '../calibrate' // creates eta_samples
import { all, db, one, run, type Row as DbRow } from '../db'
import { classification, importance, predictProba, predictRidge, regression, timeSplit, trainLogistic, trainRidge, type Logistic, type Ridge } from './core'

/**
 * RideSync's machine-learning models, trained on its own database:
 *   1. match  — logistic regression: will the driver accept this request? (learning to rank)
 *   2. risk   — logistic regression: will this booking end in a rider cancellation / no-show?
 *   3. eta    — ridge regression: real pickup→drop minutes from distance, time and traffic sources
 *   4. demand — seasonal time-series forecast of bookings per hour for the next 24 h
 * Each model trains only once there is enough data, reports test-set accuracy, and the app falls
 * back to its rule-based logic until then. Retrained at start-up and every 30 minutes.
 */

db.exec(`CREATE TABLE IF NOT EXISTS ml_models (name TEXT PRIMARY KEY, trained_at TEXT NOT NULL, info TEXT NOT NULL, model TEXT)`)

export type ModelInfo = {
  name: 'match' | 'risk' | 'eta' | 'demand'
  title: string
  method: string
  status: 'trained' | 'waiting'
  samples: number
  needed: number
  trainedAt?: string
  metrics?: Record<string, number | null>
  baseline?: Record<string, number | null>
  importance?: { feature: string; weight: number; direction: 'up' | 'down' }[]
  note?: string
}

const MIN = { match: 30, risk: 30, eta: 20, demand: 50 }
const models: { match?: Logistic; risk?: Logistic; eta?: Ridge } = {}
const infos = new Map<string, ModelInfo>()
let forecast: { hours: { at: string; expected: number }[]; areas: { area: string; trips: number }[]; backtestMae: number | null } | null = null

/* ---- Features --------------------------------------------------------------- */

const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date(iso)))
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const cyc = (h: number) => [Math.sin((2 * Math.PI * h) / 24), Math.cos((2 * Math.PI * h) / 24)]
const weekend = (iso: string) => (['Sat', 'Sun'].includes(dayOf(iso)) ? 1 : 0)
const rush = (h: number) => ((h >= 8 && h < 11) || (h >= 17 && h < 21) ? 1 : 0)

/** Rider's track record before a moment in time (no peeking at the future). */
function riderHistory(riderId: string, before: string) {
  const r = one<{ done: number; cancels: number; total: number }>(
    `SELECT SUM(status = 'completed') done, SUM(status = 'cancelled' AND cancelled_by = 'rider') cancels, SUM(status = 'completed' OR (status = 'cancelled' AND cancelled_by = 'rider')) total FROM bookings WHERE rider_id = ? AND created_at < ?`,
    riderId,
    before,
  )
  const total = Number(r?.total ?? 0)
  return { done: Number(r?.done ?? 0), cancelRate: total ? Number(r?.cancels ?? 0) / total : 0.1 }
}
const driverRating = (driverId: string, before: string) =>
  Number(one<{ r: number }>(`SELECT AVG(rider_rating) r FROM bookings b JOIN rides x ON x.id = b.ride_id WHERE x.driver_id = ? AND b.rider_rating IS NOT NULL AND b.created_at < ?`, driverId, before)?.r ?? 4.5)
const together = (riderId: string, driverId: string, before: string) =>
  Number(one<{ n: number }>(`SELECT COUNT(*) n FROM bookings b JOIN rides x ON x.id = b.ride_id WHERE b.rider_id = ? AND x.driver_id = ? AND b.status = 'completed' AND b.created_at < ?`, riderId, driverId, before)?.n ?? 0)

export const MATCH_FEATURES = ['match score', 'pickup off route (km)', 'drop off route (km)', 'hours booked ahead', 'driver rating', 'rider trips done', 'rider cancel rate', 'rides together before', 'seats', 'price vs suggested', 'ID verified', 'hour (sin)', 'hour (cos)']
export function matchFeatures(b: DbRow, r: DbRow): number[] {
  const route = JSON.parse(String(r.route)) as LatLng[]
  const pickup = JSON.parse(String(b.pickup)) as LatLng
  const drop = JSON.parse(String(b.drop_place)) as LatLng
  const created = String(b.created_at ?? new Date().toISOString())
  const h = riderHistory(String(b.rider_id), created)
  const fuel = (one<{ fuel: string }>(`SELECT fuel FROM vehicles WHERE id = ?`, r.vehicle_id)?.fuel ?? 'petrol') as 'petrol'
  const suggested = suggestFarePerSeat(Number(r.distance_km), Number(r.seats_total), fuel)
  const verified = one<{ s: string }>(`SELECT id_status s FROM users WHERE id = ?`, b.rider_id)?.s === 'verified' ? 1 : 0
  return [
    Number(b.match_score) / 100,
    route.length > 1 ? projectOnPolyline(pickup, route).distanceKm : 0,
    route.length > 1 ? projectOnPolyline(drop, route).distanceKm : 0,
    Math.min(72, Math.max(0, (new Date(String(r.depart_at)).getTime() - new Date(created).getTime()) / 3.6e6)),
    driverRating(String(r.driver_id), created),
    Math.min(30, h.done),
    h.cancelRate,
    Math.min(10, together(String(b.rider_id), String(r.driver_id), created)),
    Number(b.seats),
    suggested ? Number(r.fare_per_seat) / suggested : 1,
    verified,
    ...cyc(hourOf(String(r.depart_at))),
  ]
}

export const RISK_FEATURES = ['rider trips done', 'rider cancel rate', 'hours booked ahead', 'weekend', 'rush hour', 'seats', 'ID verified', 'has profile photo', 'match score', 'hour (sin)', 'hour (cos)']
export function riskFeatures(b: DbRow, r: DbRow): number[] {
  const created = String(b.created_at ?? new Date().toISOString())
  const h = riderHistory(String(b.rider_id), created)
  const u = one<{ id_status: string; photo: string | null }>(`SELECT id_status, photo FROM users WHERE id = ?`, b.rider_id)
  const hour = hourOf(String(r.depart_at))
  return [
    Math.min(30, h.done),
    h.cancelRate,
    Math.min(72, Math.max(0, (new Date(String(r.depart_at)).getTime() - new Date(created).getTime()) / 3.6e6)),
    weekend(String(r.depart_at)),
    rush(hour),
    Number(b.seats),
    u?.id_status === 'verified' ? 1 : 0,
    u?.photo ? 1 : 0,
    Number(b.match_score) / 100,
    ...cyc(hour),
  ]
}

export const ETA_FEATURES = ['distance (km)', 'TomTom minutes', 'Ola minutes', 'Mappls minutes', 'rush hour', 'weekend', 'hour (sin)', 'hour (cos)']
export function etaFeatures(s: { km: number; tomtom: number | null; ola: number | null; mappls: number | null; at: string }): number[] {
  const tt = s.tomtom ?? Math.max(2, s.km * 2.5)
  const hour = hourOf(s.at)
  return [s.km, tt, s.ola ?? tt, s.mappls ?? s.ola ?? tt, rush(hour), weekend(s.at), ...cyc(hour)]
}

/* ---- Training ------------------------------------------------------------- */

function save(info: ModelInfo, model?: unknown) {
  infos.set(info.name, info)
  run(`INSERT OR REPLACE INTO ml_models (name, trained_at, info, model) VALUES (?, ?, ?, ?)`, info.name, info.trainedAt ?? new Date().toISOString(), JSON.stringify(info), model ? JSON.stringify(model) : null)
}

const ACCEPTED = `('accepted','confirmed','driver_arriving','driver_arrived','in_progress','completed')`

function trainMatch() {
  const rows = all(`SELECT b.*, b.id AS bid FROM bookings b WHERE b.status IN ${ACCEPTED.slice(0, -1)},'rejected','expired') ORDER BY b.created_at`)
  const X: number[][] = []
  const y: number[] = []
  for (const b of rows) {
    const r = one(`SELECT * FROM rides WHERE id = ?`, b.ride_id)
    if (!r) continue
    X.push(matchFeatures(b, r))
    y.push(['rejected', 'expired'].includes(String(b.status)) ? 0 : 1)
  }
  const base: ModelInfo = { name: 'match', title: 'Smart ride matching', method: 'Logistic regression (learning to rank)', status: 'waiting', samples: X.length, needed: MIN.match }
  if (X.length < MIN.match || new Set(y).size < 2) return save({ ...base, note: 'Learns which requests drivers accept. Until then rides are ranked by the rule-based match score.' })
  const idx = X.map((_, i) => i)
  const { train, test } = timeSplit(idx)
  const m = trainLogistic(MATCH_FEATURES, train.map((i) => X[i]), train.map((i) => y[i]))
  const metrics = classification(test.map((i) => y[i]), test.map((i) => predictProba(m, X[i])))
  const baseline = classification(test.map((i) => y[i]), test.map((i) => X[i][0]))
  const full = trainLogistic(MATCH_FEATURES, X, y)
  models.match = full
  save({ ...base, status: 'trained', trainedAt: new Date().toISOString(), metrics, baseline: { auc: baseline.auc }, importance: importance(full) }, full)
}

function trainRisk() {
  const rows = all(
    `SELECT * FROM bookings WHERE status = 'completed' OR (status = 'cancelled' AND cancelled_by = 'rider' AND (payment_method IS NOT NULL OR cancel_reason LIKE '%no-show%' OR arrived_at IS NOT NULL)) ORDER BY created_at`,
  )
  const X: number[][] = []
  const y: number[] = []
  for (const b of rows) {
    const r = one(`SELECT * FROM rides WHERE id = ?`, b.ride_id)
    if (!r) continue
    X.push(riskFeatures(b, r))
    y.push(b.status === 'completed' ? 0 : 1)
  }
  const base: ModelInfo = { name: 'risk', title: 'No-show & cancellation risk', method: 'Logistic regression (classification)', status: 'waiting', samples: X.length, needed: MIN.risk }
  if (X.length < MIN.risk || new Set(y).size < 2) return save({ ...base, note: 'Needs completed and cancelled/no-show bookings to learn from.' })
  const idx = X.map((_, i) => i)
  const { train, test } = timeSplit(idx)
  const m = trainLogistic(RISK_FEATURES, train.map((i) => X[i]), train.map((i) => y[i]))
  const metrics = classification(test.map((i) => y[i]), test.map((i) => predictProba(m, X[i])))
  // Baseline: the rider's past cancel rate alone.
  const baseline = classification(test.map((i) => y[i]), test.map((i) => X[i][1]))
  const full = trainLogistic(RISK_FEATURES, X, y)
  models.risk = full
  save({ ...base, status: 'trained', trainedAt: new Date().toISOString(), metrics, baseline: { auc: baseline.auc }, importance: importance(full) }, full)
}

function trainEta() {
  const rows = all<{ km: number; tomtom: number | null; ola: number | null; mappls: number | null; actual: number; started_at: string }>(
    `SELECT km, tomtom, ola, mappls, actual, started_at FROM eta_samples WHERE actual IS NOT NULL AND km > 0 ORDER BY started_at`,
  )
  const base: ModelInfo = { name: 'eta', title: 'Trip-time prediction', method: 'Ridge regression', status: 'waiting', samples: rows.length, needed: MIN.eta }
  if (rows.length < MIN.eta) return save({ ...base, note: 'Learns from real pickup→drop times. Until then TomTom/Ola/Mappls with self-calibration are used.' })
  const X = rows.map((s) => etaFeatures({ ...s, at: s.started_at }))
  const y = rows.map((s) => s.actual)
  const idx = X.map((_, i) => i)
  const { train, test } = timeSplit(idx)
  const m = trainRidge(ETA_FEATURES, train.map((i) => X[i]), train.map((i) => y[i]), 2)
  const metrics = regression(test.map((i) => y[i]), test.map((i) => predictRidge(m, X[i])))
  const baseline = regression(test.map((i) => y[i]), test.map((i) => X[i][1]))
  const full = trainRidge(ETA_FEATURES, X, y, 2)
  models.eta = full
  save({ ...base, status: 'trained', trainedAt: new Date().toISOString(), metrics: { maeMin: metrics.mae, rmseMin: metrics.rmse, r2: metrics.r2 }, baseline: { tomtomMaeMin: baseline.mae }, importance: importance(full) }, full)
}

/** Seasonal forecast: same hour-of-week in past weeks, recent weeks weigh more (0.6ᵏ decay). */
function trainDemand() {
  const since = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString()
  const rows = all<{ created_at: string; pickup: string }>(`SELECT created_at, pickup FROM bookings WHERE created_at >= ?`, since)
  const base: ModelInfo = { name: 'demand', title: 'Ride demand forecast', method: 'Seasonal time-series (weighted same-hour-of-week)', status: 'waiting', samples: rows.length, needed: MIN.demand }
  if (rows.length < MIN.demand) {
    forecast = null
    return save({ ...base, note: 'Needs a few weeks of bookings to forecast busy hours.' })
  }
  const H = 3600_000
  const hourIdx = (t: number) => Math.floor(t / H)
  const counts = new Map<number, number>()
  for (const r of rows) counts.set(hourIdx(new Date(r.created_at).getTime()), (counts.get(hourIdx(new Date(r.created_at).getTime())) ?? 0) + 1)
  const predictAt = (h: number, upTo: number) => {
    let s = 0
    let wsum = 0
    for (let k = 1; k <= 8; k++) {
      const past = h - k * 168
      if (past > upTo || past < hourIdx(new Date(since).getTime())) continue
      const w = 0.6 ** (k - 1)
      s += w * (counts.get(past) ?? 0)
      wsum += w
    }
    return wsum ? s / wsum : 0
  }
  const now = hourIdx(Date.now())
  // Backtest: forecast each hour of the last 7 days using only data before it.
  const errs: number[] = []
  for (let h = now - 168; h < now; h++) errs.push(Math.abs((counts.get(h) ?? 0) - predictAt(h, h - 1)))
  const mae = Math.round((errs.reduce((a, v) => a + v, 0) / errs.length) * 100) / 100
  const hours = Array.from({ length: 24 }, (_, i) => ({ at: new Date((now + 1 + i) * H).toISOString(), expected: Math.round(predictAt(now + 1 + i, now) * 10) / 10 }))
  // Busiest pickup areas for tomorrow's weekday.
  const tomorrow = dayOf(new Date(Date.now() + 86_400_000).toISOString())
  const areas = new Map<string, number>()
  for (const r of rows) if (dayOf(r.created_at) === tomorrow) {
    const p = JSON.parse(r.pickup) as { name?: string; area?: string }
    const k = p.area || p.name || 'Other'
    areas.set(k, (areas.get(k) ?? 0) + 1)
  }
  forecast = { hours, areas: [...areas].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([area, trips]) => ({ area, trips })), backtestMae: mae }
  save({ ...base, status: 'trained', trainedAt: new Date().toISOString(), metrics: { maeTripsPerHour: mae, next24h: Math.round(hours.reduce((a, v) => a + v.expected, 0)) } })
}

export function trainAll() {
  for (const [name, fn] of [['match', trainMatch], ['risk', trainRisk], ['eta', trainEta], ['demand', trainDemand]] as const) {
    try {
      fn()
    } catch (e) {
      console.error(`[ridesync] ML ${name} training failed`, (e as Error).message)
    }
  }
}

/* ---- Using the models ------------------------------------------------------- */

/** Probability (0–1) the driver accepts this request, or null if the model isn't trained yet. */
export function acceptChance(b: DbRow, r: DbRow): number | null {
  return models.match ? predictProba(models.match, matchFeatures(b, r)) : null
}

/** Probability (0–1) the rider cancels / doesn't show, or null if not trained. */
export function noShowRisk(b: DbRow, r: DbRow): number | null {
  return models.risk ? predictProba(models.risk, riskFeatures(b, r)) : null
}

/** ML trip-time in minutes, or null if not trained. */
export function predictEta(s: { km: number; tomtom: number | null; ola: number | null; mappls: number | null; at?: string }): number | null {
  if (!models.eta) return null
  return Math.max(1, Math.round(predictRidge(models.eta, etaFeatures({ ...s, at: s.at ?? new Date().toISOString() }))))
}

const TITLES: Record<ModelInfo['name'], [string, string]> = {
  match: ['Smart ride matching', 'Logistic regression (learning to rank)'],
  risk: ['No-show & cancellation risk', 'Logistic regression (classification)'],
  eta: ['Trip-time prediction', 'Ridge regression'],
  demand: ['Ride demand forecast', 'Seasonal time-series (weighted same-hour-of-week)'],
}
export function mlReport(): { models: ModelInfo[]; forecast: typeof forecast } {
  return {
    models: (['match', 'risk', 'eta', 'demand'] as const).map((n) => infos.get(n) ?? { name: n, title: TITLES[n][0], method: TITLES[n][1], status: 'waiting', samples: 0, needed: MIN[n] }),
    forecast,
  }
}

/** Test hook. */
export const resetModels = () => {
  delete models.match
  delete models.risk
  delete models.eta
  infos.clear()
  forecast = null
}
