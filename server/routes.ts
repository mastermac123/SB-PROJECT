import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { haversineKm } from '../src/lib/geo'
import { desiredTime, scoreRide, suggestFarePerSeat } from '../src/lib/matching'
import type {
  BookingDetail,
  DriverLocation,
  MatchResult,
  PaymentRecord,
  RideDetail,
  SearchQuery,
  Thread,
  Trips,
} from '../src/lib/types'
import { formatPlate, validatePhone, validatePlate, validateStudentId } from '../src/lib/validation'
import { endSession, otpEnabled, requestCode, requireOnboarded, requireUser, startSession, upsertUser, verifyCode, verifyGoogle } from './auth'
import { all, one, run, tx, type Row } from './db'
import { env } from './env'
import { addStream, broadcastSync, emit, sync } from './events'
import {
  ACTIVE,
  HOLDING,
  HttpError,
  bookingRow,
  first,
  meUser,
  money,
  newId,
  notify,
  nowIso,
  publicUser,
  rideParticipants,
  rideRow,
  seatsBooked,
  systemMessage,
  toBooking,
  toRide,
  vehicleFor,
} from './logic'
import { getRoute } from './routing'
import { mapsConfig, reverseGeocode, searchPlaces } from './maps'
import { microsoftCallback, microsoftStart } from './microsoft'
import { microsoftConfigured, razorpayConfigured, anyMailConfigured } from './env'
import { createOrder, refundPayment, verifyPaymentSignature, verifyWebhookSignature } from './razorpay'

export const api = Router()

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res))
    .then((out) => {
      if (!res.headersSent) res.json(out ?? { ok: true })
    })
    .catch(next)
}
const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw new HttpError(400, issue?.message ?? 'Invalid request', issue?.path.join('.'))
  }
  return r.data
}
const me = (req: Request) => req.user!
const meId = (req: Request) => String(req.user!.id)
const param = (req: Request, k: string) => String(req.params[k])

/* ---- Schemas -------------------------------------------------------------- */

const PlaceZ = z.object({
  id: z.string().max(80),
  name: z.string().min(1).max(120),
  area: z.string().max(200).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.enum(['campus', 'station', 'airport', 'area', 'custom']).optional(),
})
const PrefZ = z.enum(['quiet', 'female_friendly', 'no_smoking', 'no_pets', 'minimal_detour', 'music_ok', 'ac'])
const QueryZ = z.object({
  pickup: PlaceZ,
  drop: PlaceZ,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  at: z.string().datetime().optional(),
  seats: z.number().int().min(1).max(6),
  preferences: z.array(PrefZ).max(7).default([]),
})

/* ---- Config & auth -------------------------------------------------------- */

api.get('/config', (_req, res) => {
  res.json({ allowedDomain: env.allowedDomain, googleClientId: env.googleClientId || null, microsoftLogin: microsoftConfigured(), emailLogin: otpEnabled(), codesInTerminal: otpEnabled() && !anyMailConfigured(), devLogin: env.devLogin, razorpayKeyId: razorpayConfigured() ? env.razorpay.keyId : null, maps: mapsConfig() })
})

// Full-page redirects (GET), so they work in every mobile browser.
api.get(
  '/auth/microsoft/start',
  h(async (req, res) => {
    if (!microsoftConfigured()) throw new HttpError(404, 'Microsoft sign-in isn’t configured on this server.')
    await microsoftStart(req, res)
  }),
)
api.get('/auth/microsoft/callback', h((req, res) => microsoftCallback(req, res)))

api.post(
  '/auth/google',
  h(async (req, res) => {
    const { credential } = parse(z.object({ credential: z.string().min(20) }), req.body)
    const profile = await verifyGoogle(credential)
    const { user, isNew } = upsertUser(profile.email, profile)
    startSession(res, String(user.id))
    return { user: meUser(user), isNew }
  }),
)

api.post(
  '/auth/code/request',
  h(async (req) => {
    const { email } = parse(z.object({ email: z.string().email('Enter a valid email address') }), req.body)
    await requestCode(email, req.ip ?? 'unknown')
    return { ok: true }
  }),
)

api.post(
  '/auth/code/verify',
  h((req, res) => {
    const { email, code } = parse(z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body)
    const verified = verifyCode(email, code)
    const { user, isNew } = upsertUser(verified)
    startSession(res, String(user.id))
    return { user: meUser(user), isNew }
  }),
)

api.post(
  '/auth/dev',
  h((req, res) => {
    if (!env.devLogin) throw new HttpError(404, 'Not found')
    const { email } = parse(z.object({ email: z.string().email() }), req.body)
    const { user, isNew } = upsertUser(email)
    startSession(res, String(user.id))
    return { user: meUser(user), isNew }
  }),
)

api.post('/auth/logout', (req, res) => {
  endSession(req, res)
  res.json({ ok: true })
})

/* ---- Profile -------------------------------------------------------------- */

api.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  res.json(meUser(req.user))
})

const ProfileZ = z.object({
  name: z.string().trim().min(3, 'Enter your full name').max(80).optional(),
  phone: z.string().max(20).optional(),
  studentId: z.string().max(20).optional(),
  programme: z.string().max(80).optional(),
  gender: z.enum(['female', 'male', 'other', 'undisclosed']).optional(),
  commute: z.enum(['driver', 'rider', 'both']).optional(),
  upiId: z
    .string()
    .trim()
    .max(80)
    .regex(/^$|^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, 'UPI IDs look like name@bank')
    .optional(),
  preferences: z.array(PrefZ).max(7).optional(),
  emergencyContacts: z.array(z.object({ name: z.string().trim().min(1).max(60), phone: z.string().max(20) })).max(3).optional(),
  photo: z
    .string()
    .max(300_000)
    .regex(/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/, 'Unsupported photo')
    .optional(),
  onboarded: z.literal(true).optional(),
})

