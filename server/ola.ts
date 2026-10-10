import { env } from './env'

/**
 * Ola Maps sign-in. Two ways, whichever the account gives:
 *   OLA_MAPS_KEY                       → "API Key" from the project (sent as ?api_key=)
 *   OLA_CLIENT_ID + OLA_CLIENT_SECRET  → OAuth "Client credentials" (sent as a Bearer token)
 * When Ola says 401/403 we stop calling it for 10 minutes and say so once, so a bad key
 * never slows RideSync down — TomTom / OpenStreetMap take over.
 */

export const OLA_TOKEN_URL = 'https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token'
export const olaHasKey = () => !!env.olaKey
export const olaHasOAuth = () => !!(env.olaClientId && env.olaClientSecret)

let pausedUntil = 0
let token: { value: string; until: number } | null = null

export const olaReady = () => (olaHasKey() || olaHasOAuth()) && Date.now() >= pausedUntil

/** Test hook. */
export const resetOla = () => {
  pausedUntil = 0
  token = null
}

async function bearer(): Promise<string> {
  if (token && Date.now() < token.until) return token.value
  const res = await fetch(OLA_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(6000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'openid', client_id: env.olaClientId, client_secret: env.olaClientSecret }),
  })
  if (!res.ok) throw new OlaAuthError(res.status, 'sign-in with Client ID/Secret')
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new OlaAuthError(401, 'sign-in with Client ID/Secret')
  token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 60) * 1000 }
  return token.value
}

export class OlaAuthError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`Ola Maps ${status} on ${what}`)
  }
}

/** fetch() to api.olamaps.io with whichever sign-in is set up. */
export async function olaFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!olaReady()) throw new Error('Ola Maps off')
  const headers = new Headers(init.headers)
  headers.set('X-Request-Id', `ridesync-${Date.now()}`)
  let u = url
  if (olaHasKey()) u += `${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(env.olaKey)}`
  else headers.set('Authorization', `Bearer ${await bearer().catch(pause)}`)
  const res = await fetch(u, { signal: AbortSignal.timeout(6000), ...init, headers })
  if (res.status === 401 || res.status === 403) {
    token = null
    pause(new OlaAuthError(res.status, new URL(url).pathname.split('/').slice(1, 3).join(' ')))
  }
  if (!res.ok) throw new Error(`api.olamaps.io ${res.status}`)
  return res
}

function pause(e: unknown): never {
  const first = Date.now() >= pausedUntil
  pausedUntil = Date.now() + 10 * 60_000
  if (first) console.warn(`[ridesync] ${(e as Error).message} — Ola Maps is rejecting the key. Using TomTom/OpenStreetMap instead for 10 min. Run ola.bat to fix or remove it.`)
  throw e
}
