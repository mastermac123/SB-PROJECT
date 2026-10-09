import { useEffect, useState, useSyncExternalStore } from 'react'
import type {
  AppNotification,
  Booking,
  BookingDetail,
  DriverLocation,
  MatchResult,
  Message,
  PaymentRecord,
  Place,
  PublicUser,
  Ride,
  RideDetail,
  RidePreference,
  SearchQuery,
  ServerEvent,
  Thread,
  Trips,
  User,
  Vehicle,
} from '@/lib/types'

/* ==========================================================================
   Transport
   ========================================================================== */

export type ApiErrorCode = 'network' | 'auth' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'rate_limited' | 'server'

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public field?: string,
    public status = 0,
  ) {
    super(message)
  }
}

const CODE: Record<number, ApiErrorCode> = { 400: 'validation', 401: 'auth', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'x-ridesync': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('network', 'You’re offline or the server can’t be reached. Check your connection and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(CODE[res.status] ?? 'server', data.error ?? 'Something went wrong. Please try again.', data.field, res.status)
  }
  return data as T
}

const get = <T>(path: string) => request<T>('GET', path)
const post = <T = { ok: true }>(path: string, body: unknown = {}) => request<T>('POST', path, body)

/* ==========================================================================
   Query cache — a tiny SWR. Every subscribed key refetches on server events.
   ========================================================================== */

type Entry = { data?: unknown; error?: ApiError; loading: boolean; promise?: Promise<void>; subs: number }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const bump = () => {
  version++
  listeners.forEach((l) => l())
}

function load(key: string) {
  const e = cache.get(key) ?? { loading: true, subs: 0 }
  cache.set(key, e)
  if (e.promise) return e.promise
  e.loading = e.data === undefined
  e.promise = get(key)
    .then((data) => {
      e.data = data
      e.error = undefined
    })
    .catch((err: ApiError) => {
      e.error = err
    })
    .finally(() => {
      e.loading = false
      e.promise = undefined
      bump()
    })
  bump()
  return e.promise
}

/** Refetch everything on screen (after a mutation or a server push). */
export function revalidate() {
  for (const [key, e] of cache) {
    if (e.subs > 0) void load(key)
    else if (!e.promise) cache.delete(key)
  }
}

export function setCached<T>(key: string, data: T) {
  const e = cache.get(key) ?? { loading: false, subs: 0 }
  e.data = data
  e.error = undefined
  cache.set(key, e)
  bump()
}

export function useQuery<T>(key: string | null) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  useEffect(() => {
    if (!key) return
    const e = cache.get(key) ?? { loading: true, subs: 0 }
    cache.set(key, e)
    e.subs++
    if (e.data === undefined && !e.promise) void load(key)
    return () => {
      e.subs--
    }
  }, [key])
  const e = key ? cache.get(key) : undefined
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: key ? !e || (e.data === undefined && !e.error) : false,
    reload: () => (key ? load(key) : Promise.resolve()),
  }
}

/* ==========================================================================
   Live events (Server-Sent Events)
   ========================================================================== */

type LocationListener = (rideId: string, loc: DriverLocation) => void
const notificationListeners = new Set<(n: AppNotification) => void>()
const locationListeners = new Set<LocationListener>()
const connListeners = new Set<() => void>()
const syncListeners = new Set<() => void>()
let source: EventSource | null = null
let syncTimer: number | undefined
let connected = false

export function connectEvents() {
  if (source) return
  source = new EventSource('/api/events', { withCredentials: true })
  source.onopen = () => {
    connected = true
    connListeners.forEach((l) => l())
    revalidate() // catch up on anything missed while disconnected
  }
  source.onerror = () => {
    connected = false
    connListeners.forEach((l) => l())
  }
  source.onmessage = (msg) => {
    let ev: ServerEvent
    try {
      ev = JSON.parse(msg.data)
    } catch {
      return
    }
    if (ev.type === 'location') {
      locationListeners.forEach((l) => l(ev.rideId, ev.location))
      return
    }
    if (ev.type === 'notification') notificationListeners.forEach((l) => l(ev.notification))
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => {
      revalidate()
      syncListeners.forEach((l) => l())
    }, 120)
  }
}

