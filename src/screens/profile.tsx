import {
  Bell,
  CarFront,
  ChevronRight,
  CircleQuestionMark,
  CreditCard,
  FileText,
  Leaf,
  LifeBuoy,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Phone,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Trash,
  UserRound,
  WifiOff,
  Layers,
  Music,
  Snowflake,
} from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog, ModalSheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { VehicleForm } from '@/components/VehicleForm'
import { Avatar, Button, Chip, Divider, Field, ListRow, Notice, Plate, Segmented, Switch, VerifiedBadge } from '@/components/ui'
import { CAMPUSES } from '@/data/places'
import { PREFERENCE_LABEL } from '@/lib/matching'
import type { CommuteMode, RidePreference } from '@/lib/types'
import { formatPlate, validatePhone } from '@/lib/validation'
import { Page } from '@/layouts/Page'
import { ApiError, logout, me, updateMe, updateSettings, walletBalance, requestNotificationPermission } from '@/services/api'
import { resetDB, useDB } from '@/services/db'
import { money } from '@/lib/format'
import { PREF_OPTIONS } from './find'

export function Profile() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const [signOut, setSignOut] = useState(false)

  return (
    <Page title="Profile" back={false} actions={<button className="icon-btn" aria-label="Settings" onClick={() => nav('/settings')} style={{ marginRight: 4 }}><SettingsIcon /></button>}>
      <div className="stack gap-6">
        <div className="profile-head">
          <Avatar name={u.name} src={u.photo} size="xl" verified={u.verified} />
          <div className="stack gap-1" style={{ alignItems: 'center' }}>
            <h1 className="t-h2">{u.name}</h1>
            <span className="t-sm t-muted">
              {u.studentId} · {CAMPUSES[u.campus].name}
            </span>
          </div>
          {u.verified ? <VerifiedBadge /> : <span className="badge badge--warning">Verification pending</span>}
        </div>

        <div className="card stats">
          <div className="stat">
            <span className="stat__value">{u.ridesTaken}</span>
            <span className="stat__label">Rides taken</span>
          </div>
          <div className="stat">
            <span className="stat__value">{u.ridesOffered}</span>
            <span className="stat__label">Rides offered</span>
          </div>
          <div className="stat">
            <span className="stat__value">★ {u.rating.toFixed(1)}</span>
            <span className="stat__label">Rating</span>
          </div>
          <div className="stat">
            <span className="stat__value">{Math.round(u.co2SavedKg)} kg</span>
            <span className="stat__label">CO₂ saved</span>
          </div>
        </div>

        {u.co2SavedKg > 0 && (
          <Notice tone="success" icon={<Leaf />}>
            Sharing rides has saved about {Math.round(u.co2SavedKg)} kg of CO₂ — roughly {Math.max(1, Math.round(u.co2SavedKg / 21))} {Math.round(u.co2SavedKg / 21) === 1 ? 'tree' : 'trees'} working for a year.
          </Notice>
        )}

        <div className="list">
          <ListRow icon={<UserRound />} title="Personal Information" subtitle={`${u.email}`} onClick={() => nav('/profile/personal')} />
          <ListRow icon={<CarFront />} title="Vehicle Information" subtitle={u.vehicle ? `${u.vehicle.make} ${u.vehicle.model} · ${u.vehicle.plate}` : 'Add a car to offer rides'} onClick={() => nav('/profile/vehicle')} />
          <ListRow icon={<SlidersHorizontal />} title="Preferences" subtitle={u.preferences.length ? u.preferences.map((p) => PREFERENCE_LABEL[p]).join(', ') : 'Commute mode and ride preferences'} onClick={() => nav('/profile/preferences')} />
          <ListRow icon={<CreditCard />} title="Payment Methods" subtitle={`Wallet ${money(walletBalance(u.id, db))} · UPI · Cards`} onClick={() => nav('/profile/payments')} />
          <ListRow icon={<Bell />} title="Notifications" onClick={() => nav('/profile/notifications')} />
          <ListRow icon={<ShieldCheck />} title="Safety" subtitle={u.emergencyContacts?.length ? `${u.emergencyContacts.length} emergency contact` : 'Add an emergency contact'} onClick={() => nav('/profile/safety')} />
          <ListRow icon={<SettingsIcon />} title="Settings" onClick={() => nav('/settings')} />
          <ListRow icon={<LifeBuoy />} title="Help & Support" onClick={() => nav('/profile/help')} />
        </div>

        <Button variant="secondary" block icon={<LogOut />} onClick={() => setSignOut(true)}>
          Log out
        </Button>
        <p className="t-caption t-muted t-center" style={{ fontWeight: 400 }}>
          RideSync AI · v0.1 · Made for the VIT community
        </p>
      </div>
      <ConfirmDialog
        open={signOut}
        title="Log out of RideSync?"
        body="You’ll need your VIT email and password to log back in."
        confirmLabel="Log out"
        cancelLabel="Stay logged in"
        onConfirm={() => {
          logout()
          nav('/welcome', { replace: true })
        }}
        onClose={() => setSignOut(false)}
      />
    </Page>
  )
}

