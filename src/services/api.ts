import { DECLINING_DRIVERS, DEMO_EMAIL, REQUESTER_IDS } from '@/data/seed'
import { CAMPUSES, PLACES } from '@/data/places'
import { scoreRide, desiredTime } from '@/lib/matching'
import { polylineLengthKm, projectOnPolyline, pointAlong, syntheticRoute } from '@/lib/geo'
import { firstName, money, uid } from '@/lib/format'
import type {
  AppNotification,
  Booking,
  BookingStatus,
  CommuteMode,
  MatchResult,
  NotificationKind,
  PaymentMethodKind,
  Place,
  Ride,
  RidePreference,
  SearchQuery,
  User,
  Vehicle,
} from '@/lib/types'
import { validateStudentId, validateVitEmail, VIT_EMAIL_DOMAIN } from '@/lib/validation'
import { getDB, update, type DB, type ScheduledEvent } from './db'
import { gateway, type ChargeDetails } from './payments'
import { getRoute, routeNow } from './routing'

/* ==========================================================================
   Errors & transport
   ========================================================================== */

export type ApiErrorCode = 'network' | 'auth' | 'validation' | 'conflict' | 'not_found' | 'payment'

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public field?: string,
  ) {
    super(message)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function isOffline() {
  return getDB().settings.simulateOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

/** Every API call goes through here: realistic latency + offline handling. */
async function call<T>(fn: () => T | Promise<T>, latency: [number, number] = [220, 560]): Promise<T> {
  await wait(latency[0] + Math.random() * (latency[1] - latency[0]))
  if (isOffline()) throw new ApiError('network', 'You’re offline. Check your connection and try again.')
  return fn()
}

export const TEST_OTP = '123456'

/* ==========================================================================
   Selectors (pure, safe to use in render)
   ========================================================================== */

export const me = (d: DB = getDB()) => (d.session ? d.users.find((u) => u.id === d.session!.userId) ?? null : null)
export const userById = (id: string, d: DB = getDB()) => d.users.find((u) => u.id === id)
export const rideById = (id: string, d: DB = getDB()) => d.rides.find((r) => r.id === id)
export const bookingById = (id: string, d: DB = getDB()) => d.bookings.find((b) => b.id === id)
export const vehicleFor = (ride: Ride, d: DB = getDB()): Vehicle | undefined => userById(ride.driverId, d)?.vehicle

export const ACTIVE_BOOKING: BookingStatus[] = ['pending', 'accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress']
export const LIVE_BOOKING: BookingStatus[] = ['driver_arriving', 'driver_arrived', 'in_progress']

export function walletBalance(userId: string, d: DB = getDB()) {
  return d.wallet.filter((t) => t.userId === userId).reduce((s, t) => s + (t.type === 'credit' ? t.amount : -t.amount), 0)
}

export function unreadCount(userId: string, d: DB = getDB()) {
  return d.notifications.filter((n) => n.userId === userId && !n.read).length
}

export function myBookings(userId: string, d: DB = getDB()) {
  return d.bookings.filter((b) => b.riderId === userId)
}

export function myOfferedRides(userId: string, d: DB = getDB()) {
  return d.rides.filter((r) => r.driverId === userId)
}

export function requestsFor(rideId: string, d: DB = getDB()) {
  return d.bookings.filter((b) => b.rideId === rideId)
}

export function pendingRequestCount(userId: string, d: DB = getDB()) {
  const mine = new Set(myOfferedRides(userId, d).filter((r) => r.status === 'scheduled').map((r) => r.id))
  return d.bookings.filter((b) => mine.has(b.rideId) && b.status === 'pending').length
}

/** The single booking or offered ride that needs the user's attention now. */
export function currentTrip(userId: string, d: DB = getDB()) {
  const booking = myBookings(userId, d)
    .filter((b) => ACTIVE_BOOKING.includes(b.status))
    .sort((a, b) => +new Date(rideById(a.rideId, d)!.departAt) - +new Date(rideById(b.rideId, d)!.departAt))[0]
  const offered = myOfferedRides(userId, d)
    .filter((r) => r.status === 'scheduled' || r.status === 'in_progress')
    .sort((a, b) => +new Date(a.departAt) - +new Date(b.departAt))[0]
  return { booking, offered }
}

export function threadsFor(userId: string, d: DB = getDB()) {
  const threads = d.bookings
    .filter((b) => {
      if (['pending', 'rejected'].includes(b.status)) return false
      const r = rideById(b.rideId, d)
      return b.riderId === userId || r?.driverId === userId
    })
    .map((b) => {
      const r = rideById(b.rideId, d)!
      const otherId = b.riderId === userId ? r.driverId : b.riderId
      const msgs = d.messages.filter((m) => m.threadId === b.id)
      return { booking: b, ride: r, other: userById(otherId, d)!, last: msgs[msgs.length - 1] }
    })
    .filter((t) => t.other)
  return threads.sort((a, b) => +new Date(b.last?.createdAt ?? b.booking.updatedAt) - +new Date(a.last?.createdAt ?? a.booking.updatedAt))
}

/* ==========================================================================
   Internal helpers
   ========================================================================== */

function requireMe(d: DB): User {
  const u = me(d)
  if (!u) throw new ApiError('auth', 'Please log in again.')
  return u
}

function pushNotification(d: DB, userId: string, kind: NotificationKind, title: string, body: string, link?: string) {
  const n: AppNotification = { id: uid('n_'), userId, kind, title, body, createdAt: new Date().toISOString(), read: false, link }
  d.notifications.unshift(n)
  if (d.session?.userId === userId && d.settings.pushEnabled && d.settings.notificationPermission === 'granted' && document.hidden) {
    try {
      new Notification(title, { body, icon: '/apple-touch-icon.png', tag: n.id })
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}

function systemMessage(d: DB, threadId: string, text: string) {
  d.messages.push({ id: uid('m_'), threadId, senderId: 'system', text, createdAt: new Date().toISOString(), system: true })
}

function schedule(d: DB, type: ScheduledEvent['type'], inMs: number, payload: ScheduledEvent['payload']) {
  d.scheduled.push({ id: uid('e_'), due: Date.now() + inMs, type, payload })
}

async function hashPassword(email: string, password: string) {
  const data = new TextEncoder().encode(`${email.trim().toLowerCase()}:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ==========================================================================
   Auth
   ========================================================================== */

export type RegisterInput = { name: string; email: string; studentId: string; phone: string; password: string; photo?: string; gender?: User['gender'] }

function campusFor(studentId: string): User['campus'] {
  // Chennai register numbers carry a 1 in the first digit of the serial (e.g. 22BCE1xxx).
  return studentId.toUpperCase()[5] === '1' ? 'chennai' : 'vellore'
}

export async function register(input: RegisterInput) {
  const hash = await hashPassword(input.email, input.password)
  return call(() => {
    const email = input.email.trim().toLowerCase()
    const sid = input.studentId.trim().toUpperCase()
    const emailErr = validateVitEmail(email)
    if (emailErr) throw new ApiError('validation', emailErr, 'email')
    const sidErr = validateStudentId(sid)
    if (sidErr) throw new ApiError('validation', sidErr, 'studentId')
    const d = getDB()
    if (d.credentials.some((c) => c.email === email)) throw new ApiError('conflict', 'An account with this email already exists. Try logging in.', 'email')
    if (d.users.some((u) => u.studentId === sid)) throw new ApiError('conflict', 'This register number is already linked to another account.', 'studentId')
    const user: User = {
      id: uid('u_'),
      name: input.name.trim().replace(/\s+/g, ' '),
      email,
      studentId: sid,
      phone: input.phone.replace(/\D/g, '').slice(-10),
      photo: input.photo,
      gender: input.gender ?? 'undisclosed',
      campus: campusFor(sid),
      verified: false,
      emailVerified: false,
      rating: 5,
      ratingCount: 0,
      ridesTaken: 0,
      ridesOffered: 0,
      completionRate: 1,
      co2SavedKg: 0,
      preferences: [],
      joinedAt: new Date().toISOString(),
    }
    update((draft) => {
      draft.users.push(user)
      draft.credentials.push({ email, hash, userId: user.id })
      draft.pendingVerification = { email, userId: user.id }
    })
    return user
  }, [500, 900])
}

export async function verifyEmail(code: string) {
  return call(() => {
    const d = getDB()
    const pending = d.pendingVerification
    if (!pending) throw new ApiError('auth', 'Your verification session expired. Please log in again.')
    if (code !== TEST_OTP) throw new ApiError('validation', 'That code isn’t right. Check the email and try again.', 'code')
    update((draft) => {
      const u = draft.users.find((x) => x.id === pending.userId)!
      u.emailVerified = true
      // A verified @vitstudent.ac.in inbox + a valid register number = verified VIT student.
      u.verified = true
      draft.session = { userId: u.id }
      draft.pendingVerification = null
      pushNotification(draft, u.id, 'system', 'Welcome to RideSync', 'Your VIT email is verified. You’re part of the VIT community on RideSync.')
    })
  }, [500, 900])
}

export async function resendCode() {
  return call(() => true, [400, 700])
}

export async function login(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase()
  const hash = await hashPassword(email, password)
  return call(() => {
    const emailErr = validateVitEmail(email)
    if (emailErr) throw new ApiError('validation', emailErr, 'email')
    const d = getDB()
    const cred = d.credentials.find((c) => c.email === email)
    if (!cred) throw new ApiError('auth', 'No RideSync account uses this email.', 'email')
    if (cred.hash !== hash) throw new ApiError('auth', 'Incorrect password. Try again or reset it.', 'password')
    const user = d.users.find((u) => u.id === cred.userId)!
    if (!user.emailVerified) {
      update((draft) => void (draft.pendingVerification = { email, userId: user.id }))
      return { user, needsVerification: true }
    }
    update((draft) => void (draft.session = { userId: user.id }))
    return { user, needsVerification: false }
  }, [450, 850])
}

/** Google sign-in result, restricted to the VIT Google Workspace domain. */
export async function loginWithGoogle(profile: { email: string; name: string; picture?: string }) {
  return call(() => {
    const email = profile.email.toLowerCase()
    if (!email.endsWith(`@${VIT_EMAIL_DOMAIN}`))
      throw new ApiError('auth', `Use your @${VIT_EMAIL_DOMAIN} Google account. Personal accounts can’t join RideSync.`)
    const d = getDB()
    const cred = d.credentials.find((c) => c.email === email)
    if (cred) {
      update((draft) => void (draft.session = { userId: cred.userId }))
      return { isNew: false }
    }
    return { isNew: true, profile }
  })
}

export async function requestPasswordReset(email: string) {
  // Same response whether or not the account exists (no account enumeration).
  return call(() => {
    const err = validateVitEmail(email)
    if (err) throw new ApiError('validation', err, 'email')
    return true
  }, [500, 900])
}

export function logout() {
  update((d) => {
    d.session = null
    d.scheduled = d.scheduled.filter((e) => e.type !== 'incoming_request')
  })
}

export async function updateMe(patch: Partial<User>) {
  return call(() => {
    update((d) => {
      const u = requireMe(d)
      Object.assign(u, patch)
    })
  }, [200, 450])
}

export async function setCommute(mode: CommuteMode) {
  return updateMe({ commute: mode })
}

export function isDemoAccount(u: User | null) {
  return u?.email === DEMO_EMAIL
}

/* ==========================================================================
   Rides — search & AI matching
   ========================================================================== */

export async function searchRides(query: SearchQuery): Promise<MatchResult[]> {
  const start = performance.now()
  if (isOffline()) {
    await wait(400)
    throw new ApiError('network', 'You’re offline. Check your connection and try again.')
  }
  const d = getDB()
  const meUser = requireMe(d)
  const target = desiredTime(query).getTime()
  const candidates = d.rides.filter((r) => {
    if (r.status !== 'scheduled' || r.driverId === meUser.id) return false
    const t = new Date(r.departAt).getTime()
    return t > Date.now() && Math.abs(t - target) < 4.5 * 3600_000
  })
  const myHistory = myBookings(meUser.id, d)
  const results = await Promise.all(
    candidates.map(async (ride) => {
      const driver = userById(ride.driverId, d)
      const vehicle = driver?.vehicle
      if (!driver || !vehicle) return null
      const route = await getRoute(ride.origin, ride.destination)
      return scoreRide({ query, ride, route, driver, vehicle, history: myHistory, rides: d.rides })
    }),
  )
  // Keep the "analysing routes" state on screen long enough to read.
  const elapsed = performance.now() - start
  if (elapsed < 900) await wait(900 - elapsed)
  return results.filter((r): r is MatchResult => !!r).sort((a, b) => b.score - a.score)
}

/** Re-score one ride for the details screen (e.g. after a refresh). */
export function scoreOne(ride: Ride, query: SearchQuery): MatchResult | null {
  const d = getDB()
  const driver = userById(ride.driverId, d)
  if (!driver?.vehicle) return null
  const u = me(d)
  return scoreRide({ query, ride, route: routeNow(ride.origin, ride.destination), driver, vehicle: driver.vehicle, history: u ? myBookings(u.id, d) : [], rides: d.rides })
}

/* ==========================================================================
   Rides — offering (driver)
   ========================================================================== */

export type OfferInput = {
  origin: Place
  destination: Place
  departAt: Date
  seats: number
  farePerSeat: number
  maxDetourKm: number
  preferences: RidePreference[]
  note?: string
  distanceKm?: number
  durationMin?: number
}

export async function publishRide(input: OfferInput) {
  return call(() => {
    const d = getDB()
    const u = requireMe(d)
    if (!u.vehicle) throw new ApiError('validation', 'Add your vehicle before offering a ride.', 'vehicle')
    if (input.departAt.getTime() < Date.now() + 10 * 60_000) throw new ApiError('validation', 'Departure must be at least 10 minutes from now.', 'time')
    const clash = myOfferedRides(u.id, d).find(
      (r) => r.status === 'scheduled' && Math.abs(+new Date(r.departAt) - input.departAt.getTime()) < 60 * 60_000,
    )
    if (clash) throw new ApiError('conflict', 'You already have a ride around this time. Edit or cancel it first.', 'time')
    const ride: Ride = {
      id: uid('r_'),
      driverId: u.id,
      origin: input.origin,
      destination: input.destination,
      departAt: input.departAt.toISOString(),
      seatsTotal: input.seats,
      seatsBooked: 0,
      farePerSeat: input.farePerSeat,
      maxDetourKm: input.maxDetourKm,
      preferences: input.preferences,
      vehicleId: u.vehicle.id,
      note: input.note?.trim() || undefined,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
    }
    update((draft) => {
      draft.rides.push(ride)
      // Community demand: simulated VIT riders find this ride and request seats.
      const riders = REQUESTER_IDS.filter((id) => {
        const r = draft.users.find((x) => x.id === id)!
        return !input.preferences.includes('female_friendly') || r.gender === 'female' || id === 'u_aditya'
      }).slice(0, Math.min(3, input.seats + 1))
      riders.forEach((riderId, i) => schedule(draft, 'incoming_request', 4000 + i * 6500, { rideId: ride.id, riderId, index: i }))
    })
    return ride
  }, [600, 1000])
}

export async function respondToRequest(bookingId: string, accept: boolean) {
  return call(() => {
    update((d) => {
      const u = requireMe(d)
      const b = d.bookings.find((x) => x.id === bookingId)
      if (!b) throw new ApiError('not_found', 'This request no longer exists.')
      const ride = d.rides.find((r) => r.id === b.rideId)!
      if (ride.driverId !== u.id) throw new ApiError('auth', 'Only the driver can respond to this request.')
      if (b.status !== 'pending') throw new ApiError('conflict', 'This request was already handled.')
      if (accept) {
        if (ride.seatsTotal - ride.seatsBooked < b.seats) throw new ApiError('conflict', 'Not enough seats left. Decline this request or add a seat.')
        ride.seatsBooked += b.seats
        b.status = 'accepted'
        systemMessage(d, b.id, `${firstName(u.name)} accepted the request. Waiting for payment.`)
        schedule(d, 'rider_payment', 3500, { bookingId: b.id })
      } else {
        b.status = 'rejected'
      }
      b.updatedAt = new Date().toISOString()
    })
  }, [300, 600])
}

export async function startOfferedRide(rideId: string) {
  return call(() => {
    update((d) => {
      const ride = d.rides.find((r) => r.id === rideId)!
      ride.status = 'in_progress'
      d.bookings
        .filter((b) => b.rideId === rideId && b.status === 'confirmed')
        .forEach((b) => {
          b.status = 'in_progress'
          b.phaseStartedAt = new Date().toISOString()
        })
      // Unanswered requests lapse once the ride starts.
      d.bookings.filter((b) => b.rideId === rideId && b.status === 'pending').forEach((b) => (b.status = 'rejected'))
    })
  })
}

export async function completeOfferedRide(rideId: string) {
  return call(() => {
    update((d) => {
      const u = requireMe(d)
      const ride = d.rides.find((r) => r.id === rideId)!
      ride.status = 'completed'
      const riders = d.bookings.filter((b) => b.rideId === rideId && ['in_progress', 'confirmed'].includes(b.status))
      riders.forEach((b) => {
        b.status = 'completed'
        b.updatedAt = new Date().toISOString()
      })
      const total = riders.reduce((s, b) => s + b.fare, 0)
      if (total > 0) {
        d.wallet.unshift({
          id: uid('w_'),
          userId: u.id,
          type: 'credit',
          amount: total,
          title: 'Cost share received',
          subtitle: `${ride.origin.name} → ${ride.destination.name} · ${riders.length} ${riders.length === 1 ? 'rider' : 'riders'}`,
          createdAt: new Date().toISOString(),
        })
      }
      u.ridesOffered += 1
      u.co2SavedKg = Math.round((u.co2SavedKg + riders.length * 2.4) * 10) / 10
    })
  })
}

export async function cancelOfferedRide(rideId: string, reason: string) {
  return call(() => {
    update((d) => {
      const u = requireMe(d)
      const ride = d.rides.find((r) => r.id === rideId)!
      ride.status = 'cancelled'
      d.bookings
        .filter((b) => b.rideId === rideId && ACTIVE_BOOKING.includes(b.status))
        .forEach((b) => {
          const paid = !!b.paymentId && b.status !== 'pending' && b.status !== 'accepted'
          b.status = 'cancelled'
          b.cancelledBy = 'driver'
          b.cancelReason = reason
          b.updatedAt = new Date().toISOString()
          if (paid) refund(d, b, `Ride cancelled by ${firstName(u.name)}`)
        })
      d.scheduled = d.scheduled.filter((e) => e.payload.rideId !== rideId)
    })
  })
}

/* ==========================================================================
   Bookings (rider)
   ========================================================================== */

export async function requestRide(match: MatchResult, query: SearchQuery, message?: string) {
  return call(() => {
    const d = getDB()
    const u = requireMe(d)
    const ride = rideById(match.ride.id, d)
    if (!ride || ride.status !== 'scheduled') throw new ApiError('conflict', 'This ride is no longer available.')
    if (ride.seatsTotal - ride.seatsBooked < query.seats) throw new ApiError('conflict', 'Those seats were just taken. Try another match.')
    const existing = d.bookings.find((b) => b.rideId === ride.id && b.riderId === u.id && ACTIVE_BOOKING.includes(b.status))
    if (existing) return existing
    const now = new Date().toISOString()
    const booking: Booking = {
      id: uid('b_'),
      rideId: ride.id,
      riderId: u.id,
      pickup: query.pickup,
      drop: query.drop,
      seats: query.seats,
      fare: match.fare * query.seats,
      status: 'pending',
      matchScore: match.score,
      createdAt: now,
      updatedAt: now,
      message: message?.trim() || undefined,
    }
    update((draft) => {
      draft.bookings.push(booking)
      schedule(draft, 'driver_response', 3500 + Math.random() * 2500, { bookingId: booking.id })
    })
    return booking
  }, [500, 800])
}

export async function cancelBooking(bookingId: string, reason: string) {
  return call(() => {
    let refunded = 0
    update((d) => {
      const b = d.bookings.find((x) => x.id === bookingId)
      if (!b) throw new ApiError('not_found', 'Booking not found.')
      const ride = d.rides.find((r) => r.id === b.rideId)!
      const wasHolding = ['accepted', 'confirmed', 'driver_arriving', 'driver_arrived'].includes(b.status)
      if (wasHolding) ride.seatsBooked = Math.max(0, ride.seatsBooked - b.seats)
      if (b.paymentId && b.status !== 'accepted') refunded = refund(d, b, 'Booking cancelled')
      b.status = 'cancelled'
      b.cancelledBy = 'rider'
      b.cancelReason = reason
      b.updatedAt = new Date().toISOString()
      d.scheduled = d.scheduled.filter((e) => e.payload.bookingId !== bookingId)
    })
    return { refunded }
  })
}

function refund(d: DB, b: Booking, title: string) {
  const p = d.payments.find((x) => x.id === b.paymentId)
  if (!p || p.status !== 'success') return 0
  p.status = 'refunded'
  d.wallet.unshift({ id: uid('w_'), userId: b.riderId, type: 'credit', amount: p.amount, title: 'Refund', subtitle: title, createdAt: new Date().toISOString() })
  pushNotification(d, b.riderId, 'payment', 'Refund processed', `${money(p.amount)} has been added to your RideSync Wallet.`, '/wallet')
  return p.amount
}

export async function pay(bookingId: string, method: PaymentMethodKind, details: ChargeDetails) {
  if (isOffline()) {
    await wait(500)
    throw new ApiError('network', 'You’re offline. You haven’t been charged — try again when you’re connected.')
  }
  const d = getDB()
  const u = requireMe(d)
  const b = bookingById(bookingId, d)
  if (!b) throw new ApiError('not_found', 'Booking not found.')
  if (b.status !== 'accepted') throw new ApiError('conflict', b.status === 'confirmed' ? 'This ride is already paid.' : 'This booking can’t be paid right now.')
  const result = await gateway.charge({ amount: b.fare, reference: b.id, details })
  const paymentId = uid('p_')
  update((draft) => {
    draft.payments.push({
      id: paymentId,
      bookingId,
      amount: b.fare,
      method,
      status: result.ok ? 'success' : 'failed',
      reference: result.ok ? result.reference : `FAILED-${paymentId.slice(-5).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      testMode: gateway.testMode,
      failureReason: result.ok ? undefined : result.reason,
    })
    if (!result.ok) return
    const bk = draft.bookings.find((x) => x.id === bookingId)!
    const ride = draft.rides.find((r) => r.id === bk.rideId)!
    const driver = draft.users.find((x) => x.id === ride.driverId)!
    bk.status = 'confirmed'
    bk.paymentId = paymentId
    bk.updatedAt = new Date().toISOString()
    if (method === 'wallet') {
      draft.wallet.unshift({ id: uid('w_'), userId: u.id, type: 'debit', amount: b.fare, title: `Ride with ${driver.name}`, subtitle: `${bk.pickup.name} → ${bk.drop.name}`, createdAt: new Date().toISOString() })
    }
    systemMessage(draft, bk.id, `Ride confirmed. You can message ${firstName(driver.name)} here.`)
    pushNotification(draft, u.id, 'payment', 'Ride confirmed', `${money(b.fare)} paid · ${firstName(driver.name)} will pick you up ${new Date(ride.departAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`, `/trip/${bk.id}`)
  })
  if (!result.ok) throw new ApiError('payment', result.reason, result.retryable ? 'retryable' : undefined)
  return { paymentId, reference: result.reference }
}

export async function addMoney(amount: number, details: ChargeDetails) {
  if (isOffline()) throw new ApiError('network', 'You’re offline. Try again when you’re connected.')
  const u = requireMe(getDB())
  const result = await gateway.charge({ amount, reference: uid('topup_'), details })
  if (!result.ok) throw new ApiError('payment', result.reason)
  update((d) => {
    d.wallet.unshift({ id: uid('w_'), userId: u.id, type: 'credit', amount, title: 'Added to wallet', subtitle: `${details.method === 'card' ? 'Card' : 'UPI'} · Test mode`, createdAt: new Date().toISOString() })
  })
}

/* ==========================================================================
   Live ride
   In production these transitions come from the driver's app (GPS + taps).
   Here the simulated driver advances on a timeline so the flow is testable.
   ========================================================================== */

export const LIVE_TIMING = { arriveMs: 32_000, tripMs: 50_000, approachKm: 2.4 }

export async function startTracking(bookingId: string) {
  update((d) => {
    const b = d.bookings.find((x) => x.id === bookingId)
    if (b && b.status === 'confirmed') {
      b.status = 'driver_arriving'
      b.phaseStartedAt = new Date().toISOString()
      const ride = d.rides.find((r) => r.id === b.rideId)!
      const driver = d.users.find((u) => u.id === ride.driverId)!
      pushNotification(d, b.riderId, 'arriving', `${firstName(driver.name)} is on the way`, `${driver.vehicle?.make} ${driver.vehicle?.model} · ${driver.vehicle?.plate}`, `/trip/${b.id}`)
    }
  })
}

export function setLivePhase(bookingId: string, status: 'driver_arrived' | 'in_progress' | 'completed') {
  update((d) => {
    const b = d.bookings.find((x) => x.id === bookingId)
    if (!b) return
    b.status = status
    b.phaseStartedAt = new Date().toISOString()
    b.updatedAt = b.phaseStartedAt
    const ride = d.rides.find((r) => r.id === b.rideId)!
    const driver = d.users.find((u) => u.id === ride.driverId)!
    if (status === 'driver_arrived') pushNotification(d, b.riderId, 'arriving', `${firstName(driver.name)} has arrived`, `Look for a ${driver.vehicle?.color} ${driver.vehicle?.model} · ${driver.vehicle?.plate}`, `/trip/${b.id}`)
    if (status === 'completed') {
      const rider = d.users.find((u) => u.id === b.riderId)!
      rider.ridesTaken += 1
      rider.co2SavedKg = Math.round((rider.co2SavedKg + 2.4) * 10) / 10
    }
  })
}

/** Driver position for a live booking, derived from the phase timeline. */
export function livePosition(b: Booking, ride: Ride) {
  const route = routeNow(ride.origin, ride.destination)
  const pick = projectOnPolyline(b.pickup, route.coords)
  const drop = projectOnPolyline(b.drop, route.coords)
  const elapsed = b.phaseStartedAt ? Date.now() - new Date(b.phaseStartedAt).getTime() : 0
  if (b.status === 'driver_arriving') {
    const t = Math.min(1, elapsed / LIVE_TIMING.arriveMs)
    const etaMin = Math.max(1, Math.ceil((1 - t) * 4))
    if (pick.alongKm >= LIVE_TIMING.approachKm) {
      const startKm = pick.alongKm - LIVE_TIMING.approachKm
      return { ...pointAlong(route.coords, startKm + LIVE_TIMING.approachKm * t), progress: t, etaMin, route, pick, drop }
    }
    // Pickup is at the start of the route: the driver approaches from nearby.
    const from = { lat: b.pickup.lat + 0.014, lng: b.pickup.lng - 0.012 }
    const approach = syntheticRoute(from, b.pickup)
    const len = polylineLengthKm(approach)
    return { ...pointAlong(approach, len * t), progress: t, etaMin, route: { ...route, coords: [...approach, ...route.coords] }, pick, drop }
  }
  if (b.status === 'in_progress') {
    const t = Math.min(1, elapsed / LIVE_TIMING.tripMs)
    const at = pick.alongKm + (drop.alongKm - pick.alongKm) * t
    const totalMin = Math.max(5, Math.round(((drop.alongKm - pick.alongKm) / Math.max(route.distanceKm, 1)) * route.durationMin))
    return { ...pointAlong(route.coords, at), progress: t, etaMin: Math.max(1, Math.ceil((1 - t) * totalMin)), route, pick, drop }
  }
  const at = b.status === 'completed' ? drop.alongKm : pick.alongKm
  return { ...pointAlong(route.coords, at), progress: b.status === 'completed' ? 1 : 0, etaMin: 0, route, pick, drop }
}

export async function rateTrip(bookingId: string, stars: number, _tags: string[], _comment: string) {
  return call(() => {
    update((d) => {
      const b = d.bookings.find((x) => x.id === bookingId)!
      b.riderRating = stars
      const ride = d.rides.find((r) => r.id === b.rideId)!
      const driver = d.users.find((u) => u.id === ride.driverId)!
      driver.rating = Math.round(((driver.rating * driver.ratingCount + stars) / (driver.ratingCount + 1)) * 100) / 100
      driver.ratingCount += 1
    })
  })
}

/* ==========================================================================
   Chat
   ========================================================================== */

const REPLIES: [RegExp, string][] = [
  [/late|delay|minute|min\b/i, 'No worries, I’ll wait a couple of minutes 👍'],
  [/where|location|reach|here/i, 'Almost there — 2 minutes away. I’m near the main gate.'],
  [/luggage|bag|suitcase/i, 'Sure, there’s space in the boot.'],
  [/thank/i, 'Anytime! 😊'],
  [/gate|pickup|pick up/i, 'Main gate works. I’ll be in the drop-off bay.'],
]

export async function sendMessage(threadId: string, text: string) {
  return call(() => {
    update((d) => {
      const u = requireMe(d)
      d.messages.push({ id: uid('m_'), threadId, senderId: u.id, text: text.trim(), createdAt: new Date().toISOString() })
      const b = d.bookings.find((x) => x.id === threadId)
      if (!b) return
      const ride = d.rides.find((r) => r.id === b.rideId)!
      const otherId = b.riderId === u.id ? ride.driverId : b.riderId
      const other = d.users.find((x) => x.id === otherId)
      if (other?.simulated) {
        const reply = REPLIES.find(([re]) => re.test(text))?.[1] ?? 'Got it, see you soon!'
        schedule(d, 'chat_reply', 1800 + Math.random() * 1500, { threadId, senderId: otherId, text: reply })
      }
    })
  }, [120, 260])
}

/* ==========================================================================
   Notifications & settings
   ========================================================================== */

export function markAllRead() {
  update((d) => {
    const u = me(d)
    d.notifications.forEach((n) => {
      if (n.userId === u?.id) n.read = true
    })
  })
}

export function markRead(id: string) {
  update((d) => {
    const n = d.notifications.find((x) => x.id === id)
    if (n) n.read = true
  })
}

export function updateSettings(patch: Partial<DB['settings']>) {
  update((d) => Object.assign(d.settings, patch))
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    updateSettings({ notificationPermission: 'unsupported' })
    return 'unsupported' as const
  }
  const res = await Notification.requestPermission()
  const state = res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'unknown'
  updateSettings({ notificationPermission: state })
  return state
}

export function requestLocation(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      updateSettings({ locationPermission: 'denied' })
      return reject(new ApiError('validation', 'Location isn’t available on this device.'))
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateSettings({ locationPermission: 'granted' })
        const { latitude: lat, longitude: lng } = pos.coords
        resolve(nearestNamedPlace(lat, lng))
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) updateSettings({ locationPermission: 'denied' })
        reject(new ApiError('validation', err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'Couldn’t get your location. Try again.'))
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  })
}