/** Called whenever the server says data changed (e.g. a new ride was published). */
export function onSync(fn: () => void) {
  syncListeners.add(fn)
  return () => {
    syncListeners.delete(fn)
  }
}

export function disconnectEvents() {
  source?.close()
  source = null
  connected = false
  connListeners.forEach((l) => l())
}

export function useLiveConnected() {
  return useSyncExternalStore(
    (l) => {
      connListeners.add(l)
      return () => connListeners.delete(l)
    },
    () => connected,
  )
}

export function onNotification(fn: (n: AppNotification) => void) {
  notificationListeners.add(fn)
  return () => {
    notificationListeners.delete(fn)
  }
}

/** Driver's live position: initial value from the API, then pushed updates. */
export function useDriverLocation(rideId: string | undefined, initial?: DriverLocation) {
  const [loc, setLoc] = useState<DriverLocation | undefined>(initial)
  useEffect(() => {
    if (initial && (!loc || initial.at > loc.at)) setLoc(initial)
  }, [initial?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rideId) return
    const fn: LocationListener = (id, l) => id === rideId && setLoc(l)
    locationListeners.add(fn)
    return () => {
      locationListeners.delete(fn)
    }
  }, [rideId])
  return loc
}

/* ==========================================================================
   Auth & profile
   ========================================================================== */

export type AppConfig = { allowedDomain: string; googleClientId: string | null; emailLogin: boolean; devLogin: boolean }

export const useConfig = () => useQuery<AppConfig>('/config')

/** user: null = signed out, undefined = still loading. */
export function useMe(): { user: User | null | undefined; error?: ApiError } {
  const q = useQuery<User>('/me')
  if (q.error?.code === 'auth') return { user: null }
  if (q.error && !q.data) return { user: undefined, error: q.error }
  return { user: q.data }
}

type AuthResult = { user: User; isNew: boolean }
const afterLogin = (r: AuthResult) => {
  setCached('/me', r.user)
  connectEvents()
  return r
}

function signedOut() {
  disconnectEvents()
  cache.clear()
  cache.set('/me', { loading: false, subs: 0, error: new ApiError('auth', 'Signed out', undefined, 401) })
  bump()
}

export const auth = {
  google: (credential: string) => post<AuthResult>('/auth/google', { credential }).then(afterLogin),
  requestCode: (email: string) => post('/auth/code/request', { email }),
  verifyCode: (email: string, code: string) => post<AuthResult>('/auth/code/verify', { email, code }).then(afterLogin),
  dev: (email: string) => post<AuthResult>('/auth/dev', { email }).then(afterLogin),
  logout: async () => {
    await post('/auth/logout').catch(() => {})
    signedOut()
  },
}

export type ProfilePatch = Partial<Pick<User, 'name' | 'phone' | 'studentId' | 'programme' | 'gender' | 'commute' | 'upiId' | 'preferences' | 'emergencyContacts' | 'photo'>> & {
  onboarded?: true
}

export async function updateMe(patch: ProfilePatch) {
  const u = await request<User>('PATCH', '/me', patch)
  setCached('/me', u)
  return u
}

export async function saveVehicle(v: Omit<Vehicle, 'id'>) {
  const u = await request<User>('PUT', '/me/vehicle', v)
  setCached('/me', u)
  return u
}

export async function removeVehicle() {
  const u = await request<User>('DELETE', '/me/vehicle')
  setCached('/me', u)
  return u
}

export async function deleteAccount() {
  await request('DELETE', '/me')
  signedOut()
}

/* ==========================================================================
   Rides & bookings
   ========================================================================== */

