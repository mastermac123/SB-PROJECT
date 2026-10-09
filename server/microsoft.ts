import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { isCollegeEmail } from '../src/lib/validation'
import { startSession, upsertUser } from './auth'
import { env } from './env'
import { HttpError } from './logic'

/**
 * Sign in with Microsoft (Entra ID / Microsoft 365) — authorization-code flow
 * with PKCE, done on the server so it works the same on phones and laptops.
 *
 * Only accounts from the college's own Microsoft tenant are accepted: we look
 * up the tenant that owns ALLOWED_EMAIL_DOMAIN and require the ID token's
 * `tid` to match, in addition to the email domain check.
 */

const LOGIN = 'https://login.microsoftonline.com'
let jwks: Parameters<typeof jwtVerify>[1] = createRemoteJWKSet(new URL(`${LOGIN}/common/discovery/v2.0/keys`))

/** Tests only: verify tokens against local keys instead of Microsoft's. */
export const __setJwksForTests = (k: typeof jwks) => void (jwks = k)
const b64url = (b: Buffer) => b.toString('base64url')

let tenantCache: { id: string; at: number } | null = env.microsoft.tenantId ? { id: env.microsoft.tenantId, at: Infinity } : null

/** Tenant ID of the Microsoft directory that owns the college domain. */
export async function collegeTenantId(): Promise<string> {
  if (tenantCache && Date.now() - tenantCache.at < 24 * 3600_000) return tenantCache.id
  const res = await fetch(`${LOGIN}/${env.allowedDomain}/v2.0/.well-known/openid-configuration`)
  if (!res.ok) throw new HttpError(502, `Couldn’t find a Microsoft directory for @${env.allowedDomain}.`)
  const { issuer } = (await res.json()) as { issuer: string }
  const id = issuer.match(/[0-9a-f-]{36}/i)?.[0]
  if (!id) throw new HttpError(502, 'Unexpected response from Microsoft.')
  tenantCache = { id, at: Date.now() }
  return id
}

// Pending sign-ins (state → PKCE verifier, nonce, return path). Short-lived and single-use.
const pending = new Map<string, { verifier: string; nonce: string; from: string; at: number; app: boolean }>()

/**
 * The Android/iOS app signs in through the phone's browser and comes back to
 * ridesync://auth?code=… with a one-time code (valid 2 minutes), which it swaps
 * for its login token at POST /api/auth/app/exchange. The token itself never
 * appears in a URL.
 */
const APP_RETURN = 'ridesync://auth'
const handoffs = new Map<string, { userId: string; isNew: boolean; at: number }>()

export function takeHandoff(code: string) {
  const h = handoffs.get(code)
  handoffs.delete(code)
  if (!h || Date.now() - h.at > 2 * 60_000) return null
  return h
}
setInterval(() => {
  for (const [k, v] of pending) if (Date.now() - v.at > 10 * 60_000) pending.delete(k)
  for (const [k, v] of handoffs) if (Date.now() - v.at > 2 * 60_000) handoffs.delete(k)
}, 60_000).unref()

function baseUrl(req: Request) {
  return env.publicUrl || `${req.protocol}://${req.get('host')}`
}
const redirectUri = (req: Request) => `${baseUrl(req)}/api/auth/microsoft/callback`
const safeFrom = (v: unknown) => (typeof v === 'string' && /^\/[a-z0-9/_-]*$/i.test(v) ? v : '/')

export async function microsoftStart(req: Request, res: Response) {
  const tenant = await collegeTenantId()
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const nonce = b64url(randomBytes(24))
  pending.set(state, { verifier, nonce, from: safeFrom(req.query.from), at: Date.now(), app: req.query.app === '1' })
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    domain_hint: env.allowedDomain,
    prompt: 'select_account',
  })
  res.redirect(`${LOGIN}/${tenant}/oauth2/v2.0/authorize?${params}`)
}

export async function microsoftCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>
  const forApp = !!(state && pending.get(state)?.app)
  const fail = (msg: string) => res.redirect(forApp ? `${APP_RETURN}?error=${encodeURIComponent(msg)}` : `/login?error=${encodeURIComponent(msg)}`)
  if (error) {
    if (error === 'access_denied' || error === 'consent_required' || /AADSTS65001|AADSTS90094/.test(error_description ?? ''))
      return fail('Your college account needs IT admin approval for RideSync. Use the email code option meanwhile.')
    return fail('Microsoft sign-in was cancelled.')
  }
  const p = state ? pending.get(state) : undefined
  if (!code || !state || !p) return fail('Sign-in expired. Please try again.')
  pending.delete(state)

  try {
    const tenant = await collegeTenantId()
    const tokenRes = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.microsoft.clientId,
        client_secret: env.microsoft.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(req),
        code_verifier: p.verifier,
        scope: 'openid profile email',
      }),
    })
    const tokens = (await tokenRes.json()) as { id_token?: string; error_description?: string }
    if (!tokenRes.ok || !tokens.id_token) {
      console.error('[ridesync] microsoft token error', tokens.error_description)
      return fail('Microsoft sign-in failed. Please try again.')
    }
    const { payload } = await jwtVerify(tokens.id_token, jwks, { audience: env.microsoft.clientId, issuer: `${LOGIN}/${tenant}/v2.0` })
    if (payload.nonce !== p.nonce) return fail('Sign-in check failed. Please try again.')
    if (payload.tid !== tenant) return fail(`Use your @${env.allowedDomain} college Microsoft account.`)
    const email = String(payload.email || payload.preferred_username || payload.upn || '').toLowerCase()
    if (!isCollegeEmail(email, env.allowedDomain)) return fail(`Use your @${env.allowedDomain} college account.`)

    const { user, isNew } = upsertUser(email, { name: typeof payload.name === 'string' ? payload.name : undefined })
    if (p.app) {
      const handoff = b64url(randomBytes(24))
      handoffs.set(handoff, { userId: String(user.id), isNew, at: Date.now() })
      return res.redirect(`${APP_RETURN}?code=${handoff}`)
    }
    startSession(res, String(user.id))
    res.redirect(Number(user.onboarded) ? p.from : '/onboarding')
  } catch (e) {
    if (e instanceof HttpError) return fail(e.message)
    console.error('[ridesync] microsoft sign-in error', e)
    return fail('Microsoft sign-in failed. Please try again.')
  }
}