/** Turns raw coordinates into a labelled place, snapping to a known place within 400 m. */
function nearestNamedPlace(lat: number, lng: number): Place {
  let best: Place | undefined
  let bestD = Infinity
  for (const p of PLACES) {
    const dd = Math.hypot((p.lat - lat) * 111, (p.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180))
    if (dd < bestD) {
      bestD = dd
      best = p
    }
  }
  if (best && bestD < 0.4) return best
  return { id: `here-${lat.toFixed(4)},${lng.toFixed(4)}`, name: 'Current location', area: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng, kind: 'custom' }
}

export function defaultPickup(u: User | null): Place {
  return CAMPUSES[u?.campus ?? 'chennai'].gate
}

/* ==========================================================================
   Simulator — processes due events (driver responses, incoming requests…)
   ========================================================================== */

export function processScheduled() {
  const d = getDB()
  const due = d.scheduled.filter((e) => e.due <= Date.now())
  if (!due.length) return
  update((draft) => {
    draft.scheduled = draft.scheduled.filter((e) => e.due > Date.now())
    for (const ev of due) runEvent(draft, ev)
  })
}

function runEvent(d: DB, ev: ScheduledEvent) {
  if (ev.type === 'driver_response') {
    const b = d.bookings.find((x) => x.id === ev.payload.bookingId)
    if (!b || b.status !== 'pending') return
    const ride = d.rides.find((r) => r.id === b.rideId)!
    const driver = d.users.find((u) => u.id === ride.driverId)!
    const seatsOk = ride.seatsTotal - ride.seatsBooked >= b.seats
    const accept = seatsOk && ride.status === 'scheduled' && !DECLINING_DRIVERS.has(driver.id)
    b.updatedAt = new Date().toISOString()
    if (accept) {
      b.status = 'accepted'
      ride.seatsBooked += b.seats
      systemMessage(d, b.id, `${firstName(driver.name)} accepted your request.`)
      pushNotification(d, b.riderId, 'accepted', `${firstName(driver.name)} accepted your request`, `Pay ${money(b.fare)} to confirm your seat.`, `/trip/${b.id}`)
    } else {
      b.status = 'rejected'
      pushNotification(d, b.riderId, 'rejected', `${firstName(driver.name)} couldn’t take this request`, 'We’ve kept your search — pick another match.', `/trip/${b.id}`)
    }
  }

  if (ev.type === 'incoming_request') {
    const ride = d.rides.find((r) => r.id === ev.payload.rideId)
    const rider = d.users.find((u) => u.id === ev.payload.riderId)
    if (!ride || !rider || ride.status !== 'scheduled') return
    if (d.bookings.some((b) => b.rideId === ride.id && b.riderId === rider.id)) return
    const route = routeNow(ride.origin, ride.destination)
    // Riders join along the route: near the start, mid-way, or close to the end.
    const fractions = [0.04, 0.35, 0.6]
    const idx = Number(ev.payload.index) % fractions.length
    const near = pointAlong(route.coords, route.distanceKm * fractions[idx]).point
    const pickup: Place =
      idx === 0
        ? ride.origin
        : { id: uid('pl_'), name: nearestNamedPlace(near.lat, near.lng).name === 'Current location' ? 'On your route' : nearestNamedPlace(near.lat, near.lng).name, area: `${(route.distanceKm * fractions[idx]).toFixed(1)} km along your route`, lat: near.lat + 0.002, lng: near.lng - 0.002, kind: 'custom' }
    const drop = ride.destination
    const query: SearchQuery = {
      pickup,
      drop,
      date: ride.departAt.slice(0, 10),
      time: new Date(ride.departAt).toTimeString().slice(0, 5),
      seats: 1,
      preferences: rider.preferences.filter((p) => p !== 'female_friendly' || rider.gender === 'female'),
    }
    const driver = d.users.find((u) => u.id === ride.driverId)!
    const local = new Date(ride.departAt)
    query.date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    const m = driver.vehicle ? scoreRide({ query, ride, route, driver, vehicle: driver.vehicle }) : null
    const now = new Date().toISOString()
    const booking: Booking = {
      id: uid('b_'),
      rideId: ride.id,
      riderId: rider.id,
      pickup,
      drop,
      seats: 1,
      fare: m?.fare ?? ride.farePerSeat,
      status: 'pending',
      matchScore: m?.score ?? 80,
      createdAt: now,
      updatedAt: now,
      message: ['Hi! I’ll be at the gate on time.', 'Can I bring a cabin bag?', undefined][idx],
    }
    d.bookings.push(booking)
    pushNotification(d, ride.driverId, 'request', `${rider.name} wants to join your ride`, `${booking.matchScore}% compatible · pickup at ${pickup.name}`, `/drive/${ride.id}`)
  }

  if (ev.type === 'rider_payment') {
    const b = d.bookings.find((x) => x.id === ev.payload.bookingId)
    if (!b || b.status !== 'accepted') return
    b.status = 'confirmed'
    b.updatedAt = new Date().toISOString()
    const rider = d.users.find((u) => u.id === b.riderId)!
    systemMessage(d, b.id, `${firstName(rider.name)} paid ${money(b.fare)}. Seat confirmed.`)
    const ride = d.rides.find((r) => r.id === b.rideId)!
    pushNotification(d, ride.driverId, 'payment', `${firstName(rider.name)} confirmed their seat`, `${money(b.fare)} cost share · pickup at ${b.pickup.name}`, `/drive/${ride.id}`)
  }

  if (ev.type === 'chat_reply') {
    d.messages.push({ id: uid('m_'), threadId: String(ev.payload.threadId), senderId: String(ev.payload.senderId), text: String(ev.payload.text), createdAt: new Date().toISOString() })
    const b = d.bookings.find((x) => x.id === ev.payload.threadId)
    const sender = d.users.find((u) => u.id === ev.payload.senderId)
    const meId = d.session?.userId
    if (b && sender && meId && d.settings.chatMessages) pushNotification(d, meId, 'chat', sender.name, String(ev.payload.text), `/chat/${b.id}`)
  }
}