api.patch(
  '/me',
  requireUser,
  h((req) => {
    const p = parse(ProfileZ, req.body)
    if (p.phone !== undefined) {
      const err = validatePhone(p.phone)
      if (err) throw new HttpError(400, err, 'phone')
      p.phone = p.phone.replace(/\D/g, '').slice(-10)
    }
    if (p.studentId !== undefined) {
      const err = validateStudentId(p.studentId)
      if (err) throw new HttpError(400, err, 'studentId')
      p.studentId = p.studentId.trim().toUpperCase()
      const clash = one(`SELECT id FROM users WHERE student_id = ? AND id != ? AND deleted = 0`, p.studentId, meId(req))
      if (clash) throw new HttpError(409, 'This student ID is already linked to another account.', 'studentId')
    }
    for (const c of p.emergencyContacts ?? []) {
      if (validatePhone(c.phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number for your emergency contact', 'emergencyContacts')
      c.phone = c.phone.replace(/\D/g, '').slice(-10)
    }
    if (p.onboarded) {
      const u = { ...me(req), phone: p.phone ?? me(req).phone, student_id: p.studentId ?? me(req).student_id }
      if (!u.phone || !u.student_id) throw new HttpError(400, 'Add your mobile number and student ID to continue.')
    }
    const cols: [string, unknown][] = []
    if (p.name !== undefined) cols.push(['name', p.name])
    if (p.phone !== undefined) cols.push(['phone', p.phone])
    if (p.studentId !== undefined) cols.push(['student_id', p.studentId])
    if (p.programme !== undefined) cols.push(['programme', p.programme || null])
    if (p.gender !== undefined) cols.push(['gender', p.gender])
    if (p.commute !== undefined) cols.push(['commute', p.commute])
    if (p.upiId !== undefined) cols.push(['upi_id', p.upiId || null])
    if (p.preferences !== undefined) cols.push(['preferences', JSON.stringify(p.preferences)])
    if (p.emergencyContacts !== undefined) cols.push(['emergency_contacts', JSON.stringify(p.emergencyContacts)])
    if (p.photo !== undefined) cols.push(['photo', p.photo])
    if (p.onboarded) cols.push(['onboarded', 1])
    if (cols.length) run(`UPDATE users SET ${cols.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map(([, v]) => v), meId(req))
    return meUser(one(`SELECT * FROM users WHERE id = ?`, meId(req))!)
  }),
)

api.put(
  '/me/vehicle',
  requireUser,
  h((req) => {
    const v = parse(
      z.object({
        make: z.string().trim().min(1, 'Enter the make').max(40),
        model: z.string().trim().min(1, 'Enter the model').max(40),
        color: z.string().trim().min(1, 'Enter the colour').max(30),
        plate: z.string().trim().max(20),
        seats: z.number().int().min(1).max(7),
        fuel: z.enum(['petrol', 'diesel', 'cng', 'ev']),
      }),
      req.body,
    )
    const err = validatePlate(v.plate)
    if (err) throw new HttpError(400, err, 'plate')
    const existing = vehicleFor(meId(req))
    if (existing) run(`UPDATE vehicles SET make=?, model=?, color=?, plate=?, seats=?, fuel=? WHERE user_id = ?`, v.make, v.model, v.color, formatPlate(v.plate), v.seats, v.fuel, meId(req))
    else run(`INSERT INTO vehicles (id, user_id, make, model, color, plate, seats, fuel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, newId('v'), meId(req), v.make, v.model, v.color, formatPlate(v.plate), v.seats, v.fuel)
    if (me(req).commute === 'rider' || !me(req).commute) run(`UPDATE users SET commute = 'both' WHERE id = ?`, meId(req))
    return meUser(one(`SELECT * FROM users WHERE id = ?`, meId(req))!)
  }),
)

api.delete(
  '/me/vehicle',
  requireUser,
  h((req) => {
    const active = one(`SELECT id FROM rides WHERE driver_id = ? AND status IN ('scheduled','in_progress')`, meId(req))
    if (active) throw new HttpError(409, 'Cancel or finish your offered rides before removing your car.')
    run(`DELETE FROM vehicles WHERE user_id = ?`, meId(req))
    run(`UPDATE users SET commute = 'rider' WHERE id = ?`, meId(req))
    return meUser(one(`SELECT * FROM users WHERE id = ?`, meId(req))!)
  }),
)

api.delete(
  '/me',
  requireUser,
  h(async (req, res) => {
    const id = meId(req)
    const affected = new Set<string>()
    tx(() => {
      for (const r of all(`SELECT id FROM rides WHERE driver_id = ? AND status = 'scheduled'`, id)) {
        cancelRideInternal(String(r.id), 'Driver deleted their account', affected)
      }
      for (const b of all(`SELECT * FROM bookings WHERE rider_id = ? AND status IN ('pending','accepted','confirmed')`, id)) {
        run(`UPDATE bookings SET status='cancelled', cancelled_by='rider', cancel_reason='Rider deleted their account', updated_at=? WHERE id = ?`, nowIso(), b.id)
        scheduleRefund(b)
        affected.add(String(rideRow(String(b.ride_id)).driver_id))
      }
      run(`UPDATE users SET deleted = 1, email = ?, phone = '', student_id = '', upi_id = NULL, photo = NULL, emergency_contacts = '[]' WHERE id = ?`, `deleted+${id}@deleted.invalid`, id)
      run(`DELETE FROM vehicles WHERE user_id = ?`, id)
      run(`DELETE FROM sessions WHERE user_id = ?`, id)
    })
    res.clearCookie('rs_session', { path: '/' })
    await flushRefunds()
    sync(affected)
    broadcastSync()
  }),
)

/* ---- Live events ---------------------------------------------------------- */

api.get('/events', requireUser, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.write(': connected\n\n')
  const remove = addStream(meId(req), res)
  req.on('close', remove)
})

/* ---- Places ---------------------------------------------------------------- */

const placeHits = new Map<string, { n: number; since: number }>()
function placeRateLimit(userId: string) {
  const now = Date.now()
  const h = placeHits.get(userId)
  if (h && now - h.since < 60_000) {
    if (++h.n > 40) throw new HttpError(429, 'Slow down a little — too many searches.')
  } else placeHits.set(userId, { n: 1, since: now })
}

api.get(
  '/places',
  requireUser,
  h(async (req) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 3 || q.length > 100) return []
    placeRateLimit(meId(req))
    return searchPlaces(q)
  }),
)

api.get(
  '/places/reverse',
  requireUser,
  h(async (req) => {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'Invalid location')
    placeRateLimit(meId(req))
    return (await reverseGeocode(lat, lng)) ?? { name: 'Current location', area: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
  }),
)

/* ---- Routing preview ------------------------------------------------------ */

