import { env } from './env'

/**
 * Mappls (MapmyIndia) driving time with live Indian traffic.
 *
 * Mappls accounts come with different credentials, and each works on different addresses:
 *   MAPPLS_KEY                                  → "Static key" / "REST API key"
 *   MAPPLS_CLIENT_ID + MAPPLS_CLIENT_SECRET     → OAuth "Client ID / Client Secret" (newer accounts)
 * We try every known combination once, remember the one that answers, and use it from then on.
 */

export const mapplsConfigured = () => !!(env.mapplsKey || (env.mapplsClientId && env.mapplsClientSecret))

const RESOURCES = ['route_traffic', 'route_eta', 'route_adv'] as const
export const MAPPLS_TOKEN_URL = 'https://outpost.mappls.com/api/security/oauth/token'

type P = { lat: number; lng: number }
type Way = { name: string; url: (cred: string, resource: string, a: P, b: P) => string; cred: 'key' | 'token' }
const coords = (a: P, b: P) => `${a.lng},${a.lat};${b.lng},${b.lat}`
const opts = 'overview=false&steps=false&alternatives=false&region=ind'

export const WAYS: Way[] = [
  { name: 'static key in path', cred: 'key', url: (k, r, a, b) => `https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(k)}/${r}/driving/${coords(a, b)}?${opts}` },
  { name: 'static key as access_token', cred: 'key', url: (k, r, a, b) => `https://route.mappls.com/route/direction/${r}/driving/${coords(a, b)}?${opts}&access_token=${encodeURIComponent(k)}` },
  { name: 'OAuth token', cred: 'token', url: (t, r, a, b) => `https://route.mappls.com/route/direction/${r}/driving/${coords(a, b)}?${opts}&access_token=${encodeURIComponent(t)}` },
  { name: 'OAuth token in path', cred: 'token', url: (t, r, a, b) => `https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(t)}/${r}/driving/${coords(a, b)}?${opts}` },
]

let token: { value: string; until: number } | null = null
async function oauthToken(): Promise<string | null> {
  if (!env.mapplsClientId || !env.mapplsClientSecret) return null
  if (token && Date.now() < token.until) return token.value
  const res = await fetch(MAPPLS_TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(6000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.mapplsClientId, client_secret: env.mapplsClientSecret }),
  })
  if (!res.ok) throw new Error(`mappls token ${res.status}`)
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new Error('mappls token: none returned')
  token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000 }
  return token.value
}

type MapplsResponse = { code?: string; routes?: { duration?: number; distance?: number }[] }
let working: { way: Way; resource: string } | null = null

async function ask(way: Way, resource: string, a: P, b: P) {
  const cred = way.cred === 'key' ? env.mapplsKey : await oauthToken()
  if (!cred) throw new Error('no credential')
  const res = await fetch(way.url(cred, resource, a, b), { signal: AbortSignal.timeout(6000) })
  if (res.status === 401) token = null
  if (!res.ok) throw new Error(`mappls ${way.name} ${resource} ${res.status}`)
  const r = ((await res.json()) as MapplsResponse).routes?.[0]
  if (!r?.duration || !r.distance) throw new Error(`mappls ${way.name} ${resource}: no route`)
  return { durationMin: Math.max(1, Math.round(r.duration / 60)), distanceKm: r.distance / 1000 }
}

let pausedUntil = 0
export async function mapplsDirections(a: P, b: P): Promise<{ durationMin: number; distanceKm: number } | null> {
  if (!mapplsConfigured() || Date.now() < pausedUntil) return null
  if (working) {
    try {
      return await ask(working.way, working.resource, a, b)
    } catch (e) {
      console.error('[ridesync] Mappls routing failed', (e as Error).message)
      working = null
      return null
    }
  }
  for (const way of WAYS)
    for (const resource of RESOURCES) {
      try {
        const r = await ask(way, resource, a, b)
        working = { way, resource }
        return r
      } catch {
        /* try the next */
      }
    }
  // Nothing worked: don't slow every trip down — try again in 10 minutes.
  pausedUntil = Date.now() + 10 * 60_000
  console.error('[ridesync] Mappls didn’t accept the saved credentials — run mappls.bat to see why')
  return null
}

/** Test hook. */
export const resetMappls = () => {
  working = null
  token = null
  pausedUntil = 0
}

/** Startup check: '' = rejected, null = not set up, otherwise how it connected. */
export async function checkMappls(): Promise<string | null> {
  if (!mapplsConfigured()) return null
  const r = await mapplsDirections({ lat: 19.0222, lng: 72.8711 }, { lat: 19.0176, lng: 72.8562 })
  return r && working ? `${working.resource}, ${working.way.name}` : ''
}
