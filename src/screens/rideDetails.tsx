import { AnimatePresence, motion } from 'framer-motion'
import { CarFront, ChevronDown, Clock, MessageSquareText, SearchX, Share2, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MatchBreakdown, MatchScore } from '@/components/MatchScore'
import { MapView } from '@/components/MapView'
import { StateView } from '@/components/States'
import { Stops } from '@/components/Stops'
import { BackButton } from '@/components/TopBar'
import { useToast } from '@/components/Toast'
import { Avatar, Badge, Button, IconButton, Notice, Plate, Rating, Seats, VerifiedBadge } from '@/components/ui'
import { useIsDesktop } from '@/hooks'
import { dayLabel, duration, firstName, hhmm, isoDate, money, plural, time } from '@/lib/format'
import { desiredTime, fmtKm, PREFERENCE_LABEL, TIER_LABEL } from '@/lib/matching'
import type { SearchQuery } from '@/lib/types'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import { ACTIVE_BOOKING, ApiError, me, requestRide, rideById, scoreOne, userById } from '@/services/api'
import { useDB } from '@/services/db'
import { routeNow } from '@/services/routing'
import { useSearch } from '@/state/search'

export async function shareLink(title: string, text: string, url = window.location.href) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard?.writeText(`${text} ${url}`)
  return 'copied'
}