export type SearchResponse = { results: MatchResult[]; ridesInWindow: number }
export type FeedItem = { ride: Ride; driver: PublicUser; vehicle: Vehicle }
export type RouteInfo = { coords: { lat: number; lng: number }[]; distanceKm: number; durationMin: number; source: 'osrm' | 'estimate' }

export const searchRides = (q: SearchQuery) => post<SearchResponse>('/rides/search', q)
export const matchRide = (rideId: string, query: SearchQuery) => post<{ match: MatchResult | null }>(`/rides/${rideId}/match`, { query }).then((r) => r.match)
export const routePreview = (from: Place, to: Place) => post<RouteInfo>('/route', { from, to })

export type OfferInput = {
  origin: Place
  destination: Place
  departAt: string
  seats: number
  farePerSeat: number
  maxDetourKm: number
  preferences: RidePreference[]
  note?: string
}

async function mutate<T>(p: Promise<T>) {
  const r = await p
  revalidate()
  return r
}

export const rides = {
  publish: (o: OfferInput) => mutate(post<Ride>('/rides', o)),
  cancel: (id: string, reason: string) => mutate(post(`/rides/${id}/cancel`, { reason })),
  start: (id: string) => mutate(post(`/rides/${id}/start`)),
  complete: (id: string) => mutate(post(`/rides/${id}/complete`)),
  location: (id: string, lat: number, lng: number, heading: number | null) => post(`/rides/${id}/location`, { lat, lng, heading }),
}

export const bookings = {
  request: (rideId: string, query: SearchQuery, message?: string) => mutate(post<Booking>('/bookings', { rideId, query, message })),
  respond: (id: string, accept: boolean) => mutate(post(`/bookings/${id}/respond`, { accept })),
  pay: (id: string, method: 'upi' | 'cash', reference?: string) => mutate(post(`/bookings/${id}/pay`, { method, reference })),
  paymentReceived: (id: string) => mutate(post(`/bookings/${id}/payment-received`)),
  cancel: (id: string, reason: string) => mutate(post(`/bookings/${id}/cancel`, { reason })),
  arrived: (id: string) => mutate(post(`/bookings/${id}/arrived`)),
  pickedUp: (id: string) => mutate(post(`/bookings/${id}/picked-up`)),
  dropped: (id: string) => mutate(post(`/bookings/${id}/dropped`)),
  rate: (id: string, stars: number, tags: string[], comment: string) => mutate(post(`/bookings/${id}/rate`, { stars, tags, comment })),
  send: (id: string, text: string) => mutate(post(`/bookings/${id}/messages`, { text })),
}

export const notifications = {
  readAll: () => mutate(post('/notifications/read-all')),
  read: (id: string) => mutate(post(`/notifications/${id}/read`)),
}

/** Query keys */
export const Q = {
  ride: (id: string) => `/rides/${id}`,
  booking: (id: string) => `/bookings/${id}`,
  messages: (id: string) => `/bookings/${id}/messages`,
  trips: '/trips',
  feed: '/rides/feed',
  threads: '/threads',
  notifications: '/notifications',
  payments: '/payments',
  badges: '/badges',
}

export type Badges = { unread: number; requests: number }
export type { AppNotification, BookingDetail, Message, PaymentRecord, RideDetail, Thread, Trips }

/** Statuses where a booking is live on the road. */
export const LIVE_STATUSES = ['driver_arriving', 'driver_arrived', 'in_progress'] as const

/* ==========================================================================
   Device permissions
   ========================================================================== */

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported'

export function notificationPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission === 'default' ? 'unknown' : (Notification.permission as PermissionState)
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const r = await Notification.requestPermission()
  return r === 'default' ? 'unknown' : (r as PermissionState)
}

export function requestLocation(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new ApiError('validation', 'Location isn’t available on this device.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        resolve({ id: `here-${lat.toFixed(5)},${lng.toFixed(5)}`, name: 'Current location', area: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng, kind: 'custom' })
      },
      (err) => reject(new ApiError('validation', err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'Couldn’t get your location. Try again.')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  })
}
