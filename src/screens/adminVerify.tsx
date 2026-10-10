import { BadgeCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { NetworkError, StateView } from '@/components/States'
import { useToast } from '@/components/Toast'
import { Button, Chip, RideCardSkeleton } from '@/components/ui'
import { relative } from '@/lib/format'
import { Page } from '@/layouts/Page'
import { ApiError, Q, admin, useMe, useQuery, type IdCardReview } from '@/services/api'

const REASONS = ['Photo not clear', 'Name doesn’t match profile', 'Not a VIT ID card', 'Student ID doesn’t match']

/** Admins (ADMIN_EMAILS) check uploaded VIT ID cards and grant the Verified badge. */
export function AdminVerify() {
  const { user } = useMe()
  const q = useQuery<IdCardReview[]>(user?.isAdmin ? Q.idCards : null)
  if (!user?.isAdmin) return <Navigate to="/profile" replace />
  return (
    <Page title="Verify student IDs">
      <div className="stack gap-4">
        {q.loading ? (
          <RideCardSkeleton />
        ) : q.error && !q.data ? (
          <NetworkError onRetry={q.reload} />
        ) : !q.data?.length ? (
          <StateView icon={<BadgeCheck />} tone="neutral" title="All caught up" body="New ID cards will appear here, and you’ll get a notification." />
        ) : (
          q.data.map((c) => <Review key={c.userId} c={c} onDone={q.reload} />)
        )}
      </div>
    </Page>
  )
}

function Review({ c, onDone }: { c: IdCardReview; onDone: () => void }) {
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
