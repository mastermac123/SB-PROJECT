import { AnimatePresence, motion } from 'framer-motion'
import { CarFront, Check, CircleCheck, Flag, Info, MessageCircle, Minus, Plus, Snowflake, Music, Play, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MatchScore } from '@/components/MatchScore'
import { MapView, type MapMarker } from '@/components/MapView'
import { ConfirmDialog, ModalSheet } from '@/components/Sheet'
import { StateView } from '@/components/States'
import { Stops } from '@/components/Stops'
import { BackButton } from '@/components/TopBar'
import { TripForm, validateTrip, type TripDraft } from '@/components/TripForm'
import { useToast } from '@/components/Toast'
import { VehicleForm } from '@/components/VehicleForm'
import { Avatar, Badge, Button, Chip, IconButton, Notice, Plate, Rating, Seats, Segmented, VerifiedBadge } from '@/components/ui'
import { CAMPUSES } from '@/data/places'
import { useIsDesktop } from '@/hooks'
import { dayTime, duration, firstName, money, plural, time } from '@/lib/format'
import { PREFERENCE_LABEL, suggestFarePerSeat, tierFor } from '@/lib/matching'
import type { Booking, RidePreference } from '@/lib/types'
import { formatPlate } from '@/lib/validation'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import {
  ApiError,
  cancelOfferedRide,
  completeOfferedRide,
  me,
  publishRide,
  requestsFor,
  respondToRequest,
  rideById,
  startOfferedRide,
  updateMe,
  userById,
} from '@/services/api'
import { useDB } from '@/services/db'
import { getRoute, routeNow, type Route } from '@/services/routing'
import { defaultQuery } from '@/state/search'
import { PREF_OPTIONS } from './find'
import { shareLink } from './rideDetails'

const DRIVER_PREFS: { value: RidePreference; icon: React.ReactNode }[] = [...PREF_OPTIONS.filter((p) => p.value !== 'minimal_detour'), { value: 'ac', icon: <Snowflake /> }, { value: 'music_ok', icon: <Music /> }]

/* ==========================================================================
   Offer a Ride
   ========================================================================== */

