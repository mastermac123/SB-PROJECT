import { motion } from 'framer-motion'
import { Check, CircleX, Clock, MessageCircle, Navigation, ReceiptText, RefreshCw, Star, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/Sheet'
import { StateView } from '@/components/States'
import { Stops } from '@/components/Stops'
import { TopBar } from '@/components/TopBar'
import { useToast } from '@/components/Toast'
import { Avatar, Badge, Button, Chip, Notice, Plate, Rating, TestModeBadge, VerifiedBadge } from '@/components/ui'
import { dayTime, firstName, money, plural, time } from '@/lib/format'
import type { Booking, BookingStatus } from '@/lib/types'
import { ApiError, bookingById, cancelBooking, me, rideById, startTracking, userById } from '@/services/api'
import { METHOD_LABEL } from '@/services/payments'
import { useDB, type DB } from '@/services/db'
import { useSearch } from '@/state/search'
import { SearchX } from 'lucide-react'

export const BOOKING_STATUS: Record<BookingStatus, { label: string; short: string; tone: 'verified' | 'success' | 'warning' | 'error' | 'info' | undefined }> = {
  pending: { label: 'Waiting for driver', short: 'Requested', tone: 'warning' },
  accepted: { label: 'Accepted · payment due', short: 'Pay now', tone: 'verified' },
  rejected: { label: 'Declined by driver', short: 'Declined', tone: 'error' },
  confirmed: { label: 'Confirmed', short: 'Confirmed', tone: 'success' },
  driver_arriving: { label: 'Driver on the way', short: 'Arriving', tone: 'info' },
  driver_arrived: { label: 'Driver has arrived', short: 'Arrived', tone: 'info' },
  in_progress: { label: 'On the way', short: 'Live', tone: 'success' },
  completed: { label: 'Completed', short: 'Completed', tone: undefined },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'error' },
}

const CANCEL_REASONS = ['My plans changed', 'Found another ride', 'Driver asked me to cancel', 'Pickup is too far', 'Other']