api.post(
  '/route',
  requireUser,
  h(async (req) => {
    const { from, to } = parse(z.object({ from: PlaceZ, to: PlaceZ }), req.body)
    return getRoute(from, to)
  }),
)

/* ---- Rides: discovery ----------------------------------------------------- */

function riderHistory(userId: string) {
  const bookings = all(`SELECT * FROM bookings WHERE rider_id = ? AND status = 'completed'`, userId).map(toBooking)
  const rides = bookings.map((b) => toRide(rideRow(b.rideId)))
  return { bookings, rides }
}

function scoreFor(rideRowData: Row, query: SearchQuery, userId: string, hist = riderHistory(userId)): MatchResult | null {
  const ride = toRide(rideRowData)
  const driverRow = one(`SELECT * FROM users WHERE id = ? AND deleted = 0`, ride.driverId)
  const vehicle = vehicleFor(ride.driverId)
  if (!driverRow || !vehicle) return null
  const driver = { ...publicUser(driverRow), gender: driverRow.gender as never }
  return scoreRide({ query, ride, route: { coords: ride.route, distanceKm: ride.distanceKm, durationMin: ride.durationMin }, driver, vehicle, history: hist.bookings, rides: hist.rides })
}

api.post(
  '/rides/search',
  requireOnboarded,
  h((req) => {
    const query = parse(QueryZ, req.body) as SearchQuery
    const target = desiredTime(query).getTime()
    const lo = new Date(Math.max(Date.now(), target - 4.5 * 3600_000)).toISOString()
    const hi = new Date(target + 4.5 * 3600_000).toISOString()
    const rows = all(`SELECT * FROM rides WHERE status = 'scheduled' AND driver_id != ? AND depart_at > ? AND depart_at < ?`, meId(req), lo, hi)
    const hist = riderHistory(meId(req))
    const results = rows.map((r) => scoreFor(r, query, meId(req), hist)).filter((m): m is MatchResult => !!m)
    return { results: results.sort((a, b) => b.score - a.score), ridesInWindow: rows.length }
  }),
)

/** Rides leaving soon from anyone in the community — powers the Home feed. */
api.get(
  '/rides/feed',
  requireOnboarded,
  h((req) => {
    const rows = all(
      `SELECT * FROM rides WHERE status = 'scheduled' AND driver_id != ? AND depart_at > ? AND depart_at < ? ORDER BY depart_at LIMIT 20`,
      meId(req),
      nowIso(),
      new Date(Date.now() + 3 * 86_400_000).toISOString(),
    )
    return rows
      .map((r) => {
        const ride = toRide(r)
        const vehicle = vehicleFor(ride.driverId)
        return vehicle ? { ride: { ...ride, route: ride.route.filter((_, i) => i % 4 === 0) }, driver: publicUser(ride.driverId), vehicle } : null
      })
      .filter(Boolean)
  }),
)

function canSeeLocation(rideId: string, userId: string, driverId: string) {
  if (userId === driverId) return true
  return !!one(`SELECT 1 FROM bookings WHERE ride_id = ? AND rider_id = ? AND status IN ('confirmed','driver_arriving','driver_arrived','in_progress')`, rideId, userId)
}

api.get(
  '/rides/:id',
  requireOnboarded,
  h((req) => {
    const r = rideRow(param(req, 'id'))
    const ride = toRide(r, { location: canSeeLocation(String(r.id), meId(req), String(r.driver_id)) })
    const vehicle = vehicleFor(ride.driverId)
    if (!vehicle) throw new HttpError(404, 'This ride is no longer available.')
    const mine = one(`SELECT * FROM bookings WHERE ride_id = ? AND rider_id = ? ORDER BY created_at DESC LIMIT 1`, ride.id, meId(req))
    const out: RideDetail = { ride, driver: publicUser(ride.driverId), vehicle, myBooking: mine ? toBooking(mine) : undefined }
    if (ride.driverId === meId(req)) {
      out.bookings = all(`SELECT * FROM bookings WHERE ride_id = ? ORDER BY created_at`, ride.id).map((b) => {
        const bk = toBooking(b)
        const riderRow = one(`SELECT * FROM users WHERE id = ?`, bk.riderId)
        return { ...bk, rider: { ...publicUser(riderRow ?? bk.riderId), phone: HOLDING.includes(bk.status) && riderRow ? String(riderRow.phone) : undefined } }
      })
    }
    return out
  }),
)

api.post(
  '/rides/:id/match',
  requireOnboarded,
  h((req) => {
    const query = parse(z.object({ query: QueryZ }), req.body).query as SearchQuery
    return { match: scoreFor(rideRow(param(req, 'id')), query, meId(req)) }
  }),
)

/* ---- Rides: offering ------------------------------------------------------ */