/* ==========================================================================
   Profile sections
   ========================================================================== */

export function ProfileSection() {
  const { section } = useParams()
  switch (section) {
    case 'personal':
      return <Personal />
    case 'vehicle':
      return <VehicleSection />
    case 'preferences':
      return <Preferences />
    case 'payments':
      return <PaymentMethods />
    case 'notifications':
      return <NotificationSettings />
    case 'safety':
      return <Safety />
    case 'help':
      return <Help />
    default:
      return <Navigate to="/profile" replace />
  }
}

function Personal() {
  const db = useDB()
  const u = me(db)!
  const toast = useToast()
  const [phone, setPhone] = useState(u.phone)
  const [gender, setGender] = useState(u.gender ?? 'undisclosed')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function save() {
    const e = validatePhone(phone)
    setError(e)
    if (e) return
    setSaving(true)
    try {
      await updateMe({ phone: phone.replace(/\D/g, '').slice(-10), gender })
      toast({ tone: 'success', message: 'Saved' })
    } catch (err) {
      toast({ tone: 'error', message: err instanceof ApiError ? err.message : 'Couldn’t save' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Page title="Personal Information" backTo="/profile" narrow footer={<Button size="lg" block loading={saving} onClick={save}>Save changes</Button>}>
      <div className="stack gap-4">
        <Field label="Full name" value={u.name} disabled hint="Matches your VIT records. Contact support to change it." />
        <Field label="VIT email" value={u.email} disabled leading={<Mail />} />
        <Field label="Register number" value={u.studentId} disabled />
        <Field label="Mobile number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={error} leading={<Phone />} />
        <div className="field">
          <span className="field__label">Gender</span>
          <Segmented
            label="Gender"
            value={gender}
            onChange={(g) => setGender(g)}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              { value: 'other', label: 'Other' },
              { value: 'undisclosed', label: 'Skip' },
            ]}
          />
          <span className="field__hint">Used only for Female-friendly ride matching. Never shown on your profile.</span>
        </div>
      </div>
    </Page>
  )
}

function VehicleSection() {
  const db = useDB()
  const u = me(db)!
  const toast = useToast()
  const [remove, setRemove] = useState(false)
  return (
    <Page title="Vehicle Information" backTo="/profile" narrow>
      <div className="stack gap-6">
        {u.vehicle && (
          <div className="vehicle-row card card--pad">
            <span className="list-row__icon">
              <CarFront />
            </span>
            <span className="stack grow">
              <span className="t-body t-strong">
                {u.vehicle.make} {u.vehicle.model}
              </span>
              <span className="t-sm t-muted">{u.vehicle.color}</span>
            </span>
            <Plate>{u.vehicle.plate}</Plate>
          </div>
        )}
        <VehicleForm
          initial={u.vehicle}
          submitLabel={u.vehicle ? 'Save changes' : 'Add car'}
          onSubmit={async (v) => {
            await updateMe({ vehicle: { id: u.vehicle?.id ?? `v_${u.id}`, ...v, plate: formatPlate(v.plate) }, commute: u.commute === 'rider' ? 'both' : u.commute })
            toast({ tone: 'success', message: 'Vehicle saved' })
          }}
          secondary={
            u.vehicle ? (
              <Button variant="danger-ghost" block icon={<Trash />} onClick={() => setRemove(true)}>
                Remove vehicle
              </Button>
            ) : undefined
          }
        />
      </div>
      <ConfirmDialog
        open={remove}
        title="Remove your vehicle?"
        body="You won’t be able to offer rides until you add a car again. Rides you’ve already published stay active."
        confirmLabel="Remove vehicle"
        destructive
        onConfirm={async () => {
          await updateMe({ vehicle: undefined, commute: 'rider' })
          setRemove(false)
          toast({ tone: 'info', message: 'Vehicle removed' })
        }}
        onClose={() => setRemove(false)}
      />
    </Page>
  )
}

const ALL_PREFS: { value: RidePreference; icon: React.ReactNode }[] = [...PREF_OPTIONS, { value: 'ac', icon: <Snowflake /> }, { value: 'music_ok', icon: <Music /> }]

function Preferences() {
  const db = useDB()
  const u = me(db)!
  const toast = useToast()
  const set = async (patch: Parameters<typeof updateMe>[0]) => {
    try {
      await updateMe(patch)
    } catch (e) {
      toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t save' })
    }
  }
  return (
    <Page title="Preferences" backTo="/profile" narrow>
      <div className="stack gap-8">
        <section className="stack gap-3">
          <h2 className="section__title" style={{ padding: 0 }}>
            How you commute
          </h2>
          <Segmented<CommuteMode>
            label="Commute mode"
            value={u.commute ?? 'both'}
            onChange={(c) => set({ commute: c })}
            options={[
              { value: 'driver', label: 'I have a car' },
              { value: 'rider', label: 'I need a ride' },
              { value: 'both', label: 'Both' },
            ]}
          />
          {u.commute !== 'rider' && !u.vehicle && <Notice tone="warning">Add your vehicle to start offering rides.</Notice>}
        </section>
        <section className="stack gap-3">
          <div className="stack gap-1">
            <h2 className="section__title" style={{ padding: 0 }}>
              Ride preferences
            </h2>
            <span className="t-sm t-muted">Applied by default when you search or offer. AI matching scores rides higher when they fit.</span>
          </div>
          <div className="row wrap gap-2">
            {ALL_PREFS.map((o) => (
              <Chip
                key={o.value}
                icon={o.icon}
                selected={u.preferences.includes(o.value)}
                onClick={() => set({ preferences: u.preferences.includes(o.value) ? u.preferences.filter((x) => x !== o.value) : [...u.preferences, o.value] })}
              >
                {PREFERENCE_LABEL[o.value]}
              </Chip>
            ))}
          </div>
        </section>
      </div>
    </Page>
  )
}

function PaymentMethods() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  return (
    <Page title="Payment Methods" backTo="/profile" narrow>
      <div className="stack gap-6">
        <div className="list">
          <ListRow icon={<CreditCard />} title="RideSync Wallet" subtitle={`Balance ${money(walletBalance(u.id, db))}`} onClick={() => nav('/wallet')} />
          <ListRow icon={<span className="t-caption t-strong">UPI</span>} title="UPI apps" subtitle="Google Pay, PhonePe, Paytm and any UPI ID" />
          <ListRow icon={<CreditCard />} title="Credit / Debit cards" subtitle="Visa, Mastercard, RuPay" />
        </div>
        <Button variant="secondary" block icon={<Plus />} onClick={() => toast({ tone: 'info', message: 'Cards are saved securely by the payment gateway at checkout' })}>
          Add payment method
        </Button>
        <Notice icon={<ShieldCheck />}>RideSync never stores card numbers or UPI PINs. Payments run in test mode in this build.</Notice>
      </div>
    </Page>
  )
}