/** Trip summary used by booking, payment and history screens. */
export function TripSummary({ db, booking, showPayment = true }: { db: DB; booking: Booking; showPayment?: boolean }) {
  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const v = driver.vehicle!
  const payment = booking.paymentId ? db.payments.find((p) => p.id === booking.paymentId) : undefined
  return (
    <div className="summary">
      <div className="row gap-3">
        <Avatar name={driver.name} src={driver.photo} size="lg" verified />
        <div className="stack grow gap-1" style={{ minWidth: 0 }}>
          <span className="t-h3 truncate">{driver.name}</span>
          <Rating value={driver.rating} count={driver.ridesOffered} />
        </div>
        <VerifiedBadge short />
      </div>
      <div className="vehicle-row">
        <span className="stack grow">
          <span className="t-body t-strong">
            {v.color} {v.make} {v.model}
          </span>
          <span className="t-sm t-muted">{plural(booking.seats, 'seat')} booked</span>
        </span>
        <Plate>{v.plate}</Plate>
      </div>
      <hr className="divider" />
      <Stops from={{ title: booking.pickup.name, subtitle: booking.pickup.area, time: time(ride.departAt) }} to={{ title: booking.drop.name, subtitle: booking.drop.area }} />
      <div className="row row--between t-sm t-muted">
        <span className="row gap-2">
          <Clock size={15} />
          {dayTime(ride.departAt)}
        </span>
        <span>{booking.matchScore}% AI match</span>
      </div>
      <hr className="divider" />
      <div className="bill">
        <div className="bill__row">
          <span>Ride fare</span>
          <span>{money(booking.fare)}</span>
        </div>
        <div className="bill__row">
          <span>Platform fee</span>
          <span className="t-success">Free</span>
        </div>
        <div className="bill__row bill__row--total">
          <span>Total</span>
          <span>{money(booking.fare)}</span>
        </div>
        {showPayment && payment && (
          <div className="row row--between t-sm t-muted" style={{ marginTop: 4 }}>
            <span>
              {payment.status === 'refunded' ? 'Refunded to wallet' : `Paid via ${METHOD_LABEL[payment.method]}`} · {payment.reference}
            </span>
            {payment.testMode && <TestModeBadge />}
          </div>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   Booking status: requested → accepted → paid → (live) → completed
   ========================================================================== */

export function TripStatus() {
  const { bookingId } = useParams()
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const search = useSearch()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState(CANCEL_REASONS[0])
  const [cancelling, setCancelling] = useState(false)
  const booking = bookingId ? bookingById(bookingId, db) : undefined

  if (!booking || booking.riderId !== u.id) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <StateView icon={<SearchX />} tone="neutral" title="Booking not found" actions={<Button block onClick={() => nav('/rides')}>Go to My Rides</Button>} />
      </div>
    )
  }
  if (['driver_arriving', 'driver_arrived', 'in_progress'].includes(booking.status)) return <Navigate to={`/live/${booking.id}`} replace />

  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const name = firstName(driver.name)

  async function doCancel() {
    setCancelling(true)
    try {
      const r = await cancelBooking(booking!.id, reason)
      setCancelOpen(false)
      toast({ tone: 'success', message: r.refunded ? `Cancelled · ${money(r.refunded)} refunded to wallet` : 'Request cancelled' })
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t cancel' })
    } finally {
      setCancelling(false)
    }
  }

  const findAnother = () => {
    if (search.query) void search.run(search.query)
    nav(search.query ? '/find/results' : '/find')
  }

  const hero = (() => {
    switch (booking.status) {
      case 'pending':
        return (
          <Hero
            mark={
              <div className="radar">
                <span className="radar__ring" />
                <span className="radar__ring" />
                <span className="radar__ring" />
                <Avatar name={driver.name} src={driver.photo} size="xl" />
              </div>
            }
            title="Ride requested"
            body={`Waiting for ${name} to accept. Most drivers respond within a few minutes — we’ll notify you.`}
          />
        )
      case 'accepted':
        return <Hero mark={<SuccessMark />} title="Ride confirmed" body={`${name} accepted your request. Pay now to lock in your seat.`} />
      case 'confirmed':
        return <Hero mark={<SuccessMark />} title="You’re all set" body={`${name} will pick you up at ${booking.pickup.name}, ${dayTime(ride.departAt).toLowerCase()}.`} />
      case 'rejected':
        return <Hero mark={<div className="result-mark result-mark--error"><X /></div>} title={`${name} couldn’t take this ride`} body="This happens when plans change or seats fill up. You haven’t been charged." />
      case 'cancelled':
        return (
          <Hero
            mark={<div className="result-mark result-mark--error"><CircleX /></div>}
            title="Ride cancelled"
            body={booking.cancelledBy === 'driver' ? `${name} cancelled: ${booking.cancelReason ?? 'plans changed'}. Any payment has been refunded to your wallet.` : `You cancelled this ride${booking.cancelReason ? ` · ${booking.cancelReason}` : ''}.`}
          />
        )
      case 'completed':
        return <Hero mark={<div className="result-mark result-mark--brand"><Check /></div>} title="Trip completed" body={`Thanks for riding with ${name}. You saved about 2.4 kg of CO₂.`} />
      default:
        return null
    }
  })()

  const footer = (() => {
    switch (booking.status) {
      case 'pending':
        return (
          <Button size="lg" variant="secondary" block onClick={() => setCancelOpen(true)}>
            Cancel request
          </Button>
        )
      case 'accepted':
        return (
          <Button size="lg" block onClick={() => nav(`/pay/${booking.id}`)}>
            Continue to Payment
          </Button>
        )
      case 'confirmed':
        return (
          <div className="stack gap-2">
            <Button
              size="lg"
              block
              icon={<Navigation />}
              onClick={() => {
                void startTracking(booking.id)
                nav(`/live/${booking.id}`)
              }}
            >
              Track ride
            </Button>
            <div className="row gap-2">
              <Button variant="secondary" block icon={<MessageCircle />} onClick={() => nav(`/chat/${booking.id}`)}>
                Message {name}
              </Button>
              <Button variant="danger-ghost" block onClick={() => setCancelOpen(true)}>
                Cancel ride
              </Button>
            </div>
          </div>
        )
      case 'rejected':
      case 'cancelled':
        return (
          <Button size="lg" block icon={<RefreshCw />} onClick={findAnother}>
            Find another match
          </Button>
        )
      case 'completed':
        return booking.riderRating ? (
          <Button size="lg" variant="secondary" block onClick={() => nav('/rides')}>
            Back to My Rides
          </Button>
        ) : (
          <Button size="lg" block icon={<Star />} onClick={() => nav(`/live/${booking.id}`)}>
            Rate your trip
          </Button>
        )
      default:
        return null
    }
  })()

  return (
    <div className="page">
      <TopBar title={BOOKING_STATUS[booking.status].label} backTo="/rides" actions={<span className="topbar__spacer" />} />
      <div className="page__content page__content--narrow">
        <motion.div key={booking.status} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
          {hero}
        </motion.div>
        {booking.status === 'pending' && (
          <div className="progress progress--indeterminate" style={{ margin: '0 auto 24px', maxWidth: 200 }}>
            <div className="progress__bar" />
          </div>
        )}
        {booking.status === 'accepted' && (
          <div style={{ marginBottom: 16 }}>
            <Notice tone="info" icon={<Clock />}>
              Your seat is held for 15 minutes. Free cancellation until 1 hour before departure.
            </Notice>
          </div>
        )}
        <div className="page__sheet-lite">
          <TripSummary db={db} booking={booking} />
        </div>
        {booking.status === 'completed' && (
          <button type="button" className="row gap-2 t-sm t-strong t-primary" style={{ marginTop: 16 }} onClick={() => toast({ tone: 'info', message: 'Receipt emailed to ' + u.email + ' (test mode)' })}>
            <ReceiptText size={16} /> Email receipt
          </button>
        )}
      </div>
      {footer && <div className="page__footer page__footer--narrow">{footer}</div>}

      <ConfirmDialog
        open={cancelOpen}
        title={booking.status === 'pending' ? 'Cancel this request?' : 'Cancel this ride?'}
        body={
          booking.status === 'confirmed'
            ? `You’ll get ${money(booking.fare)} back in your RideSync Wallet. ${name} will be notified.`
            : `${name} will no longer see your request.`
        }
        confirmLabel={booking.status === 'pending' ? 'Cancel request' : 'Cancel ride'}
        cancelLabel="Keep it"
        destructive
        loading={cancelling}
        onConfirm={doCancel}
        onClose={() => setCancelOpen(false)}
      >
        {booking.status !== 'pending' && (
          <div className="stack gap-2" style={{ marginTop: 12 }}>
            <span className="field__label">Reason</span>
            <div className="row wrap gap-2">
              {CANCEL_REASONS.map((r) => (
                <Chip key={r} size="sm" selected={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function Hero({ mark, title, body }: { mark: React.ReactNode; title: string; body: string }) {
  return (
    <div className="hero">
      {mark}
      <h2 className="t-h1">{title}</h2>
      <p className="t-body t-muted" style={{ maxWidth: 340 }}>
        {body}
      </p>
    </div>
  )
}

export function SuccessMark() {
  return (
    <motion.div className="result-mark" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.35, ease: 'easeOut' }} />
      </svg>
    </motion.div>
  )
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status]
  return <Badge tone={s.tone}>{s.short}</Badge>
}
