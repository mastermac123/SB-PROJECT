import { AnimatePresence, motion } from 'framer-motion'
import { Banknote, CreditCard, Copy, ExternalLink, FlaskConical, Lock, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { StateView } from '@/components/States'
import { TopBar } from '@/components/TopBar'
import { useToast } from '@/components/Toast'
import { Button, Field, Notice, RideCardSkeleton, cx } from '@/components/ui'
import { useIsDesktop } from '@/hooks'
import { firstName, money } from '@/lib/format'
import { ApiError, Q, bookings, payOnline, useConfig, useQuery, type BookingDetail } from '@/services/api'
import { SuccessMark } from './trip'

/**
 * Three ways to pay the cost-share:
 *   online — Razorpay Checkout (UPI, cards, netbanking); verified on the server, auto-refunded on cancellation
 *   upi    — straight to the driver's UPI ID (deep link on phones, QR on desktop)
 *   cash   — at pickup
 */

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void }
declare global {
  interface Window {
    Razorpay?: RazorpayCtor
  }
}

let checkoutJs: Promise<void> | null = null
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  checkoutJs ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => {
      checkoutJs = null
      reject(new Error('Couldn’t load the payment window. Check your connection.'))
    }
    document.body.appendChild(s)
  })
  return checkoutJs
}
export function upiLink(pa: string, pn: string, amount: number, note: string) {
  const p = new URLSearchParams({ pa, pn, am: amount.toFixed(2), cu: 'INR', tn: note.slice(0, 60) })
  return `upi://pay?${p.toString().replace(/\+/g, '%20')}`
}

