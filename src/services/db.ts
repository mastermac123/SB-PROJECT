import { useSyncExternalStore } from 'react'
import { communityRides, DEMO_USER, demoHistory, SEED_USERS } from '@/data/seed'
import type { AppNotification, Booking, Message, Payment, Ride, User, WalletTxn } from '@/lib/types'

/**
 * Local persistence layer. This plays the role of the backend for the
 * standalone build: one JSON document in localStorage, immutable snapshots,
 * and a subscribe API for React. services/api.ts is the only writer, so
 * swapping this for HTTP calls touches one module.
 */

export type ScheduledEvent = {
  id: string
  due: number
  type: 'driver_response' | 'incoming_request' | 'rider_payment' | 'chat_reply'
  payload: Record<string, string | number>
}

export type Credential = { email: string; hash: string; userId: string }

export type Settings = {
  simulateOffline: boolean
  locationPermission: 'unknown' | 'granted' | 'denied'
  notificationPermission: 'unknown' | 'granted' | 'denied' | 'unsupported'
  pushEnabled: boolean
  rideUpdates: boolean
  chatMessages: boolean
  promotions: boolean
  shareTripAuto: boolean
  hasSeenSplash?: boolean
}

export type DB = {
  version: number
  users: User[]
  credentials: Credential[]
  rides: Ride[]
  bookings: Booking[]
  payments: Payment[]
  wallet: WalletTxn[]
  messages: Message[]
  notifications: AppNotification[]
  scheduled: ScheduledEvent[]
  session: { userId: string } | null
  pendingVerification: { email: string; userId: string } | null
  settings: Settings
  savedPlaces: Record<string, { home?: string; work?: string }>
}

const KEY = 'ridesync:db:v1'
const VERSION = 1

// SHA-256 of "<email>:ridesync123" — the demo account password (see README).
const DEMO_HASH = 'beef7249a4373143c7b78201133ce28c413d892152b60da5f7cf15ca3e8ee3d0'

function fresh(): DB {
  const now = new Date()
  const users = [DEMO_USER, ...SEED_USERS]
  const hist = demoHistory(now)
  return {
    version: VERSION,
    users,
    credentials: [{ email: DEMO_USER.email, hash: DEMO_HASH, userId: DEMO_USER.id }],
    rides: [...hist.rides, ...communityRides(now, users)],
    bookings: hist.bookings,
    payments: hist.payments,
    wallet: hist.wallet,
    messages: hist.messages,
    notifications: hist.notifications,
    scheduled: [],
    session: null,
    pendingVerification: null,
    settings: {
      simulateOffline: false,
      locationPermission: 'unknown',
      notificationPermission: typeof Notification === 'undefined' ? 'unsupported' : 'unknown',
      pushEnabled: true,
      rideUpdates: true,
      chatMessages: true,
      promotions: false,
      shareTripAuto: false,
    },
    savedPlaces: { u_demo: { home: 'adyar', work: 'vit-chennai' } },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed.version === VERSION) return topUp(parsed)
    }
  } catch {
    /* corrupted or unavailable storage — start fresh */
  }
  return fresh()
}

/** Keep the community feed alive: add upcoming rides that don't exist yet. */
function topUp(d: DB): DB {
  const existing = new Set(d.rides.map((r) => r.id))
  const add = communityRides(new Date(), d.users).filter((r) => !existing.has(r.id))
  return add.length ? { ...d, rides: [...d.rides, ...add] } : d
}

let db: DB = load()
const listeners = new Set<() => void>()
let saveTimer: number | undefined

function save() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* quota exceeded — keep running in memory */
    }
  }, 60)
}

export function getDB(): DB {
  return db
}

export function update(mutator: (draft: DB) => void): DB {
  const draft = structuredClone(db)
  mutator(draft)
  db = draft
  save()
  listeners.forEach((l) => l())
  return db
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB)
}

export function resetDB() {
  const session = db.session
  db = fresh()
  db.session = session && db.users.some((u) => u.id === session.userId) ? session : null
  save()
  listeners.forEach((l) => l())
}

// Cross-tab sync
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return
  try {
    db = JSON.parse(e.newValue)
    listeners.forEach((l) => l())
  } catch {
    /* ignore */
  }
})