export function RideDetails() {
  const { rideId } = useParams()
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const search = useSearch()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.55)
  const [why, setWhy] = useState(false)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ride = rideId ? rideById(rideId, db) : undefined
  if (!ride) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <StateView icon={<SearchX />} tone="neutral" title="Ride not found" body="This ride may have been removed by the driver." actions={<Button block onClick={() => nav('/find')}>Find another ride</Button>} />
      </div>
    )
  }
  const driver = userById(ride.driverId, db)!
  const vehicle = driver.vehicle!
  const depart = new Date(ride.departAt)
  const query: SearchQuery = search.query ?? { pickup: ride.origin, drop: ride.destination, date: isoDate(depart), time: hhmm(depart), seats: 1, preferences: [] }
  const match = scoreOne(ride, query)
  const route = routeNow(ride.origin, ride.destination)
  const seatsLeft = ride.seatsTotal - ride.seatsBooked
  const existing = db.bookings.find((b) => b.rideId === ride.id && b.riderId === u.id && ACTIVE_BOOKING.includes(b.status))
  const isMine = ride.driverId === u.id
  const unavailable = ride.status !== 'scheduled' || depart.getTime() < Date.now()
  const full = seatsLeft < query.seats

  const fare = match?.fare ?? ride.farePerSeat
  const total = fare * query.seats
  const pickupEta = match ? new Date(desiredTime(query).getTime() + match.timeDiffMin * 60_000) : depart

  async function request() {
    if (!match) return
    setRequesting(true)
    setError(null)
    try {
      const b = await requestRide(match, query, note)
      nav(`/trip/${b.id}`, { replace: false })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t send your request.')
    } finally {
      setRequesting(false)
    }
  }

  const cta = isMine ? (
    <Button size="lg" block variant="secondary" onClick={() => nav(`/drive/${ride.id}`)}>
      Manage your ride
    </Button>
  ) : existing ? (
    <Button size="lg" block variant="secondary" onClick={() => nav(`/trip/${existing.id}`)}>
      View your request
    </Button>
  ) : (
    <Button size="lg" block loading={requesting} disabled={unavailable || full || !match} onClick={request}>
      {unavailable ? 'No longer available' : full ? 'Not enough seats' : `Request Ride · ${money(total)}`}
    </Button>
  )

  const share = async () => {
    const r = await shareLink(`Ride to ${ride.destination.name}`, `${driver.name} is driving ${ride.origin.name} → ${ride.destination.name} at ${time(ride.departAt)} on RideSync.`)
    if (r === 'copied') toast({ tone: 'success', message: 'Link copied' })
  }

  return (
    <MapScreen
      snaps={[0.55, 0.92]}
      map={
        <MapView
          routes={[{ id: ride.id, coords: route.coords, kind: 'primary' }]}
          markers={[
            { id: 'o', at: ride.origin, kind: 'pickup', label: ride.origin.name, sublabel: time(ride.departAt) },
            { id: 'd', at: ride.destination, kind: 'drop', label: ride.destination.name },
            ...(match && match.pickupDistanceKm > 0.3 ? [{ id: 'me', at: query.pickup, kind: 'me' as const }] : []),
          ]}
          fit={[ride.origin, ride.destination, query.pickup]}
          padding={padding}
        />
      }
      top={
        <>
          <BackButton surface />
          <span className="grow" />
          <IconButton label="Share ride" surface onClick={share}>
            <Share2 />
          </IconButton>
        </>
      }
      header={
        desktop ? (
          <>
            <BackButton />
            <span className="grow t-h3">Ride details</span>
            <IconButton label="Share ride" onClick={share}>
              <Share2 />
            </IconButton>
          </>
        ) : undefined
      }
      footer={
        <div className="stack gap-2">
          {error && <Notice tone="error">{error}</Notice>}
          {cta}
        </div>
      }
    >
      <div className="stack gap-5">
        {/* Driver */}
        <div className="row gap-3">
          <Avatar name={driver.name} src={driver.photo} size="lg" verified />
          <div className="stack grow gap-1" style={{ minWidth: 0 }}>
            <span className="t-h3 truncate">{driver.name}</span>
            <Rating value={driver.rating} count={driver.ridesOffered} countLabel="rides offered" />
            <span className="t-caption t-muted" style={{ fontWeight: 400 }}>
              {driver.programme}
            </span>
          </div>
        </div>
        <div className="row wrap gap-2">
          <VerifiedBadge />
          {driver.completionRate >= 0.95 && <Badge>{Math.round(driver.completionRate * 100)}% rides completed</Badge>}
          {match?.history && <Badge tone="info">{match.history}</Badge>}
        </div>

        <div className="vehicle-row">
          <span className="list-row__icon">
            <CarFront />
          </span>
          <span className="stack grow">
            <span className="t-body t-strong">
              {vehicle.make} {vehicle.model}
            </span>
            <span className="t-sm t-muted">
              {vehicle.color} · {vehicle.fuel === 'ev' ? 'Electric' : vehicle.fuel[0].toUpperCase() + vehicle.fuel.slice(1)}
            </span>
          </span>
          <Plate>{vehicle.plate}</Plate>
        </div>

        <hr className="divider" />

        {/* Trip */}
        <section className="stack gap-4">
          <h2 className="section__title" style={{ padding: 0 }}>
            Trip
          </h2>
          <Stops
            from={{
              title: query.pickup.id === ride.origin.id ? ride.origin.name : query.pickup.name,
              subtitle: match && match.pickupDistanceKm > 0.15 ? `Driver passes ${fmtKm(match.pickupDistanceKm)} away` : ride.origin.area,
              time: time(pickupEta),
            }}
            to={{
              title: query.drop.name,
              subtitle: match && match.dropDistanceKm > 0.3 ? `Drop-off ${fmtKm(match.dropDistanceKm)} from here` : query.drop.area,
            }}
          />
          <div className="facts">
            <div className="fact">
              <span className="fact__label">Departure</span>
              <span className="fact__value">
                {dayLabel(ride.departAt)}, {time(ride.departAt)}
              </span>
            </div>
            <div className="fact">
              <span className="fact__label">
                <Clock size={13} /> Trip time
              </span>
              <span className="fact__value">~{duration(route.durationMin)}</span>
            </div>
            <div className="fact">
              <span className="fact__label">
                <Users size={13} /> Seats
              </span>
              <span className="fact__value row gap-2">
                {seatsLeft} left <Seats total={ride.seatsTotal} taken={ride.seatsBooked} />
              </span>
            </div>
          </div>
        </section>

        {/* AI match */}
        {match && (
          <section className="ai-panel">
            <button type="button" className="ai-panel__head" onClick={() => setWhy((w) => !w)} aria-expanded={why}>
              <MatchScore score={match.score} tier={match.tier} size="lg" />
              <span className="stack grow" style={{ alignItems: 'flex-start' }}>
                <span className="t-body t-strong">{TIER_LABEL[match.tier]}</span>
                <span className="t-sm t-primary t-strong">Why this ride?</span>
              </span>
              <motion.span animate={{ rotate: why ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={20} className="t-muted" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {why && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }} style={{ overflow: 'hidden' }}>
                  <div style={{ paddingTop: 16 }}>
                    <MatchBreakdown match={match} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!why && match.caveats.length > 0 && <p className="t-sm" style={{ color: 'var(--warning-600)', marginTop: 10 }}>{match.caveats[0]}</p>}
          </section>
        )}

        {/* Fare */}
        <section className="stack gap-3">
          <h2 className="section__title" style={{ padding: 0 }}>
            Cost share
          </h2>
          <div className="bill">
            <div className="bill__row">
              <span>
                {money(fare)} / seat × {plural(query.seats, 'seat')}
              </span>
              <span>{money(total)}</span>
            </div>
            <div className="bill__row t-sm" style={{ color: 'var(--ink-500)' }}>
              <span>You pay for the part of the route you share. Paid after {firstName(driver.name)} accepts.</span>
            </div>
          </div>
        </section>

        {ride.note && (
          <section className="stack gap-2">
            <h2 className="section__title" style={{ padding: 0 }}>
              Note from {firstName(driver.name)}
            </h2>
            <p className="t-body t-secondary">“{ride.note}”</p>
          </section>
        )}

        {ride.preferences.length > 0 && (
          <section className="stack gap-2">
            <h2 className="section__title" style={{ padding: 0 }}>
              Ride preferences
            </h2>
            <div className="row wrap gap-2">
              {ride.preferences.map((p) => (
                <Badge key={p} tone="outline">
                  {PREFERENCE_LABEL[p]}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {!existing && !isMine && !unavailable && (
          <div>
            {showNote ? (
              <div className="field">
                <label className="field__label" htmlFor="note">
                  Message to {firstName(driver.name)} (optional)
                </label>
                <div className="input-wrap">
                  <textarea id="note" className="input" maxLength={140} rows={2} placeholder="e.g. I’ll have one cabin bag" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 72 }} />
                </div>
              </div>
            ) : (
              <button type="button" className="row gap-2 t-sm t-strong t-primary" onClick={() => setShowNote(true)}>
                <MessageSquareText size={16} />
                Add a message for {firstName(driver.name)}
              </button>
            )}
          </div>
        )}
      </div>
    </MapScreen>
  )
}
