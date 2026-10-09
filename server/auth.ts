import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { isCollegeEmail } from '../src/lib/validation'
import { one, run, type Row } from './db'
import { env, anyMailConfigured } from './env'
import { HttpError, newId, notify, nowIso } from './logic'
import { sendLoginCode } from './mail'

const COOKIE = 'rs_session'
const SESSION_DAYS = env.sessionDays
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

declare module 'express-serve-static-core' {
  interface Request {
    user?: Row
  }
}

/* ---- Sessions ------------------------------------------------------------ */

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/** The Android/iOS app sends this header; it keeps its login token on the phone instead of in a cookie. */
export const isAppClient = (req: Request) => req.get('x-ridesync-app') === '1'

/**
 * Creates a login. The website gets an httpOnly cookie; the app gets the token
 * back (returned here) and sends it as `Authorization: Bearer …`.
 */
export function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  run(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`, sha(token), userId, nowIso(), expires.toISOString())
  if (!isAppClient(res.req)) res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, expires, path: '/' })
  return token
}

function sessionToken(req: Request) {
  const auth = req.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  // EventSource can't send headers, so the app passes its token on the live-updates stream only.
  if (req.path === '/events' && typeof req.query.token === 'string') return req.query.token
  return readCookie(req, COOKIE)
}

export function endSession(req: Request, res: Response) {
  const token = sessionToken(req)
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, sha(token))
  res.clearCookie(COOKIE, { path: '/' })
}

/** Attaches req.user when the session cookie or app token is valid. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = sessionToken(req)
  if (token) {
    const s = one(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`, sha(token))
    if (s && new Date(String(s.expires_at)) > new Date()) {
      const u = one(`SELECT * FROM users WHERE id = ? AND deleted = 0`, s.user_id)
      if (u) req.user = u
    }
  }
  next()
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'))
  next()
}

/** Account must have finished onboarding (phone + student ID) before using rides. */
export function requireOnboarded(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'))
  if (!Number(req.user.onboarded)) return next(new HttpError(403, 'Finish setting up your profile first.'))
  next()
}

/* ---- Accounts ------------------------------------------------------------ */

function nameFromEmail(email: string) {
  return email
    .split('@')[0]
    .replace(/[0-9]+/g, ' ')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ')
    .trim()
}

/** Find or create the account for a verified college email. */
export function upsertUser(emailRaw: string, profile: { name?: string; photo?: string } = {}) {
  const email = emailRaw.trim().toLowerCase()
  if (!isCollegeEmail(email, env.allowedDomain)) throw new HttpError(403, `Only @${env.allowedDomain} college accounts can use RideSync.`)
  const existing = one(`SELECT * FROM users WHERE email = ?`, email)
  if (existing) {
    if (Number(existing.deleted)) throw new HttpError(403, 'This account was deleted. Contact support to restore it.')
    if (profile.photo && !existing.photo) run(`UPDATE users SET photo = ? WHERE id = ?`, profile.photo, existing.id)
    return { user: existing, isNew: false }
  }
  const id = newId('u')
  run(
    `INSERT INTO users (id, email, name, photo, created_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    email,
    (profile.name || nameFromEmail(email) || 'VIT Student').slice(0, 80),
    profile.photo ?? null,
    nowIso(),
  )
  notify(id, 'system', 'Welcome to RideSync', `Your @${env.allowedDomain} email is verified. You’re part of the VIT community on RideSync.`)
  return { user: one(`SELECT * FROM users WHERE id = ?`, id)!, isNew: true }
}

/* ---- Google -------------------------------------------------------------- */

const google = env.googleClientId ? new OAuth2Client(env.googleClientId) : null

export async function verifyGoogle(credential: string) {
  if (!google) throw new HttpError(503, 'Google sign-in isn’t configured on this server.')
  let payload
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: env.googleClientId })
    payload = ticket.getPayload()
  } catch {
    throw new HttpError(401, 'Google sign-in failed. Please try again.')
  }
  if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'Your Google account email isn’t verified.')
  if (!isCollegeEmail(payload.email, env.allowedDomain))
    throw new HttpError(403, `That’s ${payload.email}. Sign in with your @${env.allowedDomain} college Google account.`)
  return { email: payload.email, name: payload.name, photo: payload.picture }
}

/* ---- Email one-time codes ------------------------------------------------ */

const OTP_TTL_MIN = 10
const OTP_MAX_PER_HOUR = 5
const OTP_MAX_ATTEMPTS = 5
const ipHits = new Map<string, { n: number; since: number }>()

export const otpEnabled = () => anyMailConfigured() || !env.isProd

export async function requestCode(emailRaw: string, ip: string) {
  if (!otpEnabled()) throw new HttpError(503, 'Email login isn’t configured on this server. Use Google sign-in.')
  const email = emailRaw.trim().toLowerCase()
  if (!isCollegeEmail(email, env.allowedDomain)) throw new HttpError(403, `Only @${env.allowedDomain} college emails can use RideSync.`, 'email')

  const hit = ipHits.get(ip)
  const now = Date.now()
  if (hit && now - hit.since < 3600_000) {
    if (++hit.n > 20) throw new HttpError(429, 'Too many attempts from this network. Try again later.')
  } else ipHits.set(ip, { n: 1, since: now })

  const existing = one(`SELECT * FROM otp_codes WHERE email = ?`, email)
  let sent = 1
  let windowStart = nowIso()
  if (existing && now - new Date(String(existing.window_start)).getTime() < 3600_000) {
    sent = Number(existing.sent_count) + 1
    windowStart = String(existing.window_start)
    if (sent > OTP_MAX_PER_HOUR) throw new HttpError(429, 'Too many codes requested. Try again in an hour.', 'email')
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  run(
    `INSERT INTO otp_codes (email, code_hash, expires_at, attempts, sent_count, window_start) VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_count = excluded.sent_count, window_start = excluded.window_start`,
    email,
    sha(`${email}:${code}`),
    new Date(now + OTP_TTL_MIN * 60_000).toISOString(),
    sent,
    windowStart,
  )
  try {
    await sendLoginCode(email, code)
  } catch (e) {
    // Let the student request again right away once a sender is free.
    run(`UPDATE otp_codes SET sent_count = MAX(sent_count - 1, 0) WHERE email = ?`, email)
    if (e instanceof HttpError) throw e
    console.error('[ridesync] mail error', e)
    throw new HttpError(502, 'We couldn’t send the email. Try again in a minute.')
  }
}

export function verifyCode(emailRaw: string, code: string) {
  const email = emailRaw.trim().toLowerCase()
  const row = one(`SELECT * FROM otp_codes WHERE email = ?`, email)
  if (!row || new Date(String(row.expires_at)) < new Date()) throw new HttpError(400, 'This code has expired. Request a new one.', 'code')
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong attempts. Request a new code.', 'code')
  const ok = timingSafeEqual(Buffer.from(sha(`${email}:${code.trim()}`)), Buffer.from(String(row.code_hash)))
  if (!ok) {
    run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?`, email)
    throw new HttpError(400, 'That code isn’t right. Check the email and try again.', 'code')
  }
  run(`DELETE FROM otp_codes WHERE email = ?`, email)
  return email
}
