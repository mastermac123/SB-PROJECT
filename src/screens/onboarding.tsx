import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CarFront, Check, Footprints, MapPin, Repeat } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button, Notice, cx } from '@/components/ui'
import { VehicleForm, type VehicleDraft } from '@/components/VehicleForm'
import type { CommuteMode } from '@/lib/types'
import { formatPlate } from '@/lib/validation'
import { ApiError, me, requestLocation, requestNotificationPermission, setCommute, updateMe } from '@/services/api'
import { useDB } from '@/services/db'

const OPTIONS: { value: CommuteMode; title: string; body: string; icon: React.ReactNode }[] = [
  { value: 'driver', title: 'I have a car', body: 'Offer rides to fellow VIT students.', icon: <CarFront /> },
  { value: 'rider', title: 'I need a ride', body: 'Find rides to your destination.', icon: <Footprints /> },
  { value: 'both', title: 'Both', body: 'Offer and find rides.', icon: <Repeat /> },
]

type Step = 'commute' | 'vehicle' | 'permissions'

export function Onboarding() {
  const db = useDB()
  const u = me(db)
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('commute')
  const [mode, setMode] = useState<CommuteMode | null>(u?.commute ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveCommute() {
    if (!mode) return
    setSaving(true)
    setError(null)
    try {
      await setCommute(mode)
      setStep(mode !== 'rider' && !u?.vehicle ? 'vehicle' : 'permissions')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function saveVehicle(v: VehicleDraft) {
    await updateMe({ vehicle: { id: `v_${u!.id}`, ...v, plate: formatPlate(v.plate) } })
    setStep('permissions')
  }

  const stepIndex = { commute: 0, vehicle: 1, permissions: 2 }[step]

  return (
    <div className="onboarding">
      <header className="onboarding__top">
        <Logo height={26} />
        <div className="row gap-1" aria-label={`Step ${stepIndex + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: i === stepIndex ? 20 : 6, height: 6, borderRadius: 3, background: i <= stepIndex ? 'var(--primary-600)' : 'var(--ink-200)', transition: 'all 220ms' }} />
          ))}
        </div>
      </header>
      <AnimatePresence mode="wait">
        <motion.main
          key={step}
          className="onboarding__main"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
        >
          {step === 'commute' && (
            <>
              <div className="stack gap-2">
                <h1 className="t-h1">How do you commute?</h1>
                <p className="t-body t-muted">You can change this anytime in your profile.</p>
              </div>
              <div className="stack gap-3" role="radiogroup" aria-label="How do you commute?">
                {OPTIONS.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={mode === o.value} className={cx('choice', mode === o.value && 'is-selected')} onClick={() => setMode(o.value)}>
                    <span className="choice__icon">{o.icon}</span>
                    <span className="stack grow" style={{ gap: 2 }}>
                      <span className="choice__title">{o.title}</span>
                      <span className="choice__body">{o.body}</span>
                    </span>
                    <span className={cx('radio', mode === o.value && 'is-checked')} aria-hidden />
                  </button>
                ))}
              </div>
              {error && <Notice tone="error">{error}</Notice>}
              <div className="onboarding__footer">
                <Button size="lg" block disabled={!mode} loading={saving} onClick={saveCommute}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 'vehicle' && (
            <>
              <div className="stack gap-2">
                <h1 className="t-h1">Add your car</h1>
                <p className="t-body t-muted">Riders see this so they can find you at pickup.</p>
              </div>
              <VehicleForm onSubmit={saveVehicle} submitLabel="Save car" secondary={<Button variant="ghost" block onClick={() => setStep('permissions')}>I’ll add it later</Button>} />
            </>
          )}

          {step === 'permissions' && <Permissions onDone={() => nav('/home', { replace: true })} />}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}

function Permissions({ onDone }: { onDone: () => void }) {
  const db = useDB()
  const [busy, setBusy] = useState<'loc' | 'notif' | null>(null)
  const loc = db.settings.locationPermission
  const notif = db.settings.notificationPermission

  return (
    <>
      <div className="stack gap-2">
        <h1 className="t-h1">Two quick permissions</h1>
        <p className="t-body t-muted">Both are optional. They make pickups faster and keep you updated on your ride.</p>
      </div>
      <div className="stack gap-3">
        <PermissionRow
          icon={<MapPin />}
          title="Location"
          body="Set your pickup automatically and share live location during a ride."
          state={loc}
          busy={busy === 'loc'}
          onAllow={async () => {
            setBusy('loc')
            await requestLocation().catch(() => {})
            setBusy(null)
          }}
          deniedText="Blocked — you can still type your pickup. Enable it later in browser settings."
        />
        <PermissionRow
          icon={<Bell />}
          title="Notifications"
          body="Know the moment a driver accepts, arrives, or messages you."
          state={notif}
          busy={busy === 'notif'}
          onAllow={async () => {
            setBusy('notif')
            await requestNotificationPermission().catch(() => {})
            setBusy(null)
          }}
          deniedText={notif === 'unsupported' ? 'This browser doesn’t support notifications. You’ll see updates in the app.' : 'Blocked — you’ll still see updates inside RideSync.'}
        />
      </div>
      <div className="onboarding__footer">
        <Button size="lg" block onClick={onDone}>
          {loc === 'unknown' && (notif === 'unknown' || notif === 'unsupported') ? 'Not now' : 'Get started'}
        </Button>
      </div>
    </>
  )
}

function PermissionRow({
  icon,
  title,
  body,
  state,
  busy,
  onAllow,
  deniedText,
}: {
  icon: React.ReactNode
  title: string
  body: string
  state: string
  busy: boolean
  onAllow: () => void
  deniedText: string
}) {
  return (
    <div className="choice" style={{ cursor: 'default', alignItems: 'flex-start' }}>
      <span className="choice__icon">{icon}</span>
      <span className="stack grow gap-1">
        <span className="choice__title">{title}</span>
        <span className="choice__body">{state === 'denied' || state === 'unsupported' ? deniedText : body}</span>
      </span>
      {state === 'granted' ? (
        <span className="badge badge--success" style={{ marginTop: 2 }}>
          <Check />
          Allowed
        </span>
      ) : state === 'denied' || state === 'unsupported' ? (
        <span className="badge" style={{ marginTop: 2 }}>
          Off
        </span>
      ) : (
        <Button size="sm" variant="tonal" loading={busy} onClick={onAllow}>
          Allow
        </Button>
      )}
    </div>
  )
}