export function OfferRide() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const loc = useLocation()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.62)
  const incoming = (loc.state as { draft?: TripDraft } | null)?.draft
  const base = defaultQuery(CAMPUSES[u.campus].gate)
  const [draft, setDraft] = useState<TripDraft>(incoming ? { ...incoming, seats: Math.min(incoming.seats > 1 ? incoming.seats : 3, u.vehicle?.seats ?? 3) } : { pickup: base.pickup, drop: null, date: base.date, time: base.time, seats: Math.min(3, u.vehicle?.seats ?? 3) })
  const [detour, setDetour] = useState<'1' | '2' | '3' | '5'>('3')
  const [prefs, setPrefs] = useState<RidePreference[]>(u.preferences.filter((p) => p !== 'minimal_detour'))
  const [note, setNote] = useState('')
  const [route, setRoute] = useState<Route | null>(null)
  const [fare, setFare] = useState<number | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof validateTrip> & { form?: string | null }>({})
  const [publishing, setPublishing] = useState(false)
  const [vehicleOpen, setVehicleOpen] = useState(false)

  useEffect(() => {
    setRoute(null)
    if (!draft.pickup || !draft.drop || draft.pickup.id === draft.drop.id) return
    let alive = true
    getRoute(draft.pickup, draft.drop).then((r) => alive && setRoute(r))
    return () => {
      alive = false
    }
  }, [draft.pickup, draft.drop])

  const suggested = route ? suggestFarePerSeat(route.distanceKm, draft.seats, u.vehicle?.fuel) : null
  const maxFare = suggested ? Math.round((suggested * 1.5) / 10) * 10 : 0
  const effectiveFare = fare ?? suggested ?? 0
  useEffect(() => setFare(null), [suggested])

  if (u.commute === 'rider') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <BackButton />
        <StateView
          icon={<CarFront />}
          title="Offer rides to VIT students"
          body="Add your car to share empty seats on trips you’re already taking and split the fuel cost."
          actions={
            <Button
              block
              onClick={async () => {
                await updateMe({ commute: 'both' })
                setVehicleOpen(true)
              }}
            >
              Add my car
            </Button>
          }
        />
      </div>
    )
  }

  async function publish() {
    const errs = validateTrip(draft)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    if (!u.vehicle) {
      setVehicleOpen(true)
      return
    }
    setPublishing(true)
    try {
      const ride = await publishRide({
        origin: draft.pickup!,
        destination: draft.drop!,
        departAt: new Date(`${draft.date}T${draft.time}:00`),
        seats: draft.seats,
        farePerSeat: effectiveFare,
        maxDetourKm: Number(detour),
        preferences: prefs,
        note,
        distanceKm: route?.distanceKm,
        durationMin: route?.durationMin,
      })
      toast({ tone: 'success', message: 'Ride published to the VIT community' })
      nav(`/drive/${ride.id}`, { replace: true })
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.field === 'time' ? { time: e.message } : { form: e.message })
    } finally {
      setPublishing(false)
    }
  }

  const markers: MapMarker[] = [
    ...(draft.pickup ? [{ id: 'p', at: draft.pickup, kind: 'pickup' as const, label: draft.pickup.name }] : []),
    ...(draft.drop ? [{ id: 'd', at: draft.drop, kind: 'drop' as const, label: draft.drop.name }] : []),
  ]

  return (
    <MapScreen
      snaps={[0.62, 0.92]}
      map={<MapView markers={markers} routes={route ? [{ id: 'offer', coords: route.coords, kind: 'primary' }] : []} fit={route ? route.coords.filter((_, i) => i % 10 === 0).concat(markers.map((m) => m.at)) : markers.map((m) => m.at)} padding={padding} />}
      top={<BackButton surface />}
      header={
        <div className="row gap-2 grow" style={{ paddingBottom: 8 }}>
          {desktop && <BackButton />}
          <div className="stack gap-1">
            <h1 className="t-h2">Offer a Ride</h1>
            <p className="t-sm t-muted">Share your empty seats with VIT students.</p>
          </div>
        </div>
      }
      footer={
        <div className="stack gap-2">
          {errors.form && <Notice tone="error">{errors.form}</Notice>}
          <Button size="lg" block loading={publishing} onClick={publish}>
            Publish Ride
          </Button>
        </div>
      }
    >
      <div className="stack gap-6">
        <TripForm value={draft} onChange={(v) => { setDraft(v); setErrors({}) }} campus={u.campus} userId={u.id} seatsLabel="Seats offered" maxSeats={u.vehicle?.seats ?? 4} errors={errors} />

        {route && (
          <p className="t-sm t-muted row gap-2" style={{ marginTop: -12 }}>
            <Info size={15} />
            {Math.round(route.distanceKm)} km · about {duration(route.durationMin)}
            {route.source === 'estimate' && ' (estimated)'}
          </p>
        )}

        <section className="stack gap-3">
          <h2 className="section__title" style={{ padding: 0 }}>
            Vehicle
          </h2>
          {u.vehicle ? (
            <div className="vehicle-row">
              <span className="list-row__icon">
                <CarFront />
              </span>
              <span className="stack grow">
                <span className="t-body t-strong">
                  {u.vehicle.make} {u.vehicle.model}
                </span>
                <span className="t-sm t-muted">
                  {u.vehicle.color} · {plural(u.vehicle.seats, 'passenger seat')}
                </span>
              </span>
              <Plate>{u.vehicle.plate}</Plate>
            </div>
          ) : (
            <Button variant="secondary" block icon={<Plus />} onClick={() => setVehicleOpen(true)}>
              Add your car
            </Button>
          )}
        </section>

        <section className="stack gap-3">
          <div className="stack gap-1">
            <h2 className="section__title" style={{ padding: 0 }}>
              Maximum detour
            </h2>
            <span className="t-sm t-muted">How far you’ll go off your route to pick someone up.</span>
          </div>
          <Segmented
            label="Maximum detour"
            value={detour}
            onChange={setDetour}
            options={[
              { value: '1', label: '1 km' },
              { value: '2', label: '2 km' },
              { value: '3', label: '3 km' },
              { value: '5', label: '5 km' },
            ]}
          />
        </section>

        <section className="stack gap-3">
          <h2 className="section__title" style={{ padding: 0 }}>
            Preferences
          </h2>
          <div className="row wrap gap-2">
            {DRIVER_PREFS.map((o) => (
              <Chip key={o.value} icon={o.icon} selected={prefs.includes(o.value)} onClick={() => setPrefs((l) => (l.includes(o.value) ? l.filter((x) => x !== o.value) : [...l, o.value]))}>
                {PREFERENCE_LABEL[o.value]}
              </Chip>
            ))}
          </div>
        </section>

        <section className="stack gap-3">
          <h2 className="section__title" style={{ padding: 0 }}>
            Cost per seat
          </h2>
          {suggested ? (
            <div className="fare-box">
              <div className="row row--between">
                <IconButton label="Lower cost per seat" className="fare-box__btn" disabled={effectiveFare <= 30} onClick={() => setFare(Math.max(30, effectiveFare - 10))}>
                  <Minus />
                </IconButton>
                <div className="stack" style={{ alignItems: 'center' }}>
                  <span className="t-display tabular">{money(effectiveFare)}</span>
                  <span className="t-sm t-muted">per seat</span>
                </div>
                <IconButton label="Raise cost per seat" className="fare-box__btn" disabled={effectiveFare >= maxFare} onClick={() => setFare(Math.min(maxFare, effectiveFare + 10))}>
                  <Plus />
                </IconButton>
              </div>
              <p className="t-sm t-muted t-center" style={{ marginTop: 12 }}>
                {effectiveFare === suggested ? 'Suggested' : `Suggested ${money(suggested)}`} — fuel, tolls and wear for {Math.round(route!.distanceKm)} km split across {plural(draft.seats + 1, 'person', 'people')}. RideSync is for cost-sharing, so the maximum is {money(maxFare)}.
              </p>
            </div>
          ) : (
            <p className="t-sm t-muted">Choose your route to see a suggested cost-share.</p>
          )}
        </section>

        <section className="field">
          <label className="field__label" htmlFor="ride-note">
            Note for riders (optional)
          </label>
          <div className="input-wrap">
            <textarea id="ride-note" className="input" rows={2} maxLength={200} placeholder="e.g. Leaving from Main Gate, can drop near Guindy" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 72 }} />
          </div>
        </section>
      </div>

      <ModalSheet open={vehicleOpen} onClose={() => setVehicleOpen(false)} title="Add your car">
        <VehicleForm
          submitLabel="Save car"
          onSubmit={async (v) => {
            await updateMe({ vehicle: { id: `v_${u.id}`, ...v, plate: formatPlate(v.plate) }, commute: u.commute === 'rider' ? 'both' : u.commute })
            setVehicleOpen(false)
            toast({ tone: 'success', message: 'Car saved' })
          }}
        />
      </ModalSheet>
    </MapScreen>
  )
}