api.post(
  '/rides',
  requireOnboarded,
  h(async (req) => {
    const p = parse(
      z.object({
        origin: PlaceZ,
        destination: PlaceZ,
        departAt: z.string().datetime(),
        seats: z.number().int().min(1).max(7),
        farePerSeat: z.number().int().min(0).max(5000),
        maxDetourKm: z.number().min(0).max(10),
        preferences: z.array(PrefZ).max(7).default([]),
        note: z.string().max(200).optional(),
      }),
      req.body,
    )
    const vehicle = vehicleFor(meId(req))
    if (!vehicle) throw new HttpError(400, 'Add your car before offering a ride.', 'vehicle')
    if (p.seats > vehicle.seats) throw new HttpError(400, `Your ${vehicle.model} has ${vehicle.seats} passenger seats.`, 'seats')
    const depart = new Date(p.departAt)
    if (depart.getTime() < Date.now() + 10 * 60_000) throw new HttpError(400, 'Departure must be at least 10 minutes from now.', 'time')
    if (depart.getTime() > Date.now() + 30 * 86_400_000) throw new HttpError(400, 'You can offer rides up to 30 days ahead.', 'time')
    if (haversineKm(p.origin, p.destination) < 0.3) throw new HttpError(400, 'Pickup and destination are the same place.', 'drop')
    const clash = one(
      `SELECT id FROM rides WHERE driver_id = ? AND status IN ('scheduled','in_progress') AND ABS(strftime('%s', depart_at) - strftime('%s', ?)) < 3600`,
      meId(req),
      depart.toISOString(),
    )
    if (clash) throw new HttpError(409, 'You already have a ride within an hour of this time.', 'time')

    const route = await getRoute(p.origin, p.destination)
    const suggested = suggestFarePerSeat(route.distanceKm, p.seats, vehicle.fuel)
    const cap = Math.round((suggested * 1.5) / 10) * 10
    if (p.farePerSeat > cap) throw new HttpError(400, `RideSync is for cost-sharing — the maximum for this trip is ${money(cap)} per seat.`, 'fare')

    const id = newId('r')
    run(
      `INSERT INTO rides (id, driver_id, origin, destination, depart_at, seats_total, fare_per_seat, max_detour_km, preferences, vehicle_id, note, status, route, distance_km, duration_min, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
      id,
      meId(req),
      JSON.stringify(p.origin),
      JSON.stringify(p.destination),
      depart.toISOString(),
      p.seats,
      p.farePerSeat,
      p.maxDetourKm,
      JSON.stringify(p.preferences),
      vehicle.id,
      p.note?.trim() || null,
      JSON.stringify(route.coords),
      Math.round(route.distanceKm * 10) / 10,
      route.durationMin,
      nowIso(),
    )
    if (me(req).commute === 'rider' || !me(req).commute) run(`UPDATE users SET commute = 'both' WHERE id = ?`, meId(req))
    broadcastSync()
    return toRide(rideRow(id))
  }),
)

function assertDriver(rideId: string, userId: string) {
  const r = rideRow(rideId)
  if (String(r.driver_id) !== userId) throw new HttpError(403, 'Only the driver can do this.')
  return r
}

/* ---- Gateway refunds ------------------------------------------------------ */

const refundQueue: string[] = []
/** Mark a booking for an automatic gateway refund; call flushRefunds() after the DB change commits. */
function scheduleRefund(b: Row) {
  if (b.payment_status === 'paid_online' && b.gateway_payment_id) refundQueue.push(String(b.id))
}

async function flushRefunds() {
  const ids = refundQueue.splice(0)
  await Promise.all(
    ids.map(async (id) => {
      const b = one(`SELECT * FROM bookings WHERE id = ?`, id)
      if (!b || b.payment_status !== 'paid_online') return
      try {
        const refund = await refundPayment(String(b.gateway_payment_id), Number(b.fare), { booking: id })
        run(`UPDATE bookings SET payment_status = 'refunded', refund_id = ?, updated_at = ? WHERE id = ?`, refund.id, nowIso(), id)
        notify(String(b.rider_id), 'payment', 'Refund started', `${money(Number(b.fare))} is on its way back to your original payment method (usually 5–7 working days).`, `/trip/${id}`)
      } catch (e) {
        console.error('[ridesync] refund failed', id, e)
        notify(String(b.rider_id), 'payment', 'Refund pending', `We couldn’t start your ${money(Number(b.fare))} refund automatically. We’ll retry — contact support if it doesn’t arrive.`, `/trip/${id}`)
      }
      sync([String(b.rider_id)])
    }),
  )
}

const paidDirectly = (b: Row) => b.payment_status === 'marked_paid' || b.payment_status === 'received'

function cancelRideInternal(rideId: string, reason: string, affected: Set<string>) {
  const r = rideRow(rideId)
  run(`UPDATE rides SET status = 'cancelled', ended_at = ? WHERE id = ?`, nowIso(), rideId)
  for (const b of all(`SELECT * FROM bookings WHERE ride_id = ? AND status IN (${ACTIVE.map((s) => `'${s}'`).join(',')})`, rideId)) {
    run(`UPDATE bookings SET status = 'cancelled', cancelled_by = 'driver', cancel_reason = ?, updated_at = ? WHERE id = ?`, reason, nowIso(), b.id)
    scheduleRefund(b)
    const paidNote =
      b.payment_status === 'paid_online'
        ? ' Your online payment will be refunded automatically.'
        : paidDirectly(b)
          ? ` Ask ${first(String(one(`SELECT name FROM users WHERE id = ?`, r.driver_id)?.name ?? 'the driver'))} to refund your UPI payment.`
          : ''
    notify(String(b.rider_id), 'cancelled', 'Your ride was cancelled', `${reason}.${paidNote} Find another match on RideSync.`, `/trip/${b.id}`)
    affected.add(String(b.rider_id))
  }
}

api.post(
  '/rides/:id/cancel',
  requireOnboarded,
  h(async (req) => {
    const { reason } = parse(z.object({ reason: z.string().max(120).default('Driver’s plans changed') }), req.body ?? {})
    const r = assertDriver(param(req, 'id'), meId(req))
    if (r.status !== 'scheduled') throw new HttpError(409, 'Only scheduled rides can be cancelled.')
    const affected = new Set<string>([meId(req)])
    tx(() => cancelRideInternal(String(r.id), reason, affected))
    await flushRefunds()
    sync(affected)
    broadcastSync()
  }),
)

api.post(
  '/rides/:id/start',
  requireOnboarded,
  h((req) => {
    const r = assertDriver(param(req, 'id'), meId(req))
    if (r.status !== 'scheduled') throw new HttpError(409, 'This ride has already started or ended.')
    const riders = all(`SELECT * FROM bookings WHERE ride_id = ? AND status IN ('accepted','confirmed')`, r.id)
    if (!riders.length) throw new HttpError(409, 'No confirmed riders yet. Start the ride once someone has booked.')
    const driverName = first(String(me(req).name))
    tx(() => {
      run(`UPDATE rides SET status = 'in_progress', started_at = ? WHERE id = ?`, nowIso(), r.id)
      for (const b of riders) {
        run(`UPDATE bookings SET status = 'driver_arriving', updated_at = ? WHERE id = ?`, nowIso(), b.id)
        notify(String(b.rider_id), 'arriving', `${driverName} is on the way`, `Track ${driverName} live and be ready at ${JSON.parse(String(b.pickup)).name}.`, `/live/${b.id}`)
      }
      for (const b of all(`SELECT * FROM bookings WHERE ride_id = ? AND status = 'pending'`, r.id)) {
        run(`UPDATE bookings SET status = 'rejected', updated_at = ? WHERE id = ?`, nowIso(), b.id)
        notify(String(b.rider_id), 'rejected', `${driverName} has already left`, 'This ride started before your request was answered. Find another match.', `/trip/${b.id}`)
      }
    })
    sync(rideParticipants(String(r.id)))
    broadcastSync()
  }),
)

api.post(
  '/rides/:id/location',
  requireOnboarded,
  h((req) => {
    const p = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), heading: z.number().min(0).max(360).nullable().optional() }), req.body)
    const r = assertDriver(param(req, 'id'), meId(req))
    if (r.status !== 'in_progress') throw new HttpError(409, 'Location is only shared during a ride.')
    const location: DriverLocation = { lat: p.lat, lng: p.lng, heading: p.heading ?? undefined, at: nowIso() }
    run(`UPDATE rides SET driver_location = ? WHERE id = ?`, JSON.stringify(location), r.id)
    const riders = all<{ rider_id: string }>(`SELECT rider_id FROM bookings WHERE ride_id = ? AND status IN ('driver_arriving','driver_arrived','in_progress')`, r.id).map((x) => x.rider_id)
    emit(riders, { type: 'location', rideId: String(r.id), location })
  }),
)

api.post(
  '/rides/:id/complete',
  requireOnboarded,
  h(async (req) => {
    const r = assertDriver(param(req, 'id'), meId(req))
    if (r.status !== 'in_progress') throw new HttpError(409, 'Start the ride before completing it.')
    tx(() => {
      run(`UPDATE rides SET status = 'completed', ended_at = ?, driver_location = NULL WHERE id = ?`, nowIso(), r.id)
      for (const b of all(`SELECT * FROM bookings WHERE ride_id = ? AND status IN ('driver_arriving','driver_arrived','in_progress')`, r.id)) {
        if (b.status === 'in_progress') {
          run(`UPDATE bookings SET status = 'completed', dropped_at = COALESCE(dropped_at, ?), updated_at = ? WHERE id = ?`, nowIso(), nowIso(), b.id)
          notify(String(b.rider_id), 'system', 'You’ve arrived', `How was your ride with ${first(String(me(req).name))}? Tap to rate.`, `/live/${b.id}`)
        } else {
          run(`UPDATE bookings SET status = 'cancelled', cancel_reason = 'Not picked up', updated_at = ? WHERE id = ?`, nowIso(), b.id)
          scheduleRefund(b)
          notify(String(b.rider_id), 'cancelled', 'Ride ended without pickup', `${first(String(me(req).name))} marked the ride complete before picking you up.`, `/trip/${b.id}`)
        }
      }
    })
    await flushRefunds()
    sync(rideParticipants(String(r.id)))
  }),
)

/* ---- Bookings ------------------------------------------------------------- */

function bookingAccess(bookingId: string, userId: string) {
  const b = bookingRow(bookingId)
  const r = rideRow(String(b.ride_id))
  const role = String(b.rider_id) === userId ? 'rider' : String(r.driver_id) === userId ? 'driver' : null
  if (!role) throw new HttpError(404, 'This booking no longer exists.')
  return { b, r, role }
}

api.post(
  '/bookings',
  requireOnboarded,
  h((req) => {
    const p = parse(z.object({ rideId: z.string(), query: QueryZ, message: z.string().max(140).optional() }), req.body)
    const query = p.query as SearchQuery
    const r = rideRow(p.rideId)
    if (String(r.driver_id) === meId(req)) throw new HttpError(400, 'You can’t book your own ride.')
    if (r.status !== 'scheduled' || new Date(String(r.depart_at)) < new Date()) throw new HttpError(409, 'This ride is no longer available.')
    const existing = one(`SELECT * FROM bookings WHERE ride_id = ? AND rider_id = ? AND status IN (${ACTIVE.map((s) => `'${s}'`).join(',')})`, r.id, meId(req))
    if (existing) return toBooking(existing)
    if (Number(r.seats_total) - seatsBooked(String(r.id)) < query.seats) throw new HttpError(409, 'Those seats were just taken. Try another match.')
    const match = scoreFor(r, query, meId(req))
    if (!match) throw new HttpError(409, 'This ride doesn’t pass close enough to your pickup or destination.')
    const id = newId('b')
    const now = nowIso()
    run(
      `INSERT INTO bookings (id, ride_id, rider_id, pickup, drop_place, seats, fare, status, match_score, message, payment_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'unpaid', ?, ?)`,
      id,
      r.id,
      meId(req),
      JSON.stringify(query.pickup),
      JSON.stringify(query.drop),
      query.seats,
      match.fare * query.seats,
      match.score,
      p.message?.trim() || null,
      now,
      now,
    )
    notify(String(r.driver_id), 'request', `${me(req).name} wants to join your ride`, `${match.score}% compatible · pickup at ${query.pickup.name}`, `/drive/${r.id}`)
    sync([String(r.driver_id), meId(req)])
    return toBooking(bookingRow(id))
  }),
)

api.get(
  '/bookings/:id',
  requireOnboarded,
  h((req) => {
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    const booking = toBooking(b)
    const showContact = HOLDING.includes(booking.status) && booking.status !== 'completed'
    const driverRow = one(`SELECT * FROM users WHERE id = ?`, r.driver_id)
    const riderRow = one(`SELECT * FROM users WHERE id = ?`, b.rider_id)
    const out: BookingDetail = {
      role: role as BookingDetail['role'],
      booking,
      ride: toRide(r, { location: canSeeLocation(String(r.id), meId(req), String(r.driver_id)) }),
      driver: publicUser(driverRow ?? String(r.driver_id)),
      vehicle: vehicleFor(String(r.driver_id)) ?? { id: '', make: 'Car', model: '', color: '', plate: '', seats: 0, fuel: 'petrol' },
      rider: publicUser(riderRow ?? String(b.rider_id)),
      driverUpiId: role === 'rider' && HOLDING.includes(booking.status) ? (driverRow?.upi_id as string) || undefined : undefined,
      driverPhone: role === 'rider' && showContact ? String(driverRow?.phone ?? '') || undefined : undefined,
      riderPhone: role === 'driver' && showContact ? String(riderRow?.phone ?? '') || undefined : undefined,
    }
    return out
  }),
)

api.post(
  '/bookings/:id/respond',
  requireOnboarded,
  h((req) => {
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body)
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (role !== 'driver') throw new HttpError(403, 'Only the driver can respond to requests.')
    if (b.status !== 'pending') throw new HttpError(409, 'This request was already handled.')
    if (r.status !== 'scheduled') throw new HttpError(409, 'This ride is no longer open for requests.')
    const name = first(String(me(req).name))
    tx(() => {
      if (accept) {
        if (Number(r.seats_total) - seatsBooked(String(r.id)) < Number(b.seats)) throw new HttpError(409, 'Not enough seats left for this request.')
        run(`UPDATE bookings SET status = 'accepted', updated_at = ? WHERE id = ?`, nowIso(), b.id)
        systemMessage(String(b.id), `${name} accepted the request.`)
        notify(String(b.rider_id), 'accepted', `${name} accepted your request`, `Choose how you’ll pay ${money(Number(b.fare))} to confirm your seat.`, `/trip/${b.id}`)
      } else {
        run(`UPDATE bookings SET status = 'rejected', updated_at = ? WHERE id = ?`, nowIso(), b.id)
        notify(String(b.rider_id), 'rejected', `${name} couldn’t take this request`, 'You haven’t been charged. Pick another match.', `/trip/${b.id}`)
      }
    })
    sync(rideParticipants(String(r.id)))
    broadcastSync()
  }),
)

api.post(
  '/bookings/:id/pay',
  requireOnboarded,
  h((req) => {
    const p = parse(z.object({ method: z.enum(['upi', 'cash']), reference: z.string().trim().max(40).optional() }), req.body)
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (role !== 'rider') throw new HttpError(403, 'Only the rider can do this.')
    const allowed = ['accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed']
    if (!allowed.includes(String(b.status))) throw new HttpError(409, 'This booking can’t be paid right now.')
    if (b.payment_status === 'paid_online') throw new HttpError(409, 'This ride is already paid online.')
    if (p.method === 'upi' && !one(`SELECT upi_id FROM users WHERE id = ? AND upi_id IS NOT NULL AND upi_id != ''`, r.driver_id))
      throw new HttpError(409, 'The driver hasn’t added a UPI ID. Choose cash, or message them.')
    const status = p.method === 'upi' ? 'marked_paid' : 'unpaid'
    run(
      `UPDATE bookings SET status = CASE WHEN status = 'accepted' THEN 'confirmed' ELSE status END, payment_method = ?, payment_status = CASE WHEN payment_status = 'received' THEN 'received' ELSE ? END, payment_ref = ?, paid_at = ?, updated_at = ? WHERE id = ?`,
      p.method,
      status,
      p.reference || null,
      p.method === 'upi' ? nowIso() : null,
      nowIso(),
      b.id,
    )
    const riderName = first(String(me(req).name))
    systemMessage(String(b.id), p.method === 'upi' ? `${riderName} paid ${money(Number(b.fare))} by UPI${p.reference ? ` (ref ${p.reference})` : ''}.` : `${riderName} will pay ${money(Number(b.fare))} in cash at pickup.`)
    notify(String(r.driver_id), 'payment', p.method === 'upi' ? `${riderName} paid by UPI` : `${riderName} confirmed their seat`, p.method === 'upi' ? `${money(Number(b.fare))} sent to your UPI. Check your bank app.` : `${money(Number(b.fare))} in cash at pickup.`, `/drive/${r.id}`)
    sync([String(r.driver_id), meId(req)])
  }),
)

/* ---- Online payment (Razorpay) -------------------------------------------- */

function markPaidOnline(bookingId: string, orderId: string, paymentId: string) {
  const b = bookingRow(bookingId)
  if (b.payment_status === 'paid_online' || b.payment_status === 'refunded') return false
  const r = rideRow(String(b.ride_id))
  run(
    `UPDATE bookings SET status = CASE WHEN status = 'accepted' THEN 'confirmed' ELSE status END, payment_method = 'online', payment_status = 'paid_online',
       gateway_order_id = ?, gateway_payment_id = ?, payment_ref = ?, paid_at = ?, updated_at = ? WHERE id = ?`,
    orderId,
    paymentId,
    paymentId,
    nowIso(),
    nowIso(),
    bookingId,
  )
  const rider = first(String(one(`SELECT name FROM users WHERE id = ?`, b.rider_id)?.name ?? 'Rider'))
  systemMessage(bookingId, `${rider} paid ${money(Number(b.fare))} online.`)
  notify(String(r.driver_id), 'payment', `${rider} paid online`, `${money(Number(b.fare))} received through RideSync for this ride.`, `/drive/${r.id}`)
  notify(String(b.rider_id), 'payment', 'Payment successful', `${money(Number(b.fare))} paid · seat confirmed.`, `/trip/${bookingId}`)
  sync([String(r.driver_id), String(b.rider_id)])
  // A cancellation may have landed while the rider was paying: refund straight away.
  const after = bookingRow(bookingId)
  if (after.status === 'cancelled' || after.status === 'rejected') {
    scheduleRefund(after)
    void flushRefunds()
  }
  return true
}

api.post(
  '/bookings/:id/pay/online',
  requireOnboarded,
  h(async (req) => {
    if (!razorpayConfigured()) throw new HttpError(404, 'Online payments aren’t set up on this server.')
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (role !== 'rider') throw new HttpError(403, 'Only the rider can pay.')
    if (b.payment_status === 'paid_online') throw new HttpError(409, 'This ride is already paid.')
    if (!['accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed'].includes(String(b.status))) throw new HttpError(409, 'This booking can’t be paid right now.')
    const order = await createOrder(Number(b.fare), String(b.id), { booking: String(b.id), ride: String(r.id) })
    run(`UPDATE bookings SET gateway_order_id = ? WHERE id = ?`, order.id, b.id)
    const driver = one(`SELECT name FROM users WHERE id = ?`, r.driver_id)
    return {
      keyId: env.razorpay.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      description: `Ride with ${driver?.name ?? 'driver'} · ${JSON.parse(String(b.pickup)).name} → ${JSON.parse(String(b.drop_place)).name}`,
      prefill: { name: String(me(req).name), email: String(me(req).email), contact: String(me(req).phone ?? '') },
    }
  }),
)

api.post(
  '/bookings/:id/pay/online/verify',
  requireOnboarded,
  h((req) => {
    const p = parse(z.object({ razorpay_order_id: z.string().max(60), razorpay_payment_id: z.string().max(60), razorpay_signature: z.string().max(200) }), req.body)
    const { b, role } = bookingAccess(param(req, 'id'), meId(req))
    if (role !== 'rider') throw new HttpError(403, 'Only the rider can pay.')
    if (p.razorpay_order_id !== b.gateway_order_id) throw new HttpError(400, 'This payment doesn’t match your booking.')
    if (!verifyPaymentSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) throw new HttpError(400, 'We couldn’t verify this payment. If money was taken, it will be refunded automatically.')
    markPaidOnline(String(b.id), p.razorpay_order_id, p.razorpay_payment_id)
    return { ok: true }
  }),
)

/** Razorpay webhook — confirms payments even if the rider closed the tab. Mounted with a raw body in app.ts. */
export async function razorpayWebhook(req: Request, res: Response) {
  const sig = req.get('x-razorpay-signature') ?? ''
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, sig)) return res.status(400).json({ error: 'Bad signature' })
  try {
    const event = JSON.parse(req.body.toString('utf8')) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string; notes?: { booking?: string } } } } }
    const pay = event.payload?.payment?.entity
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay?.order_id) {
      const b = one(`SELECT id FROM bookings WHERE gateway_order_id = ?`, pay.order_id)
      if (b) markPaidOnline(String(b.id), pay.order_id, pay.id)
    }
  } catch (e) {
    console.error('[ridesync] webhook error', e)
  }
  res.json({ ok: true })
}

api.post(
  '/bookings/:id/payment-received',
  requireOnboarded,
  h((req) => {
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (role !== 'driver') throw new HttpError(403, 'Only the driver can confirm payment.')
    if (b.payment_status === 'paid_online' || b.payment_status === 'refunded') throw new HttpError(409, 'This ride was paid online through RideSync.')
    if (!HOLDING.includes(b.status as never)) throw new HttpError(409, 'This booking isn’t active.')
    run(`UPDATE bookings SET payment_status = 'received', payment_method = COALESCE(payment_method, 'cash'), paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?`, nowIso(), nowIso(), b.id)
    notify(String(b.rider_id), 'payment', 'Payment received', `${first(String(me(req).name))} confirmed your ${money(Number(b.fare))} payment.`, `/trip/${b.id}`)
    sync([String(r.driver_id), String(b.rider_id)])
  }),
)

api.post(
  '/bookings/:id/cancel',
  requireOnboarded,
  h(async (req) => {
    const { reason } = parse(z.object({ reason: z.string().max(120).default('Plans changed') }), req.body ?? {})
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    const cancellable = role === 'rider' ? ['pending', 'accepted', 'confirmed', 'driver_arriving', 'driver_arrived'] : ['accepted', 'confirmed']
    if (!cancellable.includes(String(b.status))) throw new HttpError(409, 'This booking can’t be cancelled now.')
    run(`UPDATE bookings SET status = 'cancelled', cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?`, role, reason, nowIso(), b.id)
    scheduleRefund(b)
    const direct = paidDirectly(b)
    const online = b.payment_status === 'paid_online'
    if (role === 'rider') {
      if (b.status !== 'pending')
        notify(String(r.driver_id), 'cancelled', `${first(String(me(req).name))} cancelled their seat`, `${reason}.${direct ? ' They paid you by UPI — please refund them.' : online ? ' Their online payment is refunded automatically.' : ''}`, `/drive/${r.id}`)
    } else {
      notify(String(b.rider_id), 'cancelled', `${first(String(me(req).name))} removed you from the ride`, `${reason}.${direct ? ' Ask the driver to refund your UPI payment.' : online ? ' Your online payment will be refunded automatically.' : ''}`, `/trip/${b.id}`)
    }
    await flushRefunds()
    sync(rideParticipants(String(r.id)))
    broadcastSync()
  }),
)

function driverStep(req: Request, from: string[], to: string, col: string, notice?: (name: string, b: Row) => [string, string]) {
  const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
  if (role !== 'driver') throw new HttpError(403, 'Only the driver can do this.')
  if (r.status !== 'in_progress') throw new HttpError(409, 'Start the ride first.')
  if (!from.includes(String(b.status))) throw new HttpError(409, 'That step isn’t available for this rider right now.')
  run(`UPDATE bookings SET status = ?, ${col} = ?, updated_at = ? WHERE id = ?`, to, nowIso(), nowIso(), b.id)
  if (notice) {
    const [title, body] = notice(first(String(me(req).name)), b)
    notify(String(b.rider_id), to === 'completed' ? 'system' : 'arriving', title, body, `/live/${b.id}`)
  }
  sync([String(r.driver_id), String(b.rider_id)])
}

api.post(
  '/bookings/:id/arrived',
  requireOnboarded,
  h((req) => {
    const v = vehicleFor(meId(req))
    driverStep(req, ['driver_arriving'], 'driver_arrived', 'arrived_at', (n) => [`${n} has arrived`, `Look for a ${v?.color ?? ''} ${v?.model ?? 'car'} · ${v?.plate ?? ''}`])
  }),
)
api.post('/bookings/:id/picked-up', requireOnboarded, h((req) => driverStep(req, ['driver_arriving', 'driver_arrived'], 'in_progress', 'picked_up_at')))
api.post(
  '/bookings/:id/dropped',
  requireOnboarded,
  h((req) => driverStep(req, ['in_progress'], 'completed', 'dropped_at', (n) => ['You’ve arrived', `How was your ride with ${n}? Tap to rate.`])),
)

api.post(
  '/bookings/:id/rate',
  requireOnboarded,
  h((req) => {
    const { stars } = parse(z.object({ stars: z.number().int().min(1).max(5), tags: z.array(z.string().max(30)).max(8).optional(), comment: z.string().max(400).optional() }), req.body)
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (b.status !== 'completed') throw new HttpError(409, 'You can rate once the trip is complete.')
    if (role === 'rider') {
      if (b.rider_rating != null) throw new HttpError(409, 'You’ve already rated this trip.')
      run(`UPDATE bookings SET rider_rating = ? WHERE id = ?`, stars, b.id)
    } else {
      if (b.driver_rating != null) throw new HttpError(409, 'You’ve already rated this rider.')
      run(`UPDATE bookings SET driver_rating = ? WHERE id = ?`, stars, b.id)
    }
    sync([String(r.driver_id), String(b.rider_id)])
  }),
)

/* ---- Lists ---------------------------------------------------------------- */

api.get(
  '/trips',
  requireOnboarded,
  h((req) => {
    const bookings = all(`SELECT * FROM bookings WHERE rider_id = ? ORDER BY created_at DESC LIMIT 200`, meId(req)).map((row) => {
      const b = toBooking(row)
      const ride = toRide(rideRow(b.rideId))
      return { ...b, ride: { ...ride, route: [] }, driver: publicUser(ride.driverId) }
    })
    const rides = all(`SELECT * FROM rides WHERE driver_id = ? ORDER BY depart_at DESC LIMIT 200`, meId(req)).map((row) => {
      const ride = toRide(row)
      const bs = all(`SELECT status, fare, payment_status FROM bookings WHERE ride_id = ?`, ride.id)
      return {
        ...ride,
        route: [],
        pending: bs.filter((x) => x.status === 'pending').length,
        riders: bs.filter((x) => HOLDING.includes(x.status as never)).length,
        earned: bs.filter((x) => x.status === 'completed').reduce((s, x) => s + Number(x.fare), 0),
      }
    })
    const out: Trips = { bookings, rides }
    return out
  }),
)

api.get(
  '/payments',
  requireOnboarded,
  h((req) => {
    const rows = all(
      `SELECT b.*, r.driver_id, r.origin, r.destination FROM bookings b JOIN rides r ON r.id = b.ride_id
       WHERE (b.rider_id = ? OR r.driver_id = ?) AND b.payment_method IS NOT NULL ORDER BY COALESCE(b.paid_at, b.updated_at) DESC LIMIT 200`,
      meId(req),
      meId(req),
    )
    return rows.map((row): PaymentRecord => {
      const paid = String(row.rider_id) === meId(req)
      const other = one(`SELECT name FROM users WHERE id = ?`, paid ? row.driver_id : row.rider_id)
      return {
        bookingId: String(row.id),
        direction: paid ? 'paid' : 'received',
        amount: Number(row.fare),
        method: row.payment_method as PaymentRecord['method'],
        status: row.payment_status as PaymentRecord['status'],
        reference: (row.payment_ref as string) || undefined,
        counterparty: String(other?.name ?? 'Deleted user'),
        route: `${JSON.parse(String(row.pickup)).name} → ${JSON.parse(String(row.drop_place)).name}`,
        at: String(row.paid_at ?? row.updated_at),
      }
    })
  }),
)

/* ---- Chat ----------------------------------------------------------------- */

api.get(
  '/threads',
  requireOnboarded,
  h((req) => {
    const rows = all(
      `SELECT b.* FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE (b.rider_id = ? OR r.driver_id = ?) AND b.status NOT IN ('pending','rejected') ORDER BY b.updated_at DESC LIMIT 100`,
      meId(req),
      meId(req),
    )
    const threads: Thread[] = rows.map((row) => {
      const b = toBooking(row)
      const ride = toRide(rideRow(b.rideId))
      const otherId = b.riderId === meId(req) ? ride.driverId : b.riderId
      const last = one(`SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1`, b.id)
      return {
        bookingId: b.id,
        ride: { ...ride, route: [] },
        other: publicUser(otherId),
        status: b.status,
        last: last ? { id: String(last.id), threadId: b.id, senderId: String(last.sender_id), text: String(last.text), createdAt: String(last.created_at), system: !!Number(last.system) } : undefined,
      }
    })
    return threads.sort((a, b) => +new Date(b.last?.createdAt ?? 0) - +new Date(a.last?.createdAt ?? 0))
  }),
)

api.get(
  '/bookings/:id/messages',
  requireOnboarded,
  h((req) => {
    bookingAccess(param(req, 'id'), meId(req))
    return all(`SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at LIMIT 500`, param(req, 'id')).map((m) => ({
      id: String(m.id),
      threadId: String(m.booking_id),
      senderId: String(m.sender_id),
      text: String(m.text),
      createdAt: String(m.created_at),
      system: !!Number(m.system),
    }))
  }),
)

api.post(
  '/bookings/:id/messages',
  requireOnboarded,
  h((req) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(1000) }), req.body)
    const { b, r, role } = bookingAccess(param(req, 'id'), meId(req))
    if (['pending', 'rejected', 'cancelled'].includes(String(b.status))) throw new HttpError(409, 'Chat opens once the driver accepts.')
    if (b.status === 'completed' && Date.now() - new Date(String(b.updated_at)).getTime() > 86_400_000) throw new HttpError(409, 'This ride has ended. Chat is closed.')
    run(`INSERT INTO messages (id, booking_id, sender_id, text, system, created_at) VALUES (?, ?, ?, ?, 0, ?)`, newId('m'), b.id, meId(req), text, nowIso())
    const otherId = role === 'rider' ? String(r.driver_id) : String(b.rider_id)
    notify(otherId, 'chat', String(me(req).name), text.slice(0, 140), `/chat/${b.id}`)
    sync([otherId, meId(req)])
  }),
)

/* ---- Notifications --------------------------------------------------------- */

api.get(
  '/notifications',
  requireUser,
  h((req) =>
    all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, meId(req)).map((n) => ({
      id: String(n.id),
      userId: String(n.user_id),
      kind: n.kind,
      title: String(n.title),
      body: String(n.body),
      link: (n.link as string) || undefined,
      read: !!Number(n.read),
      createdAt: String(n.created_at),
    })),
  ),
)

api.post(
  '/notifications/read-all',
  requireUser,
  h((req) => {
    run(`UPDATE notifications SET read = 1 WHERE user_id = ?`, meId(req))
    sync([meId(req)])
  }),
)

api.post(
  '/notifications/:id/read',
  requireUser,
  h((req) => {
    run(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, param(req, 'id'), meId(req))
    sync([meId(req)])
  }),
)

/** Lightweight counts for badges. */
api.get(
  '/badges',
  requireUser,
  h((req) => ({
    unread: Number(one<{ n: number }>(`SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0`, meId(req))?.n ?? 0),
    requests: Number(
      one<{ n: number }>(`SELECT COUNT(*) n FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.driver_id = ? AND r.status = 'scheduled' AND b.status = 'pending'`, meId(req))?.n ?? 0,
    ),
  })),
)
