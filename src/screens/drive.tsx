import { AnimatePresence, motion } from 'framer-motion'
import { Banknote, CarFront, Check, CircleCheck, Flag, Info, LocateFixed, MapPinOff, MessageCircle, Minus, Music, Phone, Play, Plus, Share2, Snowflake, Star, UserMinus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { Avatar, Badge, Button, Chip, IconButton, Notice, Plate, Rating, RideCardSkeleton, Seats, Segmented, VerifiedBadge } from '@/components/ui'
import { CAMPUS } from '@/data/places'
import { useIsDesktop } from '@/hooks'
import { dayTime, duration, firstName, money, plural, time } from '@/lib/format'
import { PREFERENCE_LABEL, suggestFarePerSeat, tierFor } from '@/lib/matching'
import type { Booking, DriverLocation, RidePreference, RiderInfo } from '@/lib/types'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import { ApiError, Q, bookings, rides, routePreview, saveVehicle, useMe, useQuery, type RideDetail, type RouteInfo } from '@/services/api'
import { defaultQuery } from '@/state/search'
import { PREF_OPTIONS } from './find'
import { shareLink } from './rideDetails'
import { paymentLabel } from './trip'

const DRIVER_PREFS: { value: RidePreference; icon: React.ReactNode }[] = [...PREF_OPTIONS.filter((p) => p.value !== 'minimal_detour'), { value: 'ac', icon: <Snowflake /> }, { value: 'music_ok', icon: <Music /> }]

/* ==========================================================================
   Offer a Ride
   ========================================================================== */

export function OfferRide() {
  const { user } = useMe()
  const u = user!
  const nav = useNavigate()
  const toast = useToast()
  const loc = useLocation()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.62)
  const incoming = (loc.state as { draft?: TripDraft } | null)?.draft
  const base = defaultQuery(CAMPUS)
  const maxSeats = u.vehicle?.seats ?? 4
  const [draft, setDraft] = useState<TripDraft>(incoming ? { ...incoming, seats: Math.min(Math.max(incoming.seats, 1), maxSeats) } : { pickup: base.pickup, drop: null, date: base.date, time: base.time, seats: Math.min(3, maxSeats) })
  const [detour, setDetour] = useState<'1' | '2' | '3' | '5'>('3')
  const [prefs, setPrefs] = useState<RidePreference[]>(u.preferences.filter((p) => p !== 'minimal_detour'))
  const [note, setNote] = useState('')
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const [fare, setFare] = useState<number | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof validateTrip> & { form?: string | null }>({})
  const [publishing, setPublishing] = useState(false)
  const [vehicleOpen, setVehicleOpen] = useState(false)

  useEffect(() => {
    setRoute(null)
    if (!draft.pickup || !draft.drop || draft.pickup.id === draft.drop.id) return
    let alive = true
    routePreview(draft.pickup, draft.drop)
      .then((r) => alive && setRoute(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [draft.pickup, draft.drop])

  const suggested = route ? suggestFarePerSeat(route.distanceKm, draft.seats, u.vehicle?.fuel) : null
  const maxFare = suggested ? Math.round((suggested * 1.5) / 10) * 10 : 0
  const effectiveFare = fare ?? suggested ?? 0
  useEffect(() => setFare(null), [suggested])

  if (u.commute === 'rider' && !u.vehicle) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <StateView
          icon={<CarFront />}
          title="Offer rides to VIT students"
          body="Add your car to share empty seats on trips you’re already taking and split the fuel cost."
          actions={
            <Button block onClick={() => setVehicleOpen(true)}>
              Add my car
            </Button>
          }
        />
        <VehicleModal open={vehicleOpen} onClose={() => setVehicleOpen(false)} />
      </div>
    )
  }

  async function publish() {
    const errs = validateTrip(draft)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    if (!u.vehicle) return setVehicleOpen(true)
    setPublishing(true)
    try {
      const ride = await rides.publish({
        origin: draft.pickup!,
        destination: draft.drop!,
        departAt: new Date(`${draft.date}T${draft.time}:00`).toISOString(),
        seats: draft.seats,
        farePerSeat: effectiveFare,
        maxDetourKm: Number(detour),
        preferences: prefs,
        note: note.trim() || undefined,
      })
      toast({ tone: 'success', message: 'Ride published — VIT students can book it now' })
      nav(`/drive/${ride.id}`, { replace: true })
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.field === 'time' ? { time: e.message } : e.field === 'drop' ? { drop: e.message } : { form: e.message })
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
        <TripForm value={draft} onChange={(v) => { setDraft(v); setErrors({}) }} seatsLabel="Seats offered" maxSeats={maxSeats} errors={errors} />
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
          {!u.upiId && (
            <Notice tone="info" icon={<Banknote />} action={<Button size="sm" variant="tonal" onClick={() => nav('/profile/payments')}>Add</Button>}>
              Add your UPI ID so riders can pay you directly. Otherwise they’ll pay cash.
            </Notice>
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
          {suggested !== null && route ? (
            <div className="fare-box">
              <div className="row row--between">
                <IconButton label="Lower cost per seat" className="fare-box__btn" disabled={effectiveFare <= 0} onClick={() => setFare(Math.max(0, effectiveFare - 10))}>
                  <Minus />
                </IconButton>
                <div className="stack" style={{ alignItems: 'center' }}>
                  <span className="t-display tabular">{effectiveFare === 0 ? 'Free' : money(effectiveFare)}</span>
                  <span className="t-sm t-muted">per seat</span>
                </div>
                <IconButton label="Raise cost per seat" className="fare-box__btn" disabled={effectiveFare >= maxFare} onClick={() => setFare(Math.min(maxFare, effectiveFare + 10))}>
                  <Plus />
                </IconButton>
              </div>
              <p className="t-sm t-muted t-center" style={{ marginTop: 12 }}>
                {effectiveFare === suggested ? 'Suggested' : `Suggested ${money(suggested)}`} — fuel, tolls and wear for {Math.round(route.distanceKm)} km split across {plural(draft.seats + 1, 'person', 'people')}. RideSync is for cost-sharing, so the maximum is {money(maxFare)}.
              </p>
            </div>
          ) : (
            <p className="t-sm t-muted">Choose your destination to see a suggested cost-share.</p>
          )}
        </section>

        <section className="field">
          <label className="field__label" htmlFor="ride-note">
            Note for riders (optional)
          </label>
          <div className="input-wrap">
            <textarea id="ride-note" className="input" rows={2} maxLength={200} placeholder="e.g. Leaving from main gate, can drop near Dadar" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 72 }} />
          </div>
        </section>
      </div>
      <VehicleModal open={vehicleOpen} onClose={() => setVehicleOpen(false)} />
    </MapScreen>
  )
}

function VehicleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  return (
    <ModalSheet open={open} onClose={onClose} title="Add your car">
      <VehicleForm
        submitLabel="Save car"
        onSubmit={async (v) => {
          await saveVehicle(v)
          onClose()
          toast({ tone: 'success', message: 'Car saved' })
        }}
      />
    </ModalSheet>
  )
}

