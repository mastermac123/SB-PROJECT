import { ArrowDownLeft, ArrowUpRight, AtSign, FlaskConical, Plus, ReceiptText, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NetworkError, StateView } from '@/components/States'
import { ModalSheet } from '@/components/Sheet'
import { useCelebrate } from '@/components/Celebrate'
import { Badge, Button, Chip, Field, Notice, RideCardSkeleton } from '@/components/ui'
import { openCheckout } from '@/lib/razorpay'
import { money, relative } from '@/lib/format'
import { Page } from '@/layouts/Page'
import { ApiError, Q, useMe, useQuery, wallet, type PaymentRecord, type WalletInfo } from '@/services/api'

const STATUS: Record<PaymentRecord['status'], { label: string; tone?: 'success' | 'warning' }> = {
  unpaid: { label: 'Cash due', tone: 'warning' },
  marked_paid: { label: 'Paid · unconfirmed' },
  received: { label: 'Received', tone: 'success' },
  paid_online: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded' },
}

export function Wallet() {
  const { user } = useMe()
  const nav = useNavigate()
  const q = useQuery<PaymentRecord[]>(Q.payments)
  const w = useQuery<WalletInfo>(Q.wallet)
  const [adding, setAdding] = useState(false)
  const list = q.data ?? []
  const month = new Date().getMonth()
  const thisMonth = list.filter((p) => new Date(p.at).getMonth() === month)
  const spent = thisMonth.filter((p) => p.direction === 'paid' && p.status !== 'unpaid' && p.status !== 'refunded').reduce((s, p) => s + p.amount, 0)
  const received = thisMonth.filter((p) => p.direction === 'received' && (p.status === 'received' || p.status === 'paid_online')).reduce((s, p) => s + p.amount, 0)
  const toCollect = list.filter((p) => p.direction === 'received' && (p.status === 'unpaid' || p.status === 'marked_paid')).reduce((s, p) => s + p.amount, 0)

  return (
    <Page title="Wallet" back={false}>
      <div className="stack gap-6">
        <div className="wallet-card">
          <span className="t-sm" style={{ opacity: 0.8 }}>
            RideSync Wallet balance{w.data?.testMode ? ' · test mode' : ''}
          </span>
          <span className="wallet-card__balance tabular">{w.data ? money(w.data.balance) : '—'}</span>
          <span className="t-sm" style={{ opacity: 0.8 }}>
            Pay for rides in one tap · cancelled rides are refunded here instantly
          </span>
          <div className="row gap-2" style={{ marginTop: 16 }}>
            <Button variant="secondary" icon={<Plus />} disabled={!w.data?.canTopUp} onClick={() => setAdding(true)}>
              Add money
            </Button>
          </div>
        </div>
        {w.data && !w.data.canTopUp && (
          <Notice tone="info">Adding money needs Razorpay keys on the server. Run setup and add your Razorpay test keys.</Notice>
        )}
        {w.data && w.data.transactions.length > 0 && (
          <section className="section">
            <h2 className="section__title">Wallet activity</h2>
            <div className="list">
              {w.data.transactions.map((t) => (
                <button key={t.id} className="list-row" onClick={() => t.bookingId && nav(`/trip/${t.bookingId}`)}>
                  <span className="list-row__icon" style={t.amount > 0 ? { background: 'var(--success-50)', color: 'var(--success-600)' } : undefined}>
                    {t.kind === 'topup' ? <Plus /> : t.kind === 'refund' ? <RotateCcw /> : t.amount > 0 ? <ArrowDownLeft /> : <ArrowUpRight />}
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">{t.note}</span>
                    <span className="list-row__sub">{relative(t.createdAt)}</span>
                  </span>
                  <span className="tabular t-strong" style={{ color: t.amount > 0 ? 'var(--success-600)' : 'var(--ink-900)' }}>
                    {t.amount > 0 ? '+' : '−'}
                    {money(Math.abs(t.amount))}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <AddMoney open={adding} testMode={!!w.data?.testMode} onClose={() => setAdding(false)} onDone={() => void w.reload()} />
        {user?.commute === 'rider' ? (
          <div className="wallet-card wallet-card--light">
            <span className="t-sm" style={{ opacity: 0.8 }}>
              Spent on rides this month
            </span>
            <span className="wallet-card__balance tabular">{money(spent)}</span>
            <span className="t-sm" style={{ opacity: 0.8 }}>
              Wallet, online, UPI and cash payments for rides
            </span>
          </div>
        ) : (
          <div className="wallet-card wallet-card--light">
            <span className="t-sm" style={{ opacity: 0.8 }}>
              Cost-share received this month
            </span>
            <span className="wallet-card__balance tabular">{money(received)}</span>
            <span className="t-sm" style={{ opacity: 0.8 }}>
              {toCollect > 0 ? `${money(toCollect)} still to confirm or collect` : 'Paid directly to you by UPI or cash'}
            </span>
            <div className="row gap-2" style={{ marginTop: 16 }}>
              <Button variant="secondary" icon={<AtSign />} onClick={() => nav('/profile/payments')}>
                {user?.upiId ? user.upiId : 'Add UPI ID'}
              </Button>
            </div>
          </div>
        )}

        <div className="split split--2" style={{ gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="mini-stat">
            <span className="t-sm t-muted">Spent this month</span>
            <span className="t-h2 tabular">{money(spent)}</span>
          </div>
          <div className="mini-stat">
            <span className="t-sm t-muted">To collect</span>
            <span className="t-h2 tabular">{money(toCollect)}</span>
          </div>
        </div>

        <section className="section">
          <h2 className="section__title">Activity</h2>
          {q.loading ? (
            <RideCardSkeleton />
          ) : q.error && !q.data ? (
            <NetworkError onRetry={q.reload} />
          ) : list.length === 0 ? (
            <StateView compact icon={<ReceiptText />} tone="neutral" title="No payments yet" body="Cost-share you pay or receive for rides will appear here." />
          ) : (
            <div className="list">
              {list.map((p) => (
                <button key={p.bookingId} className="list-row" onClick={() => nav(`/trip/${p.bookingId}`)}>
                  <span className="list-row__icon" style={p.direction === 'received' ? { background: 'var(--success-50)', color: 'var(--success-600)' } : undefined}>
                    {p.direction === 'received' ? <ArrowDownLeft /> : <ArrowUpRight />}
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">{p.direction === 'received' ? `From ${p.counterparty}` : `To ${p.counterparty}`}</span>
                    <span className="list-row__sub truncate">
                      {p.route} · {p.method === 'upi' ? 'UPI' : p.method === 'online' ? 'Online' : p.method === 'wallet' ? 'Wallet' : 'Cash'} · {relative(p.at)}
                    </span>
                  </span>
                  <span className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <span className="tabular t-strong" style={{ color: p.direction === 'received' ? 'var(--success-600)' : 'var(--ink-900)' }}>
                      {p.direction === 'received' ? '+' : '−'}
                      {money(p.amount)}
                    </span>
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <p className="t-caption t-muted" style={{ fontWeight: 400 }}>
          Riders pay from the RideSync Wallet, online through Razorpay, or directly to drivers by UPI or cash. Wallet and online payments for cancelled rides are refunded automatically.
        </p>
      </div>
    </Page>
  )
}

const AMOUNTS = [100, 200, 500, 1000]

function AddMoney({ open, testMode, onClose, onDone }: { open: boolean; testMode: boolean; onClose: () => void; onDone: () => void }) {
  const celebrate = useCelebrate()
  const [amount, setAmount] = useState('200')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(amount)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      const r = await openCheckout(await wallet.topUpOrder(n))
      if (!r) return
      const res = await wallet.verifyTopUp(r)
      celebrate({ kind: 'confirmed', title: `${money(n)} added`, body: `Your RideSync Wallet balance is now ${money(res.balance)}.` })
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Couldn’t add money.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalSheet open={open} onClose={onClose} title="Add money">
      <div className="stack gap-4">
        <Field label="Amount (₹)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))} hint="₹10 – ₹5,000 at a time" />
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          {AMOUNTS.map((a) => (
            <Chip key={a} selected={n === a} onClick={() => setAmount(String(a))}>
              {money(a)}
            </Chip>
          ))}
        </div>
        {testMode && (
          <Notice tone="warning" icon={<FlaskConical />} title="Razorpay test mode">
            No real money moves. Use UPI ID <strong>success@razorpay</strong> or card <strong>4111 1111 1111 1111</strong> (any future expiry, any CVV).
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <Button size="lg" block loading={busy} disabled={!(n >= 10 && n <= 5000)} onClick={add}>
          Add {n >= 10 ? money(n) : 'money'}
        </Button>
      </div>
    </ModalSheet>
  )
}
