import { env } from './env'

/**
 * Mappls (MapmyIndia) driving time with live Indian traffic — free plan, REST key from
 * apis.mappls.com (MAPPLS_KEY). Mappls offers a few routing resources; we try the
 * traffic-aware ones first and remember whichever works for this key.
 */

export const mapplsConfigured = () => !!env.mapplsKey

const RESOURCES = ['route_traffic', 'route_eta', 'route_adv'] as const
let working: (typeof RESOURCES)[number] | null = null

type MapplsResponse = { code?: string; routes?: { duration?: number; distance?: number }[] }

async function ask(resource: string, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const url = `https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(env.mapplsKey)}/${resource}/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&steps=false&alternatives=false`
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`mappls ${resource} ${res.status}`)
  const r = ((await res.json()) as MapplsResponse).routes?.[0]
  if (!r?.duration || !r.distance) throw new Error(`mappls ${resource}: no route`)
  return { durationMin: Math.max(1, Math.round(r.duration / 60)), distanceKm: r.distance / 1000 }
}

export async function mapplsDirections(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<{ durationMin: number; distanceKm: number } | null> {
  if (!env.mapplsKey) return null
  for (const resource of working ? [working] : RESOURCES) {
    try {
      const r = await ask(resource, a, b)
      working = resource
      return r
    } catch (e) {
      if (working) {
        working = null // the key's access may have changed: try them all next time
        console.error('[ridesync] Mappls routing failed', (e as Error).message)
        return null
      }
    }
  }
  console.error('[ridesync] Mappls routing failed for every resource — check MAPPLS_KEY')
  return null
}

/** Startup check: which Mappls routing resource this key can use. */
export async function checkMappls(): Promise<string | null> {
  if (!env.mapplsKey) return null
  const r = await mapplsDirections({ lat: 19.0222, lng: 72.8711 }, { lat: 19.0176, lng: 72.8562 })
  return r ? working : ''
}
