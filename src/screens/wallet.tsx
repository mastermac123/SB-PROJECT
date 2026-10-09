import { ArrowDownLeft, ArrowUpRight, Plus, ReceiptText, X } from 'lucide-react'
import { useState } from 'react'
import { ModalSheet } from '@/components/Sheet'
import { StateView } from '@/components/States'
import { useToast } from '@/components/Toast'
import { Button, Chip, Field, TestModeBadge } from '@/components/ui'
import { money, relative } from '@/lib/format'
import { validateUpiId } from '@/lib/validation'
import { Page } from '@/layouts/Page'
import { addMoney, ApiError, me, walletBalance } from '@/services/api'
import { useDB } from '@/services/db'
import { SANDBOX_FAILURE_UPI } from '@/services/payments'

export function Wallet() {
  const db = useDB()
  const u = me(db)!
  const [open, setOpen] = useState(false)
  const balance = walletBalance(u.id, db)
  const txns = db.wallet.filter((t) => t.userId === u.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const month = new Date().getMonth()
  const spent = txns.filter((t) => t.type === 'debit' && new Date(t.createdAt).getMonth() === month).reduce((s, t) => s + t.amount, 0)
  const earned = txns.filter((t) => t.type === 'credit' && t.title === 'Cost share received' && new Date(t.createdAt).getMonth() === month).reduce((s, t) => s + t.amount, 0)

  return (
    <Page title="Wallet" back={false}>
      <div className="stack gap-6">
        <div className="wallet-card">
          <div className="row row--between">
            <span className="t-sm" style={{ opacity: 0.8 }}>
              RideSync Wallet
            </span>
            <TestModeBadge />
          </div>
          <span className="wallet-card__balance tabular">{money(balance)}</span>
          <span className="t-sm" style={{ opacity: 0.8 }}>
            Available balance
          </span>
          <div className="row gap-2" style={{ marginTop: 16 }}>
            <Button variant="secondary" icon={<Plus />} onClick={() => setOpen(true)}>
              Add money
            </Button>
          </div>
        </div>

        <div className="split split--2" style={{ gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="mini-stat">
            <span className="t-sm t-muted">Spent this month</span>
            <span className="t-h2 tabular">{money(spent)}</span>
          </div>
          <div className="mini-stat">
            <span className="t-sm t-muted">Cost-share received</span>
            <span className="t-h2 tabular t-success">{money(earned)}</span>
          </div>
        </div>

        <section className="section">
          <h2 className="section__title">Activity</h2>
          {txns.length === 0 ? (
            <StateView compact icon={<ReceiptText />} tone="neutral" title="No transactions yet" body="Payments, refunds and cost-share you receive will appear here." />
          ) : (
            <div className="list">
              {txns.map((t) => (
                <div key={t.id} className="list-row">
                  <span className="list-row__icon" style={t.type === 'credit' ? { background: 'var(--success-50)', color: 'var(--success-600)' } : undefined}>
                    {t.type === 'credit' ? <ArrowDownLeft /> : <ArrowUpRight />}
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">{t.title}</span>
                    <span className="list-row__sub truncate">
                      {t.subtitle ? `${t.subtitle} · ` : ''}
                      {relative(t.createdAt)}
                    </span>
                  </span>
                  <span className="tabular t-strong" style={{ color: t.type === 'credit' ? 'var(--success-600)' : 'var(--ink-900)' }}>
                    {t.type === 'credit' ? '+' : '−'}
                    {money(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <AddMoney open={open} onClose={() => setOpen(false)} />
    </Page>
  )
}

function AddMoney({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState(500)
  const [upi, setUpi] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    const e = validateUpiId(upi) ?? (amount < 50 || amount > 5000 ? 'Add between ₹50 and ₹5,000' : null)
    setError(e)
    if (e) return
    setLoading(true)
    try {
      await addMoney(amount, { method: 'upi', upiId: upi })
      toast({ tone: 'success', message: `${money(amount)} added to your wallet` })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t add money')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title="Add money"
      footer={
        <Button size="lg" block loading={loading} onClick={submit}>
          Add {money(amount)}
        </Button>
      }
    >
      <div className="stack gap-4">
        <div className="field">
          <label className="field__label" htmlFor="amt">
            Amount
          </label>
          <div className="input-wrap">
            <span className="input-wrap__leading t-h3">₹</span>
            <input id="amt" className="input t-h2" inputMode="numeric" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '').slice(0, 5)))} style={{ fontSize: 24, fontWeight: 700 }} />
          </div>
        </div>
        <div className="row gap-2">
          {[200, 500, 1000].map((a) => (
            <Chip key={a} selected={amount === a} onClick={() => setAmount(a)}>
              {money(a)}
            </Chip>
          ))}
        </div>
        <Field label="Pay from UPI ID" placeholder="yourname@okbank" value={upi} onChange={(e) => setUpi(e.target.value)} hint={`Test mode — no money moves. ${SANDBOX_FAILURE_UPI} simulates a decline.`} />
        {error && (
          <span className="field__error" role="alert">
            <X />
            {error}
          </span>
        )}
      </div>
    </ModalSheet>
  )
}
