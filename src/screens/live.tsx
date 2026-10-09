import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, Phone, Share2, ShieldAlert, Siren, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { MapView } from '@/components/MapView'
import { ModalSheet } from '@/components/Sheet'
import { Stops } from '@/components/Stops'
import { BackButton } from '@/components/TopBar'
import { useToast } from '@/components/Toast'
import { Avatar, Button, Chip, IconButton, ListRow, Plate, Rating, TestModeBadge, cx } from '@/components/ui'
import { useIsDesktop, useNow } from '@/hooks'
import { firstName, money } from '@/lib/format'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import { ApiError, bookingById, livePosition, me, rateTrip, rideById, setLivePhase, startTracking, userById } from '@/services/api'
import { useDB } from '@/services/db'
import { shareLink } from './rideDetails'
import { SuccessMark } from './trip'

// Configure per campus before launch; hidden when not set so we never show an unverified number.
const CAMPUS_SECURITY = import.meta.env.VITE_CAMPUS_SECURITY_PHONE as string | undefined

const RATING_TAGS = ['On time', 'Safe driving', 'Friendly', 'Clean car', 'Easy pickup', 'Good music']

export function LiveRide() {
  const { bookingId } = useParams()
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const padding = useMapPadding(0.44)
  const [sos, setSos] = useState(false)
  const booking = bookingId ? bookingById(bookingId, db) : undefined
  const live = booking && ['driver_arriving', 'driver_arrived', 'in_progress'].includes(booking.status)
  useNow(1000, !!live)

  // Confirmed rides start tracking when opened.
  useEffect(() => {
    if (booking?.status === 'confirmed') void startTracking(booking.id)
  }, [booking?.status, booking?.id])

  const pos = booking ? livePosition(booking, rideById(booking.rideId, db)!) : null

  // Advance phases from the simulated driver timeline.
  useEffect(() => {
    if (!booking || !pos) return
    if (booking.status === 'driver_arriving' && pos.progress >= 1) setLivePhase(booking.id, 'driver_arrived')
    if (booking.status === 'in_progress' && pos.progress >= 1) setLivePhase(booking.id, 'completed')
  })

  if (!booking || booking.riderId !== u.id) return <Navigate to="/rides" replace />
  if (['pending', 'accepted', 'rejected', 'cancelled'].includes(booking.status)) return <Navigate to={`/trip/${booking.id}`} replace />

  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const v = driver.vehicle!
  const name = firstName(driver.name)
  const p = pos!

  const headline =
    booking.status === 'driver_arriving'
      ? { title: `Arriving in ${p.etaMin} min`, sub: `${name} is heading to ${booking.pickup.name}` }
      : booking.status === 'driver_arrived'
        ? { title: `${name} has arrived`, sub: `Look for a ${v.color.toLowerCase()} ${v.model} · ${v.plate}` }
        : booking.status === 'in_progress'
          ? { title: `${p.etaMin} min to ${booking.drop.name}`, sub: 'Enjoy the ride. Your trip is being tracked.' }
          : { title: 'You’ve arrived', sub: `${booking.drop.name}` }

  const share = async () => {
    const r = await shareLink('My RideSync trip', `I’m riding with ${driver.name} (${v.color} ${v.make} ${v.model}, ${v.plate}) from ${booking.pickup.name} to ${booking.drop.name}. Track on RideSync:`)
    if (r === 'copied') toast({ tone: 'success', message: 'Trip link copied — send it to someone you trust' })
  }

  const markers = [
    { id: 'pick', at: booking.pickup, kind: 'pickup' as const, label: booking.status === 'in_progress' || booking.status === 'completed' ? undefined : 'Pickup' },
    { id: 'drop', at: booking.drop, kind: 'drop' as const, label: booking.drop.name },
    ...(booking.status !== 'completed' ? [{ id: 'car', at: p.point, kind: 'car' as const, heading: p.heading }] : []),
  ]
  const routeCoords = p.route.coords
  const fit = booking.status === 'driver_arriving' || booking.status === 'driver_arrived' ? [p.point, booking.pickup] : [booking.pickup, booking.drop]

  if (booking.status === 'completed') return <RateTrip bookingId={booking.id} />

  return (
    <MapScreen
      snaps={[0.44, 0.88]}
      map={<MapView routes={[{ id: 'r', coords: routeCoords, kind: 'primary' }]} markers={markers} fit={fit} padding={padding} follow="car" />}
      top={
        <>
          <BackButton surface to={`/trip/${booking.id}`} />
          <span className="grow" />
          <IconButton label="Share trip" surface onClick={share}>
            <Share2 />
          </IconButton>
        </>
      }
      header={desktop ? <><BackButton to="/home" /><span className="grow t-h3">Your ride</span></> : undefined}
    >
      <div className="stack gap-5">
        <AnimatePresence mode="wait">
          <motion.div key={booking.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="stack gap-1">
            <h1 className="t-h1" aria-live="polite">
              {headline.title}
            </h1>
            <p className="t-body t-muted">{headline.sub}</p>
          </motion.div>
        </AnimatePresence>
        <div className="progress" aria-hidden>
          <div className="progress__bar" style={{ width: `${booking.status === 'driver_arrived' ? 100 : Math.round(p.progress * 100)}%`, background: booking.status === 'in_progress' ? 'var(--success-500)' : undefined }} />
        </div>

        {booking.status === 'driver_arrived' && (
          <Button size="lg" block onClick={() => setLivePhase(booking.id, 'in_progress')}>
            I’m in the car
          </Button>
        )}

        <div className="row gap-3">
          <Avatar name={driver.name} src={driver.photo} size="lg" verified />
          <div className="stack grow gap-1" style={{ minWidth: 0 }}>
            <span className="t-h3 truncate">{driver.name}</span>
            <Rating value={driver.rating} />
            <span className="t-sm t-muted">
              {v.color} {v.make} {v.model}
            </span>
          </div>
          <Plate>{v.plate}</Plate>
        </div>

        <div className="actions-row">
          <a className="action-tile" href={`tel:+91${driver.phone}`}>
            <Phone />
            Call
          </a>
          <button className="action-tile" onClick={() => nav(`/chat/${booking.id}`)}>
            <MessageCircle />
            Chat
          </button>
          <button className="action-tile" onClick={share}>
            <Share2 />
            Share trip
          </button>
          <button className="action-tile action-tile--danger" onClick={() => setSos(true)}>
            <Siren />
            SOS
          </button>
        </div>

        <hr className="divider" />
        <Stops from={{ title: booking.pickup.name, subtitle: booking.pickup.area }} to={{ title: booking.drop.name, subtitle: booking.drop.area }} />
        <div className="row row--between t-sm t-muted">
          <span>Paid {money(booking.fare)}</span>
          <TestModeBadge>Simulated live tracking</TestModeBadge>
        </div>
      </div>

      <ModalSheet open={sos} onClose={() => setSos(false)} title={<span className="row gap-2" style={{ color: 'var(--error-600)' }}><ShieldAlert size={20} /> Emergency</span>}>
        <div className="stack gap-2">
          <p className="t-body t-secondary" style={{ marginBottom: 8 }}>
            Your live location and trip details are shared with whoever you contact here.
          </p>
          <a href="tel:112" className="btn btn--danger btn--lg btn--block">
            <span className="btn__label">
              <Phone /> Call 112 (Emergency)
            </span>
          </a>
          <div className="list" style={{ marginTop: 8 }}>
            {CAMPUS_SECURITY && <ListRow icon={<ShieldAlert />} title="Call campus security" subtitle={CAMPUS_SECURITY} onClick={() => (window.location.href = `tel:${CAMPUS_SECURITY}`)} />}
            <ListRow
              icon={<Share2 />}
              title="Alert emergency contacts"
              subtitle={u.emergencyContacts?.length ? u.emergencyContacts.map((c) => c.name.split(' (')[0]).join(', ') : 'Add contacts in Safety settings'}
              onClick={() => {
                if (!u.emergencyContacts?.length) {
                  nav('/profile/safety')
                  return
                }
                setSos(false)
                toast({ tone: 'success', message: 'Your contacts have been sent your live trip (test mode)' })
              }}
            />
          </div>
        </div>
      </ModalSheet>
    </MapScreen>
  )
}

function RateTrip({ bookingId }: { bookingId: string }) {
  const db = useDB()
  const nav = useNavigate()
  const toast = useToast()
  const booking = bookingById(bookingId, db)!
  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const [stars, setStars] = useState(booking.riderRating ?? 0)
  const [tags, setTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const rated = !!booking.riderRating

  async function submit() {
    setSaving(true)
    try {
      await rateTrip(booking.id, stars, tags, comment)
      toast({ tone: 'success', message: 'Thanks for rating your trip' })
      nav('/home', { replace: true })
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t save rating' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page__content page__content--narrow" style={{ paddingTop: 40 }}>
        <div className="hero">
          <SuccessMark />
          <h1 className="t-h1">You’ve arrived</h1>
          <p className="t-body t-muted">
            {booking.drop.name} · {money(booking.fare)} paid · ~2.4 kg CO₂ saved
          </p>
        </div>
        <div className="stack gap-5" style={{ alignItems: 'center', marginTop: 8 }}>
          <Avatar name={driver.name} src={driver.photo} size="xl" verified />
          <h2 className="t-h3">How was your ride with {firstName(driver.name)}?</h2>
          <div className="row gap-2" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                whileTap={{ scale: 0.85 }}
                className={cx('star-btn', n <= stars && 'is-on')}
                onClick={() => !rated && setStars(n)}
              >
                <Star />
              </motion.button>
            ))}
          </div>
          {stars > 0 && !rated && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="stack gap-4" style={{ width: '100%' }}>
              <div className="row wrap gap-2" style={{ justifyContent: 'center' }}>
                {RATING_TAGS.map((t) => (
                  <Chip key={t} size="sm" selected={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>
                    {t}
                  </Chip>
                ))}
              </div>
              <div className="input-wrap">
                <textarea className="input" placeholder={stars <= 3 ? 'What could have been better?' : 'Anything else? (optional)'} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 84 }} aria-label="Comment" />
              </div>
            </motion.div>
          )}
        </div>
      </div>
      <div className="page__footer page__footer--narrow">
        {rated ? (
          <Button size="lg" block onClick={() => nav('/home')}>
            Done
          </Button>
        ) : (
          <div className="stack gap-2">
            <Button size="lg" block disabled={!stars} loading={saving} onClick={submit}>
              Submit rating
            </Button>
            <Button variant="ghost" block onClick={() => nav('/home')}>
              Skip
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