function NotificationSettings() {
  const db = useDB()
  const s = db.settings
  return (
    <Page title="Notifications" backTo="/profile" narrow>
      <div className="stack gap-6">
        {s.notificationPermission !== 'granted' && (
          <Notice
            tone={s.notificationPermission === 'denied' ? 'warning' : 'ai'}
            icon={<Bell />}
            title={s.notificationPermission === 'denied' ? 'Blocked in your browser' : s.notificationPermission === 'unsupported' ? 'Not supported on this browser' : 'Push notifications are off'}
            action={s.notificationPermission === 'unknown' ? <Button size="sm" variant="tonal" onClick={() => requestNotificationPermission()}>Allow</Button> : undefined}
          >
            {s.notificationPermission === 'denied' ? 'Allow notifications for this site in browser settings to get alerts.' : 'You’ll still see every update inside the app.'}
          </Notice>
        )}
        <div className="list">
          <ToggleRow title="Push notifications" subtitle="Alerts when RideSync is in the background" checked={s.pushEnabled} onChange={(v) => updateSettings({ pushEnabled: v })} />
          <Divider />
          <ToggleRow title="Ride updates" subtitle="Requests, acceptances, arrivals, cancellations" checked={s.rideUpdates} onChange={(v) => updateSettings({ rideUpdates: v })} />
          <ToggleRow title="Messages" subtitle="Chat from drivers and riders" checked={s.chatMessages} onChange={(v) => updateSettings({ chatMessages: v })} />
          <ToggleRow title="Ride suggestions" subtitle="New AI matches on your usual routes" checked={s.promotions} onChange={(v) => updateSettings({ promotions: v })} />
        </div>
      </div>
    </Page>
  )
}