export function Payment() {
  const { bookingId } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const q = useQuery<BookingDetail>(bookingId ? Q.booking(bookingId) : null)
  const config = useConfig()
  const rzpKey = config.data?.razorpayKeyId ?? null
  const [method, setMethod] = useState<'online' | 'upi' | 'cash' | null>(null)
  const [opened, setOpened] = useState(false)
  const [ref, setRef] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<'online' | 'upi' | 'cash' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const d = q.data
  const link = d?.driverUpiId ? upiLink(d.driverUpiId, d.driver.name, d.booking.fare, `RideSync ${d.booking.pickup.name} to ${d.booking.drop.name}`) : null

  useEffect(() => {
    // Wait for the server config so "Pay online" is the default when the gateway is set up.
    if (d && config.data && method === null) setMethod(rzpKey ? 'online' : d.driverUpiId ? 'upi' : 'cash')
  }, [d, method, rzpKey, config.data])
  useEffect(() => {
    if (link && desktop) QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#15182E', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(null))
  }, [link, desktop])

  if (q.loading)
    return (
      <div className="page">
        <div className="page__content page__content--narrow" style={{ paddingTop: 40 }}>
          <RideCardSkeleton />
        </div>
      </div>
    )
  if (!d) return <Navigate to="/rides" replace />
  const { booking, driver } = d
  const name = firstName(driver.name)
  const canPay = booking.status === 'accepted' || (booking.paymentMethod === 'cash' && booking.paymentStatus === 'unpaid' && ['confirmed', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed'].includes(booking.status))
  if (d.role !== 'rider' || (!canPay && !done)) return <Navigate to={`/trip/${booking.id}`} replace />

  async function confirm(m: 'upi' | 'cash') {
    setSaving(true)
    setError(null)
    try {
      await bookings.pay(booking.id, m, m === 'upi' ? ref.trim() || undefined : undefined)
      setDone(m)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t confirm. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function payWithGateway() {
    setSaving(true)
    setError(null)
    try {
      const order = await payOnline.createOrder(booking.id)
      await loadCheckout()
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'RideSync AI',
        description: order.description,
        image: `${window.location.origin}/apple-touch-icon.png`,
        prefill: order.prefill,
        theme: { color: '#5038E6' },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await payOnline.verify(booking.id, resp)
            setDone('online')
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'We couldn’t confirm the payment. If money was taken it will be refunded.')
          } finally {
            setSaving(false)
          }
        },
        modal: { ondismiss: () => setSaving(false) },
      })
      rzp.on('payment.failed', (r) => {
        setError(`Payment failed: ${r.error?.description ?? 'please try again'}. You haven’t been charged.`)
        setSaving(false)
      })
      rzp.open()
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Couldn’t start the payment.')
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="page__content page__content--narrow" style={{ flex: 'none' }}>
          <div className="hero">
            <SuccessMark />
            <h1 className="t-h1">Seat confirmed</h1>
            <p className="t-body t-muted">
              {done === 'online' ? `${money(booking.fare)} paid online. ${name} has been notified.` : done === 'upi' ? `${name} has been told you paid ${money(booking.fare)} by UPI.` : `Pay ${name} ${money(booking.fare)} in cash at pickup.`}
            </p>
          </div>
          <div className="stack gap-2" style={{ marginTop: 16 }}>
            <Button size="lg" block onClick={() => nav(`/trip/${booking.id}`, { replace: true })}>
              View trip
            </Button>
            <Button size="lg" variant="ghost" block onClick={() => nav(`/chat/${booking.id}`)}>
              Message {name}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (booking.status === 'cancelled' || booking.status === 'rejected')
    return <StateView icon={<Banknote />} tone="neutral" title="This booking is no longer active" actions={<Button block onClick={() => nav('/rides')}>My Rides</Button>} />

  return (
    <div className="page">
      <TopBar title="Payment" backTo={`/trip/${booking.id}`} actions={<span className="topbar__spacer" />} />
      <div className="page__content page__content--narrow">
        <div className="stack gap-6">
          <div className="pay-summary">
            <span className="t-sm t-muted">
              Ride with {driver.name} · {booking.pickup.name} → {booking.drop.name}
            </span>
            <div className="bill" style={{ marginTop: 12 }}>
              <div className="bill__row">
                <span>Cost share</span>
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
            </div>
          </div>

          <div className="stack gap-2" role="radiogroup" aria-label="Payment method">
            {rzpKey && (
              <MethodOption
                selected={method === 'online'}
                onSelect={() => setMethod('online')}
                logo={<CreditCard />}
                title="Pay online"
                subtitle="UPI, cards, netbanking · secured by Razorpay · auto-refund if cancelled"
              />
            )}
            {rzpKey?.startsWith('rzp_test_') && method === 'online' && (
              <Notice tone="warning" icon={<FlaskConical />} title="Razorpay test mode">
                No real money moves. Use UPI ID <strong>success@razorpay</strong> or card <strong>4111 1111 1111 1111</strong> (any future expiry, any CVV).
              </Notice>
            )}
            <MethodOption
              selected={method === 'upi'}
              disabled={!d.driverUpiId}
              onSelect={() => setMethod('upi')}
              logo={<Smartphone />}
              title="UPI to driver"
              subtitle={d.driverUpiId ? `Google Pay, PhonePe, Paytm or any UPI app · to ${d.driverUpiId}` : `${name} hasn’t added a UPI ID yet`}
            />
            <AnimatePresence initial={false}>
              {method === 'upi' && link && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                  <div className="stack gap-4" style={{ padding: '12px 2px 8px' }}>
                    {desktop ? (
                      <div className="upi-qr">
                        {qr ? <img src={qr} alt={`UPI QR code to pay ${money(booking.fare)} to ${driver.name}`} width={200} height={200} /> : <div className="skel" style={{ width: 200, height: 200 }} />}
                        <span className="t-sm t-muted t-center">Scan with any UPI app on your phone</span>
                      </div>
                    ) : (
                      <a className="btn btn--dark btn--lg btn--block" href={link} onClick={() => setOpened(true)}>
                        <span className="btn__label">
                          <ExternalLink /> Pay {money(booking.fare)} in UPI app
                        </span>
                      </a>
                    )}
                    <div className="row gap-2 upi-id">
                      <span className="t-sm grow truncate">
                        UPI ID <strong>{d.driverUpiId}</strong>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy />}
                        onClick={() => {
                          void navigator.clipboard?.writeText(d.driverUpiId!)
                          toast({ tone: 'success', message: 'UPI ID copied' })
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <Field label="UPI reference / UTR (optional)" inputMode="numeric" placeholder="12-digit number from your UPI app" value={ref} onChange={(e) => setRef(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 30))} hint="Helps the driver find your payment." />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <MethodOption selected={method === 'cash'} onSelect={() => setMethod('cash')} logo={<Banknote />} title="Cash at pickup" subtitle={`Pay ${name} when you get in`} />
          </div>

          {error && <Notice tone="error">{error}</Notice>}
          <p className="t-caption t-muted" style={{ fontWeight: 400 }}>
            Online payments are verified by RideSync and refunded automatically if the ride is cancelled. UPI and cash go straight to {name}, who refunds you directly if needed.
          </p>
        </div>
      </div>
      <div className="page__footer page__footer--narrow">
        {method === 'online' ? (
          <Button size="lg" block icon={<Lock />} loading={saving} onClick={payWithGateway}>
            Pay {money(booking.fare)}
          </Button>
        ) : method === 'upi' ? (
          <Button size="lg" block loading={saving} onClick={() => confirm('upi')}>
            {opened || desktop ? `I’ve paid ${money(booking.fare)}` : `I’ve paid ${money(booking.fare)} by UPI`}
          </Button>
        ) : (
          <Button size="lg" block loading={saving} onClick={() => confirm('cash')}>
            Confirm seat · pay cash
          </Button>
        )}
      </div>
    </div>
  )
}

function MethodOption({ selected, onSelect, logo, title, subtitle, disabled }: { selected: boolean; onSelect: () => void; logo: React.ReactNode; title: string; subtitle?: string; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} className={cx('pay-option', selected && 'is-selected')} onClick={onSelect} style={disabled ? { opacity: 0.55 } : undefined}>
      <span className="pay-option__logo">{logo}</span>
      <span className="pay-option__body">
        <span className="pay-option__title" style={{ display: 'block' }}>
          {title}
        </span>
        {subtitle && <span className="pay-option__sub">{subtitle}</span>}
      </span>
      <span className={cx('radio', selected && 'is-checked')} aria-hidden />
    </button>
  )
}
