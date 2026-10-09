import { ArrowDownLeft, ArrowUpRight, AtSign, ReceiptText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NetworkError, StateView } from '@/components/States'
import { Badge, Button, RideCardSkeleton } from '@/components/ui'
import { money, relative } from '@/lib/format'
import { Page } from '@/layouts/Page'
import { Q, useMe, useQuery, type PaymentRecord } from '@/services/api'

const STATUS: Record<PaymentRecord['status'], { label: string; tone?: 'success' | 'warning' }> = {
  unpaid: { label: 'Cash due', tone: 'warning' },
  marked_paid: { label: 'Paid · unconfirmed' },
  received: { label: 'Received', tone: 'success' },
  paid_online: { label: 'Paid online', tone: 'success' },
  refunded: { label: 'Refunded' },
}

export function Wallet() {
  const { user } = useMe()
  const nav = useNavigate()
  const q = useQuery<PaymentRecord[]>(Q.payments)
  const list = q.data ?? []
  const month = new Date().getMonth()
  const thisMonth = list.filter((p) => new Date(p.at).getMonth() === month)
  const spent = thisMonth.filter((p) => p.direction === 'paid' && p.status !== 'unpaid' && p.status !== 'refunded').reduce((s, p) => s + p.amount, 0)
  const received = thisMonth.filter((p) => p.direction === 'received' && (p.status === 'received' || p.status === 'paid_online')).reduce((s, p) => s + p.amount, 0)
  const toCollect = list.filter((p) => p.direction === 'received' && (p.status === 'unpaid' || p.status === 'marked_paid')).reduce((s, p) => s + p.amount, 0)

  return (
    <Page title="Wallet" back={false}>
      <div className="stack gap-6">
        {user?.commute === 'rider' ? (
          <div className="wallet-card">
            <span className="t-sm" style={{ opacity: 0.8 }}>
              Spent on rides this month
            </span>
            <span className="wallet-card__balance tabular">{money(spent)}</span>
            <span className="t-sm" style={{ opacity: 0.8 }}>
              Paid directly to drivers by UPI or cash
            </span>
          </div>
        ) : (
          <div className="wallet-card">
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
                      {p.route} · {p.method === 'upi' ? 'UPI' : p.method === 'online' ? 'Online' : 'Cash'} · {relative(p.at)}
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
          Riders pay drivers directly by UPI or cash, or online through Razorpay. Online payments for cancelled rides are refunded automatically.
        </p>
      </div>
    </Page>
  )
}