/* ==========================================================================
   Live location sharing (driver's phone → riders)
   ========================================================================== */

function useShareLocation(rideId: string, active: boolean) {
  const [pos, setPos] = useState<DriverLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useRef(0)
  useEffect(() => {
    if (!active) return
    if (!('geolocation' in navigator)) {
      setError('This device can’t share location.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading ?? undefined, at: new Date().toISOString() }
        setPos(loc)
        setError(null)
        if (Date.now() - last.current > 4000) {
          last.current = Date.now()
          rides.location(rideId, loc.lat, loc.lng, Number.isFinite(p.coords.heading) ? p.coords.heading : null).catch(() => {})
        }
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'Location is blocked. Allow it in your browser so riders can see where you are.' : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
    )
    // Keep the screen awake while driving, where supported.
    let lock: { release: () => Promise<void> } | null = null
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wake
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => {
      navigator.geolocation.clearWatch(id)
      void lock?.release()
    }
  }, [rideId, active])
  return { pos, error }
}

/* ==========================================================================
   Driver — active ride & requests
   ========================================================================== */

type RiderBooking = Booking & { rider: RiderInfo }

export function DriverRide() {
  const { rideId } = useParams()
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.5)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'start' | 'complete' | 'cancel' | null>(null)
  const [removing, setRemoving] = useState<RiderBooking | null>(null)
  const q = useQuery<RideDetail>(rideId ? Q.ride(rideId) : null)
  const ride = q.data?.ride
  const live = ride?.status === 'in_progress'
  const { pos, error: locError } = useShareLocation(rideId ?? '', !!live && ride?.driverId === user?.id)

  if (q.loading)
    return (
      <div className="page">
        <div className="page__content page__content--narrow" style={{ paddingTop: 40 }}>
          <RideCardSkeleton />
        </div>
      </div>
    )
  if (!ride || !q.data) return <Navigate to="/rides" replace />
  if (ride.driverId !== user?.id) return <Navigate to={`/ride/${ride.id}`} replace />

  const reqs = (q.data.bookings ?? []) as RiderBooking[]
  const pending = reqs.filter((b) => b.status === 'pending').sort((a, b) => b.matchScore - a.matchScore)
  const riders = reqs.filter((b) => ['accepted', 'confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed'].includes(b.status))
  const declined = reqs.filter((b) => b.status === 'rejected').length
  const ready = reqs.filter((b) => b.status === 'confirmed' || b.status === 'accepted').length
  const toCollect = riders.filter((b) => b.status !== 'completed').reduce((s, b) => s + b.fare, 0)
  const earned = riders.filter((b) => b.status === 'completed').reduce((s, b) => s + b.fare, 0)
  const statusBadge =
    ride.status === 'scheduled' ? <Badge tone="verified">Active Ride</Badge> : ride.status === 'in_progress' ? <Badge tone="success">Live</Badge> : ride.status === 'completed' ? <Badge>Completed</Badge> : <Badge tone="error">Cancelled</Badge>

  async function act(id: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(id)
    try {
      await fn()
      if (ok) toast({ tone: 'success', message: ok })
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  async function runConfirm() {
    setBusy('confirm')
    try {
      if (confirm === 'start') await rides.start(ride!.id)
      if (confirm === 'complete') {
        await rides.complete(ride!.id)
        toast({ tone: 'success', message: 'Ride completed. Thanks for driving the VIT community!' })
      }
      if (confirm === 'cancel') {
        await rides.cancel(ride!.id, 'Driver’s plans changed')
        toast({ tone: 'info', message: 'Ride cancelled. Riders have been notified.' })
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
      .filter((b) => b.status !== 'completed' && Math.abs(b.pickup.lat - ride.origin.lat) + Math.abs(b.pickup.lng - ride.origin.lng) > 0.002)
      .map((b) => ({ id: b.id, at: b.pickup, kind: 'me' as const, label: firstName(b.rider.name) })),
    ...(pos ? [{ id: 'car', at: pos, kind: 'car' as const, heading: pos.heading }] : []),
  ]

  const footer =
    ride.status === 'scheduled' ? (
      <div className="row gap-2">
        <Button variant="danger-ghost" onClick={() => setConfirm('cancel')}>
          Cancel ride
        </Button>
        <Button block icon={<Play />} disabled={ready === 0} onClick={() => setConfirm('start')} title={ready === 0 ? 'Available once a rider is confirmed' : undefined}>
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
      map={<MapView routes={[{ id: ride.id, coords: ride.route }]} markers={markers} fit={pos ? [pos, ride.destination] : [ride.origin, ride.destination]} padding={padding} follow={pos ? 'car' : undefined} />}
      top={
        <>
          <BackButton surface to="/rides" />
          <span className="grow" />
          <IconButton
            label="Share ride"
            surface
            onClick={async () => {
              const r = await shareLink('Ride on RideSync', `I’m driving ${ride.origin.name} → ${ride.destination.name} at ${time(ride.departAt)}. Book a seat on RideSync:`, `${window.location.origin}/ride/${ride.id}`)
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
              <span className="fact__value">{ride.farePerSeat ? money(ride.farePerSeat) : 'Free'}</span>
            </div>
            <div className="fact">
              <span className="fact__label">{ride.status === 'completed' ? 'Cost share' : 'To collect'}</span>
              <span className="fact__value">{money(ride.status === 'completed' ? earned : toCollect)}</span>
            </div>
          </div>
        </div>

        {live && (
          <Notice tone={locError ? 'warning' : 'success'} icon={locError ? <MapPinOff /> : <LocateFixed />} title={locError ? 'Location not shared' : 'Sharing live location'}>
            {locError ?? 'Riders can see where you are. Keep this screen open while you drive.'}
          </Notice>
        )}

        {ride.status === 'scheduled' && (
          <section className="stack gap-3">
            <div className="row row--between">
              <h2 className="section__title" style={{ padding: 0 }}>
                Requests received
              </h2>
              {pending.length > 0 && <span className="t-sm t-muted">{pending.length} pending</span>}
            </div>
            <AnimatePresence initial={false}>
              {pending.map((b) => (
                <motion.div key={b.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40, height: 0, marginTop: -12 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
                  <RequestCard
                    booking={b}
                    busy={busy === b.id}
                    full={ride.seatsTotal - ride.seatsBooked < b.seats}
                    onAccept={() => act(b.id, () => bookings.respond(b.id, true), `${firstName(b.rider.name)} added to your ride`)}
                    onDecline={() => act(b.id, () => bookings.respond(b.id, false))}
                  />
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
                  <span className="t-sm t-muted">{ride.seatsBooked >= ride.seatsTotal ? 'All seats are taken.' : 'Your ride is live in search. Requests appear here instantly.'}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {riders.length > 0 && (
          <section className="stack gap-3">
            <h2 className="section__title" style={{ padding: 0 }}>
              Riders
            </h2>
            {riders.map((b) => (
              <RiderRow
                key={b.id}
                b={b}
                live={!!live}
                done={ride.status === 'completed'}
                busy={busy === b.id}
                onStep={(fn, ok) => act(b.id, fn, ok)}
                onChat={() => nav(`/chat/${b.id}`)}
                onRemove={() => setRemoving(b)}
              />
            ))}
          </section>
        )}

        {declined > 0 && <p className="t-sm t-muted">{plural(declined, 'request')} declined</p>}

        {ride.status === 'completed' && (
          <Notice tone="success" icon={<CircleCheck />} title="Ride completed">
            {money(earned)} cost-share from {plural(riders.filter((b) => b.status === 'completed').length, 'rider')}. Thanks for driving the VIT community.
          </Notice>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'start'}
        title="Start this ride?"
        body={`Riders will be told you’re on the way and can track your live location.${pending.length ? ` ${plural(pending.length, 'pending request')} will be declined.` : ''}`}
        confirmLabel="Start ride"
        cancelLabel="Not yet"
        loading={busy === 'confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'complete'}
        title="Complete this ride?"
        body={riders.some((b) => ['driver_arriving', 'driver_arrived'].includes(b.status)) ? 'Some riders weren’t marked as picked up — their seats will be cancelled.' : 'Confirm everyone has been dropped off.'}
        confirmLabel="Complete ride"
        cancelLabel="Not yet"
        loading={busy === 'confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Cancel your ride?"
        body={riders.length ? `${plural(riders.length, 'rider')} will be notified. Refund anyone who already paid you by UPI. Frequent cancellations lower your reliability score.` : 'Your ride will be removed from search.'}
        confirmLabel="Cancel ride"
        destructive
        loading={busy === 'confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing ? firstName(removing.rider.name) : ''} from this ride?`}
        body={`They’ll be notified and their seat freed.${removing?.paymentStatus !== 'unpaid' ? ' Refund their UPI payment directly.' : ''}`}
        confirmLabel="Remove rider"
        destructive
        loading={busy === removing?.id}
        onConfirm={async () => {
          if (!removing) return
          await act(removing.id, () => bookings.cancel(removing.id, 'Driver removed the booking'))
          setRemoving(null)
        }}
        onClose={() => setRemoving(null)}
      />
    </MapScreen>
  )
}

function RiderRow({ b, live, done, busy, onStep, onChat, onRemove }: { b: RiderBooking; live: boolean; done: boolean; busy: boolean; onStep: (fn: () => Promise<unknown>, ok?: string) => void; onChat: () => void; onRemove: () => void }) {
  const name = firstName(b.rider.name)
  const statusBadge =
    b.status === 'accepted' ? (
      <Badge tone="warning">Awaiting payment</Badge>
    ) : b.status === 'driver_arrived' ? (
      <Badge tone="info">Waiting</Badge>
    ) : b.status === 'in_progress' ? (
      <Badge tone="success">In car</Badge>
    ) : b.status === 'completed' ? (
      <Badge icon={<Check />}>Dropped</Badge>
    ) : (
      <Badge tone="success" icon={<Check />}>
        Confirmed
      </Badge>
    )
  return (
    <div className="request-card" style={{ gap: 12 }}>
      <div className="row gap-3">
        <Avatar name={b.rider.name} src={b.rider.photo} size="sm" verified />
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-body t-strong truncate">{b.rider.name}</span>
          <span className="t-sm t-muted truncate">
            {b.pickup.name} → {b.drop.name}
          </span>
        </span>
        {statusBadge}
      </div>
      <div className="row row--between t-sm">
        <span className="t-muted">
          {money(b.fare)} · {paymentLabel(b)}
        </span>
        {(b.paymentStatus === 'unpaid' || b.paymentStatus === 'marked_paid') && b.status !== 'accepted' && (
          <button className="t-strong t-primary" disabled={busy} onClick={() => onStep(() => bookings.paymentReceived(b.id), `Marked ${money(b.fare)} as received`)}>
            Mark received
          </button>
        )}
      </div>
      {!done && b.status !== 'completed' && (
        <div className="row gap-2">
          {b.rider.phone && (
            <a className="btn btn--secondary btn--sm" href={`tel:+91${b.rider.phone}`} aria-label={`Call ${name}`}>
              <span className="btn__label">
                <Phone />
              </span>
            </a>
          )}
          <Button size="sm" variant="secondary" icon={<MessageCircle />} onClick={onChat}>
            Chat
          </Button>
          <span className="grow" />
          {live && b.status === 'driver_arriving' && (
            <Button size="sm" loading={busy} onClick={() => onStep(() => bookings.arrived(b.id))}>
              I’ve arrived
            </Button>
          )}
          {live && b.status === 'driver_arrived' && (
            <Button size="sm" loading={busy} onClick={() => onStep(() => bookings.pickedUp(b.id))}>
              Picked up
            </Button>
          )}
          {live && b.status === 'in_progress' && (
            <Button size="sm" loading={busy} onClick={() => onStep(() => bookings.dropped(b.id), `${name} dropped off`)}>
              Dropped off
            </Button>
          )}
          {!live && ['accepted', 'confirmed'].includes(b.status) && (
            <Button size="sm" variant="ghost" icon={<UserMinus />} onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      )}
      {b.status === 'completed' && !b.driverRating && (
        <div className="row gap-2">
          <span className="t-sm t-muted grow">Rate {name}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className="star-btn" style={{ width: 32, height: 32 }} aria-label={`${n} stars`} disabled={busy} onClick={() => onStep(() => bookings.rate(b.id, n, [], ''), 'Thanks for rating')}>
              <Star style={{ width: 22, height: 22 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({ booking, onAccept, onDecline, busy, full }: { booking: RiderBooking; onAccept: () => void; onDecline: () => void; busy: boolean; full: boolean }) {
  const rider = booking.rider
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
