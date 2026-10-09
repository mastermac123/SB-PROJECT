import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, Bell, CarFront, Check, Footprints, IdCard, MapPin, Phone, Repeat, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button, Field, Notice, Segmented, cx } from '@/components/ui'
import { VehicleForm, type VehicleDraft } from '@/components/VehicleForm'
import type { CommuteMode, Gender } from '@/lib/types'
import { validatePhone, validateStudentId } from '@/lib/validation'
import {
  ApiError,
  auth,
  notificationPermission,
  requestLocation,
  requestNotificationPermission,
  saveVehicle,
  updateMe,
  useMe,
  type PermissionState,
} from '@/services/api'

const OPTIONS: { value: CommuteMode; title: string; body: string; icon: React.ReactNode }[] = [
  { value: 'driver', title: 'I have a car', body: 'Offer rides to fellow VIT students.', icon: <CarFront /> },
  { value: 'rider', title: 'I need a ride', body: 'Find rides to your destination.', icon: <Footprints /> },
  { value: 'both', title: 'Both', body: 'Offer and find rides.', icon: <Repeat /> },
]

type Step = 'profile' | 'commute' | 'vehicle' | 'permissions'
const ORDER: Step[] = ['profile', 'commute', 'vehicle', 'permissions']

export function Onboarding() {
  const { user } = useMe()
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('profile')
  const [mode, setMode] = useState<CommuteMode | null>(user?.commute ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null
  const stepIndex = ORDER.indexOf(step)

  async function saveCommute() {
    if (!mode) return
    setSaving(true)
    setError(null)
    try {
      await updateMe({ commute: mode })
      setStep(mode !== 'rider' ? 'vehicle' : 'permissions')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function finish() {
    setSaving(true)
    try {
      await updateMe({ onboarded: true })
      nav('/home', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t finish setup.')
      if (e instanceof ApiError && e.code === 'validation') setStep('profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding">
      <header className="onboarding__top">
        <Logo height={26} />
        <div className="row gap-3">
          <div className="row gap-1" aria-label={`Step ${stepIndex + 1} of 4`}>
            {ORDER.map((s, i) => (
              <span key={s} style={{ width: i === stepIndex ? 20 : 6, height: 6, borderRadius: 3, background: i <= stepIndex ? 'var(--primary-600)' : 'var(--ink-200)', transition: 'all 220ms' }} />
            ))}
          </div>
          <button className="t-sm t-muted" onClick={() => auth.logout().then(() => nav('/welcome', { replace: true }))}>
            Log out
          </button>
        </div>
      </header>
      <AnimatePresence mode="wait">
        <motion.main key={step} className="onboarding__main" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
          {step === 'profile' && <ProfileStep onNext={() => setStep('commute')} />}

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

          {step === 'vehicle' && <VehicleStep onNext={() => setStep('permissions')} />}

          {step === 'permissions' && (
            <>
              <Permissions />
              {error && <Notice tone="error">{error}</Notice>}
              <div className="onboarding__footer">
                <Button size="lg" block loading={saving} onClick={finish}>
                  Get started
                </Button>
              </div>
            </>
          )}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const { user } = useMe()
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [studentId, setStudentId] = useState(user?.studentId ?? '')
  const [programme, setProgramme] = useState(user?.programme ?? '')
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'undisclosed')
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = {
      name: name.trim().length >= 3 && /\s/.test(name.trim()) ? null : 'Enter your first and last name',
      phone: validatePhone(phone),
      studentId: validateStudentId(studentId),
    }
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    setSaving(true)
    try {
      await updateMe({ name: name.trim(), phone, studentId, programme: programme.trim(), gender })
      onNext()
    } catch (ex) {
      if (ex instanceof ApiError) setErrors(ex.field ? { [ex.field]: ex.message } : { form: ex.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack gap-5" onSubmit={submit} noValidate style={{ flex: 1 }}>
      <div className="stack gap-2">
        <h1 className="t-h1">Set up your profile</h1>
        <p className="t-body t-muted">
          Signed in as <strong style={{ color: 'var(--ink-900)' }}>{user?.email}</strong>. Riders and drivers see your name and photo; your number is shared only for confirmed rides.
        </p>
      </div>
      {errors.form && <Notice tone="error">{errors.form}</Notice>}
      <Field label="Full name" autoComplete="name" leading={<UserRound />} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Field label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" leading={<Phone />} value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
      <Field label="Student ID / roll number" placeholder="As on your college ID card" leading={<IdCard />} value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())} error={errors.studentId} maxLength={15} />
      <Field label="Branch & year (optional)" placeholder="e.g. Computer Engineering · TE" value={programme} onChange={(e) => setProgramme(e.target.value)} />
      <div className="field">
        <span className="field__label">Gender (optional)</span>
        <Segmented<Gender>
          label="Gender"
          value={gender}
          onChange={setGender}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'other', label: 'Other' },
            { value: 'undisclosed', label: 'Skip' },
          ]}
        />
        <span className="field__hint">Used only to match Female-friendly rides. Never shown on your profile.</span>
      </div>
      <div className="onboarding__footer">
        <Button type="submit" size="lg" block loading={saving}>
          Continue
        </Button>
      </div>
    </form>
  )
}

function VehicleStep({ onNext }: { onNext: () => void }) {
  const { user } = useMe()
  const [upi, setUpi] = useState(user?.upiId ?? '')
  const [upiErr, setUpiErr] = useState<string | null>(null)

  async function save(v: VehicleDraft) {
    if (upi.trim() && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim())) {
      setUpiErr('UPI IDs look like name@bank')
      throw new Error('Check your UPI ID')
    }
    await saveVehicle(v)
    if (upi.trim() !== (user?.upiId ?? '')) await updateMe({ upiId: upi.trim() })
    onNext()
  }

  return (
    <>
      <div className="stack gap-2">
        <h1 className="t-h1">Add your car</h1>
        <p className="t-body t-muted">Riders see this so they can find you at pickup.</p>
      </div>
      <Field
        label="Your UPI ID (to receive cost-share)"
        placeholder="yourname@okaxis"
        leading={<AtSign />}
        value={upi}
        onChange={(e) => {
          setUpi(e.target.value)
          setUpiErr(null)
        }}
        error={upiErr}
        hint="Riders pay you directly from their UPI app. Optional — you can also take cash."
      />
      <VehicleForm initial={user?.vehicle} onSubmit={save} submitLabel="Save car" secondary={<Button variant="ghost" block onClick={onNext}>I’ll add it later</Button>} />
    </>
  )
}

function Permissions() {
  const [loc, setLoc] = useState<PermissionState>('unknown')
  const [notif, setNotif] = useState<PermissionState>(notificationPermission())
  const [busy, setBusy] = useState<'loc' | 'notif' | null>(null)
  return (
    <>
      <div className="stack gap-2">
        <h1 className="t-h1">Two quick permissions</h1>
        <p className="t-body t-muted">Both are optional, but they make pickups faster and keep you updated.</p>
      </div>
      <div className="stack gap-3">
        <PermissionRow
          icon={<MapPin />}
          title="Location"
          body="Set your pickup automatically and share your live location while driving."
          state={loc}
          busy={busy === 'loc'}
          onAllow={async () => {
            setBusy('loc')
            try {
              await requestLocation()
              setLoc('granted')
            } catch {
              setLoc('denied')
            }
            setBusy(null)
          }}
          deniedText="Blocked — you can still type your pickup. Enable it later in your browser settings."
        />
        <PermissionRow
          icon={<Bell />}
          title="Notifications"
          body="Know the moment a driver accepts, arrives, or messages you."
          state={notif}
          busy={busy === 'notif'}
          onAllow={async () => {
            setBusy('notif')
            setNotif(await requestNotificationPermission())
            setBusy(null)
          }}
          deniedText={notif === 'unsupported' ? 'This browser doesn’t support notifications. You’ll see updates in the app.' : 'Blocked — you’ll still see updates inside RideSync.'}
        />
      </div>
    </>
  )
}

function PermissionRow({ icon, title, body, state, busy, onAllow, deniedText }: { icon: React.ReactNode; title: string; body: string; state: PermissionState; busy: boolean; onAllow: () => void; deniedText: string }) {
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