function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <ListRow title={title} subtitle={subtitle} trailing={<Switch label={title} checked={checked} onChange={onChange} />} chevron={false} />
}

function Safety() {
  const db = useDB()
  const u = me(db)!
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const contacts = u.emergencyContacts ?? []
  return (
    <Page title="Safety" backTo="/profile" narrow>
      <div className="stack gap-6">
        <div className="safety-list">
          <div className="row row--top gap-3">
            <ShieldCheck size={20} className="t-primary" style={{ flex: 'none' }} />
            <span className="t-sm t-secondary">Every driver and rider is a verified VIT student with a confirmed @vitstudent.ac.in email and register number.</span>
          </div>
          <div className="row row--top gap-3">
            <MessageCircle size={20} className="t-primary" style={{ flex: 'none' }} />
            <span className="t-sm t-secondary">Phone numbers are only shared with your co-riders for confirmed rides.</span>
          </div>
          <div className="row row--top gap-3">
            <Layers size={20} className="t-primary" style={{ flex: 'none' }} />
            <span className="t-sm t-secondary">Live trips can be shared with anyone you trust, and SOS is one tap away during every ride.</span>
          </div>
        </div>

        <section className="section">
          <h2 className="section__title">Emergency contacts</h2>
          <div className="list">
            {contacts.map((c, i) => (
              <ListRow
                key={i}
                icon={<UserRound />}
                title={c.name}
                subtitle={c.phone}
                trailing={
                  <button className="t-sm t-strong" style={{ color: 'var(--error-600)' }} onClick={() => updateMe({ emergencyContacts: contacts.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                }
              />
            ))}
          </div>
          {contacts.length < 3 && (
            <Button variant="secondary" block icon={<Plus />} onClick={() => setOpen(true)}>
              Add emergency contact
            </Button>
          )}
        </section>

        <ToggleRow title="Share trips automatically" subtitle="Send live trip links to your emergency contacts when a ride starts" checked={db.settings.shareTripAuto} onChange={(v) => updateSettings({ shareTripAuto: v })} />
      </div>
      <ModalSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add emergency contact"
        footer={
          <Button
            size="lg"
            block
            onClick={async () => {
              const e = !name.trim() ? 'Enter a name' : validatePhone(phone)
              setErr(e)
              if (e) return
              await updateMe({ emergencyContacts: [...contacts, { name: name.trim(), phone: phone.replace(/\D/g, '').slice(-10) }] })
              setOpen(false)
              setName('')
              setPhone('')
              toast({ tone: 'success', message: 'Emergency contact added' })
            }}
          >
            Save contact
          </Button>
        }
      >
        <div className="stack gap-4">
          <Field label="Name" placeholder="e.g. Parent or guardian" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Mobile number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={err} />
        </div>
      </ModalSheet>
    </Page>
  )
}

const FAQ = [
  ['How is the cost per seat decided?', 'Drivers see a suggested cost-share based on distance, fuel type and seats. It covers fuel, tolls and wear — RideSync is for sharing costs, so drivers can’t charge more than 1.5× the suggestion.'],
  ['What does the AI match score mean?', 'It combines how much of your route the driver covers, how close they pass your pickup, timing, your preferences and the driver’s reliability. Tap “Why this ride?” on any ride to see the breakdown.'],
  ['What if my driver cancels?', 'You get a full refund to your RideSync Wallet immediately, and we suggest the next best match.'],
  ['Who can join RideSync?', 'Only current VIT students with a verified @vitstudent.ac.in email and valid register number.'],
]

function Help() {
  const [open, setOpen] = useState<number | null>(0)
  const toast = useToast()
  return (
    <Page title="Help & Support" backTo="/profile" narrow>
      <div className="stack gap-6">
        <div className="list">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <button type="button" className="list-row" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className="list-row__icon list-row__icon--plain">
                  <CircleQuestionMark />
                </span>
                <span className="list-row__body">
                  <span className="list-row__title">{q}</span>
                </span>
                <ChevronRight size={18} style={{ transform: open === i ? 'rotate(90deg)' : undefined, transition: 'transform 200ms', color: 'var(--ink-400)' }} />
              </button>
              {open === i && <p className="t-sm t-secondary" style={{ padding: '0 0 16px 40px' }}>{a}</p>}
            </div>
          ))}
        </div>
        <div className="list">
          <ListRow icon={<MessageCircle />} title="Chat with support" subtitle="Typically replies within a few hours" onClick={() => toast({ tone: 'info', message: 'Support chat connects to your helpdesk tool in production' })} />
          <ListRow icon={<FileText />} title="Community Guidelines" onClick={() => toast({ tone: 'info', message: 'Guidelines open from your CMS in production' })} />
        </div>
      </div>
    </Page>
  )
}

