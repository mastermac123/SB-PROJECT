import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, CreditCard, Lock, ShieldCheck, Wallet as WalletIcon, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { StateView } from '@/components/States'
import { TopBar } from '@/components/TopBar'
import { Button, Field, Notice, TestModeBadge, cx } from '@/components/ui'
import { firstName, money } from '@/lib/format'
import type { PaymentMethodKind } from '@/lib/types'
import { luhn, validateUpiId } from '@/lib/validation'
import { ApiError, bookingById, me, pay, rideById, userById, walletBalance } from '@/services/api'
import { useDB } from '@/services/db'
import { SANDBOX_FAILURE_CARD, SANDBOX_FAILURE_UPI, SANDBOX_SUCCESS_CARD, type ChargeDetails } from '@/services/payments'
import { SuccessMark } from './trip'

const UPI_APPS: { id: PaymentMethodKind; name: string; mono: string; color: string }[] = [
  { id: 'gpay', name: 'Google Pay', mono: 'GP', color: '#eef3fe' },
  { id: 'phonepe', name: 'PhonePe', mono: 'Pe', color: '#f3eefe' },
  { id: 'paytm', name: 'Paytm', mono: 'Pt', color: '#eaf6fd' },
]

type Phase = { kind: 'form' } | { kind: 'processing' } | { kind: 'success'; reference: string } | { kind: 'failed'; reason: string; retryable: boolean }

