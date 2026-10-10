import { BadgeCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useToast } from '@/components/Toast'
import { Button, Chip } from '@/components/ui'
import { relative } from '@/lib/format'
import { ApiError, admin, type IdCardReview } from '@/services/api'

const REASONS = ['Photo not clear', 'Name doesn’t match profile', 'Not a VIT ID card', 'Student ID doesn’t match']

/** Old address — the ID checks now live in the admin dashboard. */
export function AdminVerify() {
  return <Navigate to="/admin/ids" replace />
}

export function Review({ c, onDone }: { c: IdCardReview; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState(REASONS[0])
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  async function decide(approve: boolean) {
    setBusy(approve ? 'yes' : 'no')
    try {
      await admin.review(c.userId, approve, approve ? undefined : reason)
      toast({ tone: 'success', message: approve ? `${c.name} is now verified` : `${c.name} asked to upload again` })
      onDone()
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t save' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="id-review">
      <div className="stack gap-1">
        <span className="t-body t-strong">{c.name}</span>
        <span className="t-sm t-muted">
          {c.studentId} · {c.email}
          {c.programme ? ` · ${c.programme}` : ''} · sent {relative(c.submittedAt).toLowerCase()}
        </span>
      </div>
      <img src={c.image} alt={`ID card uploaded by ${c.name}`} />
      <div className="ocr-checks" aria-label="AI check">
        <span className="t-sm t-strong">AI check (OCR)</span>
        {!c.ocr ? (
          <span className="t-sm t-muted">Reading the card…</span>
        ) : c.ocr.status === 'failed' ? (
          <span className="t-sm t-muted">Couldn’t read this photo — check by eye.</span>
        ) : (
          <>
            <span className={`ocr-check ${c.ocr.nameMatch ? 'is-ok' : 'is-bad'}`}>{c.ocr.nameMatch ? '✓' : '✗'} Name on card {c.ocr.nameMatch ? 'matches' : 'doesn’t match'} “{c.name}”</span>
            <span className={`ocr-check ${c.ocr.idMatch ? 'is-ok' : 'is-bad'}`}>{c.ocr.idMatch ? '✓' : '✗'} Student ID {c.ocr.idMatch ? 'found' : 'not found'} ({c.studentId})</span>
            <span className="t-caption t-muted" style={{ fontWeight: 400 }}>
              Read with {c.ocr.confidence}% confidence: “{c.ocr.text.slice(0, 120)}{c.ocr.text.length > 120 ? '…' : ''}”
            </span>
          </>
        )}
      </div>
      <span className="t-sm t-muted">Check the name, photo and student ID match the profile above.</span>
      <div className="row wrap gap-2">
        {REASONS.map((r) => (
          <Chip key={r} size="sm" selected={reason === r} onClick={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </div>
      <div className="row gap-2">
        <Button variant="danger-ghost" icon={<X />} loading={busy === 'no'} disabled={!!busy} onClick={() => decide(false)}>
          Reject
        </Button>
        <span className="grow" />
        <Button icon={<BadgeCheck />} loading={busy === 'yes'} disabled={!!busy} onClick={() => decide(true)}>
          Approve
        </Button>
      </div>
    </div>
  )
}
