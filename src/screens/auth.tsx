import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Camera, IdCard, Lock, Mail, MailCheck, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { RouteArt } from '@/components/RouteArt'
import { BackButton } from '@/components/TopBar'
import { Button, Field, Notice, PasswordField, TestModeBadge, cx } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/data/seed'
import {
  passwordStrength,
  validateName,
  validatePassword,
  validatePhone,
  validateStudentId,
  validateVitEmail,
  VIT_EMAIL_DOMAIN,
} from '@/lib/validation'
import { ApiError, login, loginWithGoogle, me, register, requestPasswordReset, resendCode, TEST_OTP, verifyEmail } from '@/services/api'
import { getDB, update, useDB } from '@/services/db'

/* ==========================================================================
   Splash
   ========================================================================== */

export function Splash() {
  const nav = useNavigate()
  useEffect(() => {
    const seen = sessionStorage.getItem('ridesync:splash')
    const go = () => {
      sessionStorage.setItem('ridesync:splash', '1')
      const u = me(getDB())
      nav(u ? (u.commute ? '/home' : '/onboarding') : '/welcome', { replace: true })
    }
    const t = setTimeout(go, seen ? 0 : 2100)
    return () => clearTimeout(t)
  }, [nav])

  const path = 'M 20 60 C 70 60 80 20 130 20 S 190 50 240 30'
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#fff' }}>
      <div className="stack gap-8" style={{ alignItems: 'center' }}>
        <svg width="260" height="80" viewBox="0 0 260 80" aria-hidden>
          <path d={path} fill="none" stroke="var(--surface-sunken)" strokeWidth="6" strokeLinecap="round" />
          <motion.path d={path} fill="none" stroke="url(#sp)" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: [0.45, 0, 0.2, 1] }} />
          <defs>
            <linearGradient id="sp" x1="0" x2="1">
              <stop offset="0" stopColor="#4365F2" />
              <stop offset="1" stopColor="#6A3EF8" />
            </linearGradient>
          </defs>
          <circle r="7" fill="#fff" stroke="#5038E6" strokeWidth="3">
            <animateMotion dur="1s" fill="freeze" path={path} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.2 1" />
          </circle>
        </svg>
        <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.75, duration: 0.45, ease: [0.2, 0, 0, 1] }}>
          <Logo variant="full" height={72} />
        </motion.div>
      </div>
    </div>
  )
}

/* ==========================================================================
   Landing
   ========================================================================== */

export function Landing() {
  const nav = useNavigate()
  if (me(getDB())) return <Navigate to="/home" replace />
  return (
    <div className="landing">
      <header className="landing__top">
        <Logo height={30} />
        <Link to="/login" className="btn btn--ghost btn--sm only-desktop">
          Log in
        </Link>
      </header>
      <main className="landing__main">
        <div className="landing__art">
          <RouteArt />
        </div>
        <div className="landing__copy">
          <span className="badge badge--verified" style={{ alignSelf: 'flex-start' }}>
            <BadgeCheck />
            Only for verified VIT students
          </span>
          <h1 className="t-display landing__title">Smart rides. Shared journeys.</h1>
          <p className="t-body-lg t-secondary">AI-powered carpooling built exclusively for the VIT community.</p>
          <div className="landing__actions">
            <Button size="lg" block onClick={() => nav('/register')}>
              Create Account
            </Button>
            <Button size="lg" variant="secondary" block onClick={() => nav('/login')}>
              Login
            </Button>
          </div>
          <ul className="landing__points">
            <li>
              <strong>Offer a Ride</strong>
              <span>Share empty seats on trips you’re already taking.</span>
            </li>
            <li>
              <strong>Find a Ride</strong>
              <span>AI matches you with VIT drivers heading your way.</span>
            </li>
            <li>
              <strong>Split the cost</strong>
              <span>Fair cost-sharing, not fares. No surge pricing.</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  )
}

/* ==========================================================================
   Google sign-in (VIT Google Workspace only)
   ========================================================================== */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type GoogleTokenClient = { requestAccessToken: () => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (cfg: Record<string, unknown>) => GoogleTokenClient } } }
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Couldn’t load Google sign-in'))
    document.head.appendChild(s)
  })
}

