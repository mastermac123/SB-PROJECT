import { Bell, CarFront, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { MapView, type MapRoute } from '@/components/MapView'
import { MatchScore } from '@/components/MatchScore'
import { TripForm, validateTrip, type TripDraft } from '@/components/TripForm'
import { Avatar, Badge, Button, Segmented } from '@/components/ui'
import { CAMPUSES, placeById } from '@/data/places'
import { dayTime, firstName, hhmm, isoDate, time } from '@/lib/format'
import { scoreRide } from '@/lib/matching'
import type { Booking, Ride, SearchQuery } from '@/lib/types'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import { currentTrip, me, myBookings, pendingRequestCount, rideById, unreadCount, userById } from '@/services/api'
import { useDB, type DB } from '@/services/db'
import { routeNow } from '@/services/routing'
import { defaultQuery, useSearch } from '@/state/search'
import { BOOKING_STATUS } from './trip'

export function Home() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const search = useSearch()
  const campus = CAMPUSES[u.campus]
  const canDrive = u.commute !== 'rider'
  const [mode, setMode] = useState<'find' | 'offer'>(u.commute === 'driver' ? 'offer' : 'find')
  const base = search.query ?? defaultQuery(campus.gate)
  const [draft, setDraft] = useState<TripDraft>({ pickup: base.pickup, drop: search.query ? base.drop : null, date: base.date, time: base.time, seats: base.seats })
  const [errors, setErrors] = useState<ReturnType<typeof validateTrip>>({})
  const padding = useMapPadding(0.6)

  const { booking, offered } = currentTrip(u.id, db)
  const requests = pendingRequestCount(u.id, db)
  const unread = unreadCount(u.id, db)
  const recommendation = useMemo(() => recommend(db, u.id), [db, u.id])
  const recent = myBookings(u.id, db)
    .filter((b) => b.status === 'completed')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]

  // Map: campus + routes of rides leaving soon.
  const soon = db.rides
    .filter((r) => r.status === 'scheduled' && r.driverId !== u.id && +new Date(r.departAt) > Date.now() && Math.abs(r.origin.lat - campus.gate.lat) + Math.abs(r.origin.lng - campus.gate.lng) < 0.3)
    .sort((a, b) => +new Date(a.departAt) - +new Date(b.departAt))
    .slice(0, 4)
  const routes: MapRoute[] = soon.map((r) => ({ id: r.id, coords: routeNow(r.origin, r.destination).coords, kind: 'alt' }))
  const fit = [campus.gate, ...soon.map((r) => r.destination)]

  function submit() {
    const errs = validateTrip(draft)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    if (mode === 'offer') {
      nav('/offer', { state: { draft } })
      return
    }
    const q: SearchQuery = { pickup: draft.pickup!, drop: draft.drop!, date: draft.date, time: draft.time, seats: draft.seats, preferences: search.query?.preferences ?? u.preferences.filter((p) => p !== 'music_ok' && p !== 'ac') }
    void search.run(q)
    nav('/find/results')
  }

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()

  return (
    <MapScreen
      snaps={[0.6, 0.92]}
      map={<MapView routes={routes} markers={[{ id: 'campus', at: campus.gate, kind: 'pickup', label: campus.name, darkLabel: true }]} fit={fit} padding={padding} animateRoutes={false} />}
      top={
        <div className="row row--between grow only-mobile">
          <span className="map-chip">
            <Logo height={22} />
          </span>
          <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="icon-btn icon-btn--surface" style={{ position: 'relative' }}>
            <Bell />
            {unread > 0 && <span className="dot-badge" />}
          </Link>
        </div>
      }
      header={
        <div className="stack gap-1 grow" style={{ paddingBottom: 8 }}>
          <span className="t-sm t-muted">
            {greeting}, {firstName(u.name)}
          </span>
          <h1 className="t-h2">{mode === 'offer' ? 'Where are you driving?' : 'Where are you going?'}</h1>
        </div>
      }
    >
      <div className="stack gap-4">
        {canDrive && u.commute === 'both' && (
          <Segmented
            label="Ride mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'find', label: 'Find a ride' },
              { value: 'offer', label: 'Offer a ride' },
            ]}
          />
        )}
        <TripForm value={draft} onChange={(v) => { setDraft(v); setErrors({}) }} campus={u.campus} userId={u.id} errors={errors} seatsLabel={mode === 'offer' ? 'Seats offered' : 'Seats'} maxSeats={mode === 'offer' ? u.vehicle?.seats ?? 4 : 4} />
        <Button size="lg" block onClick={submit} icon={mode === 'offer' ? <CarFront /> : <Search />}>
          {mode === 'offer' ? 'Continue to Offer' : 'Find a Ride'}
        </Button>

        {/* Context — only what's useful right now */}
        {(booking || offered || requests > 0) && (
          <section className="stack gap-2" style={{ marginTop: 8 }}>
            <h2 className="section__title">Upcoming</h2>
            {booking && <UpcomingBooking db={db} booking={booking} />}
            {offered && <UpcomingOffer db={db} ride={offered} />}
          </section>
        )}

        {recommendation && !booking && (
          <section className="stack gap-2" style={{ marginTop: 8 }}>
            <h2 className="section__title">Suggested for you</h2>
            <button
              type="button"
              className="context-row"
              onClick={() => {
                void search.run(recommendation.query)
                nav('/find/results')
              }}
            >
              <Avatar name={recommendation.driverName} size="sm" />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="t-body t-strong truncate">
                  {recommendation.ride.origin.name} → {recommendation.ride.destination.name}
                </span>
                <span className="t-sm t-muted truncate">
                  {firstName(recommendation.driverName)} · {dayTime(recommendation.ride.departAt)} · matches your saved home
                </span>
              </span>
              <MatchScore score={recommendation.score} tier={recommendation.tier} label="" />
            </button>
          </section>
        )}

        {recent && (
          <section className="stack gap-2" style={{ marginTop: 8 }}>
            <h2 className="section__title">Recent</h2>
            <button
              type="button"
              className="context-row"
              onClick={() => {
                setDraft((d) => ({ ...d, pickup: recent.pickup, drop: recent.drop }))
                setMode('find')
                window.scrollTo({ top: 0 })
              }}
            >
              <span className="list-row__icon">
                <RotateCcw />
              </span>
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="t-body t-strong truncate">
                  {recent.pickup.name} → {recent.drop.name}
                </span>
                <span className="t-sm t-muted">Ride again · last on {new Date(rideById(recent.rideId, db)!.departAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </span>
              <ChevronRight size={18} className="t-muted" />
            </button>
          </section>
        )}
      </div>
    </MapScreen>
  )
}