/* ==========================================================================
   Settings
   ========================================================================== */

export function Settings() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const [del, setDel] = useState(false)
  const [reset, setReset] = useState(false)
  return (
    <Page title="Settings" narrow>
      <div className="stack gap-6">
        <section className="section">
          <h2 className="section__title">Campus</h2>
          <Segmented
            label="Campus"
            value={u.campus}
            onChange={(c) => updateMe({ campus: c })}
            options={[
              { value: 'chennai', label: 'VIT Chennai' },
              { value: 'vellore', label: 'VIT Vellore' },
            ]}
          />
          <span className="field__hint">Sets your default pickup and which rides we suggest first.</span>
        </section>

        <section className="section">
          <h2 className="section__title">Account</h2>
          <div className="list">
            <ListRow icon={<UserRound />} title="Personal Information" onClick={() => nav('/profile/personal')} />
            <ListRow icon={<Bell />} title="Notifications" onClick={() => nav('/profile/notifications')} />
            <ListRow icon={<ShieldCheck />} title="Safety" onClick={() => nav('/profile/safety')} />
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Product</h2>
          <div className="list">
            <ListRow icon={<Palette />} title="Design system" subtitle="Tokens and components" onClick={() => nav('/design-system')} />
            <ListRow icon={<Layers />} title="Screen states" subtitle="Empty, loading and error states" onClick={() => nav('/states')} />
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Testing</h2>
          <div className="list">
            <ListRow icon={<WifiOff />} title="Simulate offline" subtitle="See how screens behave without a connection" trailing={<Switch label="Simulate offline" checked={db.settings.simulateOffline} onChange={(v) => updateSettings({ simulateOffline: v })} />} chevron={false} />
            <ListRow icon={<RotateCcw />} title="Reset local data" subtitle="Restore the demo community and rides" onClick={() => setReset(true)} />
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Danger zone</h2>
          <div className="list">
            <ListRow icon={<LogOut />} title="Log out" onClick={() => { logout(); nav('/welcome', { replace: true }) }} />
            <ListRow icon={<Trash />} title="Delete account" danger onClick={() => setDel(true)} />
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={reset}
        title="Reset local data?"
        body="All rides, bookings, messages and wallet activity stored on this device go back to the demo state."
        confirmLabel="Reset data"
        destructive
        onConfirm={() => {
          resetDB()
          setReset(false)
          toast({ tone: 'success', message: 'Local data reset' })
          nav('/home')
        }}
        onClose={() => setReset(false)}
      />
      <ConfirmDialog
        open={del}
        title="Delete your account?"
        body="This permanently removes your profile, ride history and wallet balance. Upcoming rides will be cancelled and riders refunded. This can’t be undone."
        confirmLabel="Delete account"
        cancelLabel="Keep my account"
        destructive
        onConfirm={() => {
          setDel(false)
          toast({ tone: 'info', message: 'Account deletion is handled by support in this build' })
        }}
        onClose={() => setDel(false)}
      />
    </Page>
  )
}