export function Payment() {
  const { bookingId } = useParams()
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const booking = bookingId ? bookingById(bookingId, db) : undefined
  const balance = walletBalance(u.id, db)
  const [method, setMethod] = useState<PaymentMethodKind>(balance >= (booking?.fare ?? 0) ? 'wallet' : 'gpay')
  const [upiId, setUpiId] = useState('')
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: u.name })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })

  if (!booking || booking.riderId !== u.id) return <Navigate to="/rides" replace />
  if (phase.kind === 'form' && booking.status !== 'accepted') return <Navigate to={`/trip/${booking.id}`} replace />

  const ride = rideById(booking.rideId, db)!
  const driver = userById(ride.driverId, db)!
  const walletShort = balance < booking.fare

  function details(): ChargeDetails | null {
    if (method === 'upi') {
      const e = validateUpiId(upiId)
      setErrors({ upi: e })
      return e ? null : { method: 'upi', upiId: upiId.trim() }
    }
    if (method === 'card') {
      const errs = {
        number: luhn(card.number) ? null : 'Enter a valid card number',
        expiry: validExpiry(card.expiry) ? null : 'Use MM/YY, not expired',
        cvv: /^\d{3,4}$/.test(card.cvv) ? null : '3 or 4 digits',
      }
      setErrors(errs)
      return Object.values(errs).some(Boolean) ? null : { method: 'card', ...card }
    }
    if (method === 'wallet') return { method: 'wallet', balance }
    return { method } as ChargeDetails
  }

  async function submit() {
    const d = details()
    if (!d) return
    setPhase({ kind: 'processing' })
    try {
      const res = await pay(booking!.id, method, d)
      setPhase({ kind: 'success', reference: res.reference })
    } catch (e) {
      if (e instanceof ApiError) setPhase({ kind: 'failed', reason: e.message, retryable: e.code === 'network' || e.field === 'retryable' })
      else setPhase({ kind: 'failed', reason: 'Something went wrong. You haven’t been charged.', retryable: true })
    }
  }

  if (phase.kind === 'processing') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="hero" role="status" aria-live="polite">
          <div className="result-mark result-mark--pending">
            <span className="btn__spinner" style={{ position: 'static', width: 36, height: 36, borderWidth: 3, color: 'var(--primary-600)' }} />
          </div>
          <h1 className="t-h2">Processing payment</h1>
          <p className="t-body t-muted">Waiting for confirmation{method === 'gpay' || method === 'phonepe' || method === 'paytm' ? ` from ${UPI_APPS.find((a) => a.id === method)!.name}` : ''}. Please don’t close this page.</p>
          <TestModeBadge>Test mode · no money moves</TestModeBadge>
        </div>
      </div>
    )
  }

  if (phase.kind === 'success') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="page__content page__content--narrow" style={{ flex: 'none' }}>
          <div className="hero">
            <SuccessMark />
            <h1 className="t-h1">Payment successful</h1>
            <p className="t-body t-muted">
              {money(booking.fare)} paid. Your seat with {firstName(driver.name)} is confirmed.
            </p>
            <div className="receipt-line">
              <span>Reference</span>
              <span className="tabular">{phase.reference}</span>
            </div>
            <TestModeBadge>Test transaction · not a real charge</TestModeBadge>
          </div>
          <div className="stack gap-2" style={{ marginTop: 24 }}>
            <Button size="lg" block onClick={() => nav(`/trip/${booking.id}`, { replace: true })}>
              View trip
            </Button>
            <Button size="lg" variant="ghost" block onClick={() => nav(`/chat/${booking.id}`)}>
              Message {firstName(driver.name)}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (phase.kind === 'failed') {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <div className="page__content page__content--narrow" style={{ flex: 'none' }}>
          <StateView
            tone="error"
            icon={<X />}
            title="Payment failed"
            body={
              <>
                {phase.reason}
                <br />
                <strong style={{ color: 'var(--ink-900)' }}>You haven’t been charged.</strong>
              </>
            }
            actions={
              <>
                {phase.retryable && (
                  <Button size="lg" block onClick={submit}>
                    Try again
                  </Button>
                )}
                <Button size="lg" variant={phase.retryable ? 'ghost' : 'primary'} block onClick={() => setPhase({ kind: 'form' })}>
                  Choose another method
                </Button>
              </>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar title="Payment" backTo={`/trip/${booking.id}`} actions={<span className="topbar__spacer" />} />
      <div className="page__content page__content--narrow">
        <div className="stack gap-6">
          <div className="pay-summary">
            <div className="stack">
              <span className="t-sm t-muted">
                Ride with {driver.name} · {booking.pickup.name} → {booking.drop.name}
              </span>
            </div>
            <div className="bill" style={{ marginTop: 12 }}>
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
            </div>
          </div>

          <section className="stack gap-3">
            <div className="row row--between">
              <h2 className="section__title" style={{ padding: 0 }}>
                Pay with UPI
              </h2>
              <TestModeBadge />
            </div>
            <div className="stack gap-2" role="radiogroup" aria-label="Payment method">
              {UPI_APPS.map((a) => (
                <MethodOption key={a.id} selected={method === a.id} onSelect={() => setMethod(a.id)} logo={<span style={{ background: a.color, width: '100%', height: '100%', display: 'grid', placeItems: 'center', borderRadius: 10 }}>{a.mono}</span>} title={a.name} subtitle="Opens your UPI app to approve" />
              ))}
              <MethodOption selected={method === 'upi'} onSelect={() => setMethod('upi')} logo={<AtSign />} title="UPI ID" subtitle="Pay with any UPI app" />
              <AnimatePresence initial={false}>
                {method === 'upi' && (
                  <Expand>
                    <Field label="UPI ID" placeholder="yourname@okbank" value={upiId} onChange={(e) => setUpiId(e.target.value)} error={errors.upi} autoComplete="off" hint={`Test: any valid ID succeeds; ${SANDBOX_FAILURE_UPI} simulates a decline.`} />
                  </Expand>
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="stack gap-3">
            <h2 className="section__title" style={{ padding: 0 }}>
              Other methods
            </h2>
            <div className="stack gap-2">
              <MethodOption
                selected={method === 'wallet'}
                onSelect={() => setMethod('wallet')}
                logo={<WalletIcon />}
                title="RideSync Wallet"
                subtitle={walletShort ? `Balance ${money(balance)} · not enough for this ride` : `Balance ${money(balance)}`}
                disabled={walletShort}
              />
              <MethodOption selected={method === 'card'} onSelect={() => setMethod('card')} logo={<CreditCard />} title="Credit / Debit card" subtitle="Visa, Mastercard, RuPay" />
              <AnimatePresence initial={false}>
                {method === 'card' && (
                  <Expand>
                    <div className="stack gap-3">
                      <Field label="Card number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={card.number} onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })} error={errors.number} leading={<CreditCard />} />
                      <div className="split split--2" style={{ gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <Field label="Expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} error={errors.expiry} />
                        <Field label="CVV" inputMode="numeric" autoComplete="cc-csc" placeholder="123" type="password" maxLength={4} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') })} error={errors.cvv} />
                      </div>
                      <span className="field__hint">
                        Test cards: {SANDBOX_SUCCESS_CARD} succeeds · {SANDBOX_FAILURE_CARD} is declined.
                      </span>
                    </div>
                  </Expand>
                )}
              </AnimatePresence>
            </div>
          </section>

          <Notice icon={<ShieldCheck />}>
            Sandbox payments: nothing is charged. Live payments will be processed by a licensed payment gateway — RideSync never stores your card or UPI PIN.
          </Notice>
        </div>
      </div>
      <div className="page__footer page__footer--narrow">
        <Button size="lg" block icon={<Lock />} onClick={submit}>
          Pay {money(booking.fare)}
        </Button>
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

function Expand({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '8px 2px 12px' }}>{children}</div>
    </motion.div>
  )
}

const formatCard = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}
function validExpiry(v: string) {
  const m = v.match(/^(\d{2})\/(\d{2})$/)
  if (!m) return false
  const mm = Number(m[1])
  const yy = Number(m[2]) + 2000
  if (mm < 1 || mm > 12) return false
  const end = new Date(yy, mm, 0, 23, 59)
  return end.getTime() > Date.now()
}