function UpcomingBooking({ db, booking }: { db: DB; booking: Booking }) {
  const nav = useNavigate()
  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const s = BOOKING_STATUS[booking.status]
  const live = ['driver_arriving', 'driver_arrived', 'in_progress'].includes(booking.status)
  return (
    <button type="button" className="context-row context-row--emph" onClick={() => nav(live ? `/live/${booking.id}` : `/trip/${booking.id}`)}>
      <Avatar name={driver.name} src={driver.photo} size="sm" verified />
      <span className="stack grow" style={{ minWidth: 0 }}>
        <span className="t-body t-strong truncate">
          {booking.pickup.name} → {booking.drop.name}
        </span>
        <span className="t-sm t-muted truncate">
          {firstName(driver.name)} · {dayTime(ride.departAt)}
        </span>
      </span>
      <Badge tone={s.tone}>{s.short}</Badge>
    </button>
  )
}

function UpcomingOffer({ db, ride }: { db: DB; ride: Ride }) {
  const nav = useNavigate()
  const pending = db.bookings.filter((b) => b.rideId === ride.id && b.status === 'pending').length
  return (
    <button type="button" className="context-row context-row--emph" onClick={() => nav(`/drive/${ride.id}`)}>
      <span className="list-row__icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
        <CarFront />
      </span>
      <span className="stack grow" style={{ minWidth: 0 }}>
        <span className="t-body t-strong truncate">
          {ride.origin.name} → {ride.destination.name}
        </span>
        <span className="t-sm t-muted truncate">
          You’re driving · {time(ride.departAt)} · {ride.seatsBooked}/{ride.seatsTotal} seats filled
        </span>
      </span>
      {pending > 0 ? <Badge tone="error">{pending} new</Badge> : ride.status === 'in_progress' ? <Badge tone="success">Live</Badge> : <ChevronRight size={18} className="t-muted" />}
    </button>
  )
}

/** Best upcoming ride for the user's habitual route (campus ↔ saved home). */
function recommend(db: DB, userId: string) {
  const u = db.users.find((x) => x.id === userId)!
  const homeId = db.savedPlaces[userId]?.home
  const home = homeId ? placeById(homeId) : undefined
  if (!home) return null
  const campus = CAMPUSES[u.campus].gate
  const evening = new Date().getHours() >= 11
  const best = db.rides
    .filter((r) => r.status === 'scheduled' && r.driverId !== userId && +new Date(r.departAt) > Date.now() && +new Date(r.departAt) - Date.now() < 30 * 3600_000)
    .map((ride) => {
      const driver = db.users.find((x) => x.id === ride.driverId)
      if (!driver?.vehicle) return null
      const d = new Date(ride.departAt)
      const query: SearchQuery = { pickup: evening ? campus : home, drop: evening ? home : campus, date: isoDate(d), time: hhmm(d), seats: 1, preferences: [] }
      const m = scoreRide({ query, ride, route: routeNow(ride.origin, ride.destination), driver, vehicle: driver.vehicle, history: db.bookings.filter((b) => b.riderId === userId), rides: db.rides })
      return m && m.score >= 75 ? { ...m, query, driverName: driver.name } : null
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)[0]
  return best ?? null
}