/* ==========================================================================
   Driver — active ride & requests
   ========================================================================== */

export function DriverRide() {
  const { rideId } = useParams()
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.5)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'start' | 'complete' | 'cancel' | null>(null)
  const ride = rideId ? rideById(rideId, db) : undefined
  const reqs = useMemo(() => (ride ? requestsFor(ride.id, db) : []), [db, ride])

  if (!ride) return <Navigate to="/rides" replace />
  if (ride.driverId !== u.id) return <Navigate to={`/ride/${ride.id}`} replace />

  const route = routeNow(ride.origin, ride.destination)
  const pending = reqs.filter((b) => b.status === 'pending').sort((a, b) => b.matchScore - a.matchScore)
  const riders = reqs.filter((b) => ['accepted', 'confirmed', 'in_progress', 'completed'].includes(b.status))
  const declined = reqs.filter((b) => b.status === 'rejected')
  const confirmedCount = reqs.filter((b) => b.status === 'confirmed' || b.status === 'in_progress').length
  const earnings = riders.filter((b) => b.status !== 'accepted').reduce((s, b) => s + b.fare, 0)
  const statusBadge =
    ride.status === 'scheduled' ? <Badge tone="verified">Active Ride</Badge> : ride.status === 'in_progress' ? <Badge tone="success">Live</Badge> : ride.status === 'completed' ? <Badge>Completed</Badge> : <Badge tone="error">Cancelled</Badge>

  async function respond(b: Booking, accept: boolean) {
    setBusy(b.id)
    try {
      await respondToRequest(b.id, accept)
      const rider = userById(b.riderId, db)!
      toast({ tone: accept ? 'success' : 'info', message: accept ? `${firstName(rider.name)} added — waiting for payment` : `Declined ${firstName(rider.name)}’s request` })
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  async function runConfirm() {
    setBusy('confirm')
    try {
      if (confirm === 'start') await startOfferedRide(ride!.id)
      if (confirm === 'complete') {
        await completeOfferedRide(ride!.id)
        toast({ tone: 'success', message: `Ride completed · ${money(earnings)} added to your wallet` })
      }
      if (confirm === 'cancel') {
        await cancelOfferedRide(ride!.id, 'Driver’s plans changed')
        toast({ tone: 'info', message: 'Ride cancelled. Riders have been notified and refunded.' })
      }
      setConfirm(null)
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  const markers: MapMarker[] = [
    { id: 'o', at: ride.origin, kind: 'pickup', label: ride.origin.name, sublabel: time(ride.departAt), darkLabel: true },
    { id: 'd', at: ride.destination, kind: 'drop', label: ride.destination.name },
    ...[...pending, ...riders]
      .filter((b) => b.pickup.id !== ride.origin.id)
      .map((b) => ({ id: b.id, at: b.pickup, kind: 'me' as const, label: firstName(userById(b.riderId, db)!.name) })),
  ]

  const footer =
    ride.status === 'scheduled' ? (
      <div className="row gap-2">
        <Button variant="danger-ghost" onClick={() => setConfirm('cancel')}>
          Cancel ride
        </Button>
        <Button block icon={<Play />} disabled={confirmedCount === 0} onClick={() => setConfirm('start')} title={confirmedCount === 0 ? 'Available once a rider has paid' : undefined}>
          Start ride
        </Button>
      </div>
    ) : ride.status === 'in_progress' ? (
      <Button size="lg" block icon={<Flag />} onClick={() => setConfirm('complete')}>
        Complete ride
      </Button>
    ) : (
      <Button size="lg" block variant="secondary" onClick={() => nav('/rides')}>
        Back to My Rides
      </Button>
    )

  return (
    <MapScreen
      snaps={[0.5, 0.92]}
      map={<MapView routes={[{ id: ride.id, coords: route.coords }]} markers={markers} fit={[ride.origin, ride.destination]} padding={padding} />}
      top={
        <>
          <BackButton surface to="/rides" />
          <span className="grow" />
          <IconButton
            label="Share ride"
            surface
            onClick={async () => {
              const r = await shareLink('Ride on RideSync', `I’m driving ${ride.origin.name} → ${ride.destination.name} at ${time(ride.departAt)}. Book a seat on RideSync:`)
              if (r === 'copied') toast({ tone: 'success', message: 'Link copied' })
            }}
          >
            <Share2 />
          </IconButton>
        </>
      }
      header={desktop ? <><BackButton to="/rides" /><span className="grow t-h3">Your ride</span></> : undefined}
      footer={footer}
    >
      <div className="stack gap-5">
        <div className="stack gap-3">
          <div className="row row--between">
            {statusBadge}
            <span className="t-sm t-muted">{dayTime(ride.departAt)}</span>
          </div>
          <Stops from={{ title: ride.origin.name, subtitle: ride.origin.area, time: time(ride.departAt) }} to={{ title: ride.destination.name, subtitle: ride.destination.area }} />
          <div className="facts">
            <div className="fact">
              <span className="fact__label">Seats filled</span>
              <span className="fact__value row gap-2">
                {ride.seatsBooked}/{ride.seatsTotal} <Seats total={ride.seatsTotal} taken={ride.seatsBooked} />
              </span>
            </div>
            <div className="fact">
              <span className="fact__label">Per seat</span>
              <span className="fact__value">{money(ride.farePerSeat)}</span>
            </div>
            <div className="fact">
              <span className="fact__label">Cost share</span>
              <span className="fact__value">{money(earnings)}</span>
            </div>
          </div>
        </div>

        {ride.status === 'scheduled' && (
          <section className="stack gap-3">
            <div className="row row--between">
              <h2 className="section__title" style={{ padding: 0 }}>
                Requests received
              </h2>
              {pending.length > 0 && <span className="t-sm t-muted">{plural(pending.length, 'pending', 'pending')}</span>}
            </div>
            <AnimatePresence initial={false}>
              {pending.map((b) => (
                <motion.div key={b.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40, height: 0, marginTop: -12 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
                  <RequestCard booking={b} busy={busy === b.id} onAccept={() => respond(b, true)} onDecline={() => respond(b, false)} full={ride.seatsTotal - ride.seatsBooked < b.seats} />
                </motion.div>
              ))}
            </AnimatePresence>
            {pending.length === 0 && (
              <div className="waiting">
                <div className="radar" style={{ width: 64, height: 64 }}>
                  <span className="radar__ring" />
                  <span className="radar__ring" />
                  <CarFront size={22} className="t-primary" />
                </div>
                <div className="stack gap-1">
                  <span className="t-body t-strong">{ride.seatsBooked >= ride.seatsTotal ? 'Your car is full' : 'Waiting for requests'}</span>
                  <span className="t-sm t-muted">{ride.seatsBooked >= ride.seatsTotal ? 'All seats are taken. New requests are paused.' : 'We’re showing your ride to VIT students travelling your way.'}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {riders.length > 0 && (
          <section className="stack gap-2">
            <h2 className="section__title" style={{ padding: 0 }}>
              Riders
            </h2>
            {riders.map((b) => {
              const r = userById(b.riderId, db)!
              return (
                <div key={b.id} className="rider-row">
                  <Avatar name={r.name} src={r.photo} size="sm" verified />
                  <span className="stack grow" style={{ minWidth: 0 }}>
                    <span className="t-body t-strong truncate">{r.name}</span>
                    <span className="t-sm t-muted truncate">
                      {b.pickup.name} · {money(b.fare)}
                    </span>
                  </span>
                  {b.status === 'accepted' ? <Badge tone="warning">Awaiting payment</Badge> : <Badge tone="success" icon={<Check />}>{b.status === 'completed' ? 'Done' : 'Paid'}</Badge>}
                  {b.status !== 'completed' && (
                    <IconButton label={`Message ${r.name}`} onClick={() => nav(`/chat/${b.id}`)}>
                      <MessageCircle />
                    </IconButton>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {declined.length > 0 && <p className="t-sm t-muted">{plural(declined.length, 'request')} declined</p>}

        {ride.status === 'completed' && (
          <Notice tone="success" icon={<CircleCheck />} title="Ride completed">
            {money(earnings)} cost-share added to your RideSync Wallet. Thanks for driving the VIT community.
          </Notice>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'start'}
        title="Start this ride?"
        body={`Riders will see you’re on the way. ${pending.length ? `${plural(pending.length, 'pending request')} will be declined automatically.` : ''}`}
        confirmLabel="Start ride"
        cancelLabel="Not yet"
        loading={busy === 'confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog open={confirm === 'complete'} title="Complete this ride?" body="Confirm everyone has been dropped off. Cost-share will be added to your wallet." confirmLabel="Complete ride" cancelLabel="Not yet" loading={busy === 'confirm'} onConfirm={runConfirm} onClose={() => setConfirm(null)} />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Cancel your ride?"
        body={riders.length ? `${plural(riders.length, 'rider')} will be notified and fully refunded. Frequent cancellations lower your reliability score.` : 'Your ride will be removed from search.'}
        confirmLabel="Cancel ride"
        destructive
        loading={busy === 'confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </MapScreen>
  )
}

function RequestCard({ booking, onAccept, onDecline, busy, full }: { booking: Booking; onAccept: () => void; onDecline: () => void; busy: boolean; full: boolean }) {
  const db = useDB()
  const rider = userById(booking.riderId, db)!
  return (
    <div className="request-card">
      <div className="row gap-3">
        <Avatar name={rider.name} src={rider.photo} verified />
        <div className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-body t-strong truncate">{rider.name}</span>
          <Rating value={rider.rating} count={rider.ridesTaken} />
        </div>
        <MatchScore score={booking.matchScore} tier={tierFor(booking.matchScore)} label="compatible" />
      </div>
      <div className="row wrap gap-2">
        <VerifiedBadge />
        {booking.seats > 1 && <Badge>{plural(booking.seats, 'seat')}</Badge>}
      </div>
      <Stops from={{ title: booking.pickup.name, subtitle: booking.pickup.area }} to={{ title: booking.drop.name }} />
      {booking.message && <p className="request-card__msg">“{booking.message}”</p>}
      <div className="row gap-2">
        <Button variant="secondary" block icon={<X />} disabled={busy} onClick={onDecline}>
          Decline
        </Button>
        <Button block icon={<Check />} loading={busy} disabled={full} onClick={onAccept}>
          {full ? 'Car full' : `Accept · ${money(booking.fare)}`}
        </Button>
      </div>
    </div>
  )
}