function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)

  async function start() {
    if (!GOOGLE_CLIENT_ID) {
      onError('Google sign-in isn’t configured for this build yet. Continue with your VIT email instead.')
      return
    }
    setLoading(true)
    try {
      await loadGis()
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        hd: VIT_EMAIL_DOMAIN,
        callback: async (resp: { access_token?: string; error?: string }) => {
          try {
            if (!resp.access_token) throw new ApiError('auth', 'Google sign-in was cancelled.')
            const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` } }).then((r) => r.json())
            const res = await loginWithGoogle({ email: info.email, name: info.name, picture: info.picture })
            if (res.isNew) nav('/register', { state: { google: res.profile } })
            else nav('/home', { replace: true })
          } catch (e) {
            onError(e instanceof ApiError ? e.message : 'Google sign-in failed. Try again.')
          } finally {
            setLoading(false)
          }
        },
      })
      client.requestAccessToken()
    } catch {
      setLoading(false)
      onError('Couldn’t reach Google. Check your connection and try again.')
    }
  }

  return (
    <Button type="button" variant="secondary" size="lg" block loading={loading} onClick={start} icon={<GoogleG />}>
      Continue with Google
    </Button>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/* ==========================================================================
   Login
   ========================================================================== */

export function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null; form?: string | null }>({})
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    const emailErr = validateVitEmail(email)
    const pwErr = password ? null : 'Enter your password'
    setErrors({ email: emailErr, password: pwErr })
    if (emailErr || pwErr) return
    setLoading(true)
    try {
      const res = await login(email, password)
      if (res.needsVerification) nav('/verify')
      else nav((loc.state as { from?: string } | null)?.from ?? (res.user.commute ? '/home' : '/onboarding'), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout top={<div className="auth__inner" style={{ flex: 'none', paddingBottom: 0, paddingTop: 8 }}><BackButton to="/welcome" /></div>}>
      <div className="auth__title">
        <h1 className="t-h1">Welcome back</h1>
        <p className="t-body t-muted">Log in with your VIT student email.</p>
      </div>
      <form className="stack gap-4" onSubmit={submit} noValidate>
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <Field
          label="VIT email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={`name.surname2023@${VIT_EMAIL_DOMAIN}`}
          leading={<Mail />}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (touched) setErrors((x) => ({ ...x, email: validateVitEmail(e.target.value) }))
          }}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          leading={<Lock />}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors((x) => ({ ...x, password: null }))
          }}
          error={errors.password}
        />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: -4 }}>
          <Link to="/forgot" className="t-sm t-strong">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={loading}>
          Login
        </Button>
      </form>
      <div className="auth__divider" style={{ margin: '24px 0' }}>
        or
      </div>
      <div className="stack gap-3">
        <GoogleButton onError={(m) => setErrors({ form: m })} />
        <Notice tone="info" icon={<UserRound />}>
          <span>
            Exploring RideSync?{' '}
            <button
              type="button"
              className="t-strong"
              style={{ color: 'inherit', textDecoration: 'underline' }}
              onClick={() => {
                setEmail(DEMO_EMAIL)
                setPassword(DEMO_PASSWORD)
                setErrors({})
              }}
            >
              Use the demo account
            </button>
          </span>
        </Notice>
      </div>
      <p className="auth__footer">
        New to RideSync? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}

/* ==========================================================================
   Register
   ========================================================================== */

type RegForm = { name: string; email: string; studentId: string; phone: string; password: string }
const regValidators: Record<keyof RegForm, (v: string) => string | null> = {
  name: validateName,
  email: validateVitEmail,
  studentId: validateStudentId,
  phone: validatePhone,
  password: validatePassword,
}

export function Register() {
  const nav = useNavigate()
  const loc = useLocation()
  const google = (loc.state as { google?: { email: string; name: string; picture?: string } } | null)?.google
  const [form, setForm] = useState<RegForm>({ name: google?.name ?? '', email: google?.email ?? '', studentId: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof RegForm | 'form', string | null>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof RegForm, boolean>>>({})
  const [photo, setPhoto] = useState<string | undefined>(google?.picture)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof RegForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === 'studentId' ? e.target.value.toUpperCase() : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    if (touched[k]) setErrors((x) => ({ ...x, [k]: regValidators[k](v) }))
  }
  const blur = (k: keyof RegForm) => () => {
    setTouched((t) => ({ ...t, [k]: true }))
    if (form[k]) setErrors((x) => ({ ...x, [k]: regValidators[k](form[k]) }))
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setErrors((x) => ({ ...x, form: 'Photo must be under 5 MB.' }))
      return
    }
    // Downscale to keep local storage small.
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const s = 256
      c.width = s
      c.height = s
      const ctx = c.getContext('2d')!
      const m = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s)
      setPhoto(c.toDataURL('image/jpeg', 0.82))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = Object.fromEntries((Object.keys(regValidators) as (keyof RegForm)[]).map((k) => [k, regValidators[k](form[k])]))
    setErrors(errs)
    setTouched({ name: true, email: true, studentId: true, phone: true, password: true })
    if (Object.values(errs).some(Boolean)) {
      document.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setLoading(true)
    try {
      await register({ ...form, photo })
      nav('/verify')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
    } finally {
      setLoading(false)
    }
  }

  const strength = passwordStrength(form.password)
  const ok = (k: keyof RegForm) => !!touched[k] && !!form[k] && !regValidators[k](form[k])

  return (
    <AuthLayout top={<div className="auth__inner" style={{ flex: 'none', paddingBottom: 0, paddingTop: 8 }}><BackButton to="/welcome" /></div>}>
      <div className="auth__title">
        <StepDots step={0} />
        <h1 className="t-h1">Create your account</h1>
        <p className="t-body t-muted">RideSync is only for VIT students. We’ll verify your VIT email next.</p>
      </div>
      <form className="stack gap-4" onSubmit={submit} noValidate>
        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        <div className="row gap-4">
          <button type="button" className="photo-pick" onClick={() => fileRef.current?.click()} aria-label={photo ? 'Change profile photo' : 'Add profile photo'}>
            {photo ? <img src={photo} alt="" /> : <Camera />}
          </button>
          <div className="stack gap-1">
            <span className="t-sm t-strong">Profile photo</span>
            <span className="t-caption t-muted" style={{ fontWeight: 400 }}>
              Optional · helps drivers recognise you at pickup
            </span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        </div>
        <Field label="Full name" autoComplete="name" placeholder="As on your VIT ID" leading={<UserRound />} value={form.name} onChange={set('name')} onBlur={blur('name')} error={errors.name} valid={ok('name')} />
        <Field
          label="VIT email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={`name.surname2023@${VIT_EMAIL_DOMAIN}`}
          leading={<Mail />}
          value={form.email}
          onChange={set('email')}
          onBlur={blur('email')}
          error={errors.email}
          valid={ok('email')}
          disabled={!!google}
          hint={`Must end in @${VIT_EMAIL_DOMAIN}`}
        />
        <Field
          label="Register number"
          autoComplete="off"
          placeholder="22BCE1234"
          leading={<IdCard />}
          value={form.studentId}
          onChange={set('studentId')}
          onBlur={blur('studentId')}
          error={errors.studentId}
          valid={ok('studentId')}
          maxLength={9}
          hint="Printed on your VIT ID card"
        />
        <Field label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" leading={<Phone />} value={form.phone} onChange={set('phone')} onBlur={blur('phone')} error={errors.phone} valid={ok('phone')} hint="Shared with your co-rider only for confirmed rides" />
        <div className="stack gap-2">
          <PasswordField label="Password" autoComplete="new-password" placeholder="At least 8 characters" leading={<Lock />} value={form.password} onChange={set('password')} onBlur={blur('password')} error={errors.password} />
          {form.password && !errors.password && (
            <div className="row gap-2" aria-label={`Password strength: ${['weak', 'fair', 'good', 'strong'][strength]}`}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < strength ? (strength === 1 ? 'var(--warning-500)' : 'var(--success-500)') : 'var(--surface-sunken)', transition: 'background 200ms' }} />
              ))}
              <span className="t-caption t-muted" style={{ minWidth: 44, textAlign: 'right' }}>
                {['Weak', 'Fair', 'Good', 'Strong'][strength]}
              </span>
            </div>
          )}
        </div>
        <Button type="submit" size="lg" block loading={loading} style={{ marginTop: 4 }}>
          Continue
        </Button>
        <p className="t-caption t-muted t-center" style={{ fontWeight: 400 }}>
          By continuing you agree to the RideSync Community Guidelines and Privacy Policy.
        </p>
      </form>
      <p className="auth__footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  )
}

function StepDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="row gap-1" aria-label={`Step ${step + 1} of ${total}`} style={{ marginBottom: 8 }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i <= step ? 'var(--primary-600)' : 'var(--ink-200)', transition: 'all 220ms var(--ease-standard)' }} />
      ))}
    </div>
  )
}

/* ==========================================================================
   Verify email (OTP)
   ========================================================================== */

export function VerifyEmail() {
  const db = useDB()
  const nav = useNavigate()
  const toast = useToast()
  const pending = db.pendingVerification
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(30)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  if (!pending) return <Navigate to={me(db) ? '/home' : '/login'} replace />

  async function submit(code: string) {
    setLoading(true)
    setError(null)
    try {
      await verifyEmail(code)
      nav('/onboarding', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      setDigits(Array(6).fill(''))
      refs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  function setAt(i: number, v: string) {
    const clean = v.replace(/\D/g, '')
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split('')
      const filled = [...next, ...Array(6 - next.length).fill('')]
      setDigits(filled)
      refs.current[Math.min(5, next.length)]?.focus()
      if (next.length === 6) void submit(next.join(''))
      return
    }
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    setError(null)
    if (clean && i < 5) refs.current[i + 1]?.focus()
    if (next.every(Boolean)) void submit(next.join(''))
  }

  return (
    <AuthLayout top={<div className="auth__inner" style={{ flex: 'none', paddingBottom: 0, paddingTop: 8 }}><BackButton to="/register" /></div>}>
      <div className="auth__title">
        <StepDots step={1} />
        <div className="state__art" style={{ marginBottom: 8 }}>
          <MailCheck />
        </div>
        <h1 className="t-h1">Verify your VIT email</h1>
        <p className="t-body t-muted">
          Enter the 6-digit code we sent to <strong style={{ color: 'var(--ink-900)' }}>{pending.email}</strong>
        </p>
      </div>
      <div className="stack gap-4">
        <div className={cx('otp', error && 'is-invalid')} role="group" aria-label="Verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              className="otp__cell"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              value={d}
              aria-label={`Digit ${i + 1}`}
              disabled={loading}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
              }}
            />
          ))}
        </div>
        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="field__error" role="alert">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Notice tone="warning" icon={<ShieldCheck />} title="Test mode">
          Email delivery isn’t connected in this build. Use code <strong>{TEST_OTP}</strong>.
        </Notice>
        <Button size="lg" block loading={loading} disabled={digits.some((d) => !d)} onClick={() => submit(digits.join(''))}>
          Verify
        </Button>
        <Button
          variant="ghost"
          block
          disabled={cooldown > 0}
          onClick={async () => {
            try {
              await resendCode()
              setCooldown(30)
              toast({ tone: 'success', message: 'New code sent' })
            } catch (e) {
              toast({ tone: 'error', message: e instanceof ApiError ? e.message : 'Couldn’t resend code' })
            }
          }}
        >
          {cooldown > 0 ? `Resend code in 0:${String(cooldown).padStart(2, '0')}` : 'Resend code'}
        </Button>
      </div>
    </AuthLayout>
  )
}

/* ==========================================================================
   Forgot password
   ========================================================================== */

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = validateVitEmail(email)
    setError(err)
    if (err) return
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout top={<div className="auth__inner" style={{ flex: 'none', paddingBottom: 0, paddingTop: 8 }}><BackButton to="/login" /></div>}>
      {sent ? (
        <div className="stack gap-4" style={{ paddingTop: 24 }}>
          <div className="state__art state__art--success">
            <MailCheck />
          </div>
          <h1 className="t-h1">Check your inbox</h1>
          <p className="t-body t-muted">
            If an account exists for <strong style={{ color: 'var(--ink-900)' }}>{email}</strong>, you’ll get a link to reset your password in a few minutes.
          </p>
          <TestModeBadge>Test mode · no email is sent</TestModeBadge>
          <Link to="/login" className="btn btn--secondary btn--lg btn--block" style={{ marginTop: 8 }}>
            Back to login
          </Link>
        </div>
      ) : (
        <>
          <div className="auth__title">
            <h1 className="t-h1">Reset your password</h1>
            <p className="t-body t-muted">Enter your VIT email and we’ll send you a reset link.</p>
          </div>
          <form className="stack gap-4" onSubmit={submit} noValidate>
            <Field label="VIT email" type="email" autoComplete="email" placeholder={`name.surname2023@${VIT_EMAIL_DOMAIN}`} leading={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
            <Button type="submit" size="lg" block loading={loading} trailing={<ArrowRight />}>
              Send reset link
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}

/** Dev helper used by the states gallery: drop any pending verification. */
export function clearPendingVerification() {
  update((d) => void (d.pendingVerification = null))
}
