import type { Place } from '../src/lib/types'
import { CAMPUS } from '../src/data/places'
import { env } from './env'
import { googleAutocomplete, googleConfigured, googlePlaceDetails, googleReverse } from './google'

/**
 * Map services. Everything works without keys (OpenStreetMap / CARTO / OSRM);
 * add free keys for production-grade reliability:
 *   MAPTILER_KEY  → map tiles + place search   (maptiler.com, free tier)
 *   ORS_API_KEY   → driving routes             (openrouteservice.org, free tier)
 *   GOOGLE_MAPS_API_KEY → Google map, search, place names and routes (takes priority)
 * If Google fails (quota, bad key), the free services are used instead.
 */

export function mapsConfig() {
  const google = googleConfigured()
  return {
    google: google && env.google.display && env.google.browserKey ? { browserKey: env.google.browserKey } : null,
    tiles: env.maptilerKey
      ? {
          url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key=${env.maptilerKey}`,
          attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }
      : {
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        },
    search: google ? 'google' : env.maptilerKey ? 'maptiler' : 'openstreetmap',
    routing: google ? 'google' : env.orsKey ? 'openrouteservice' : 'osrm',
  }
}

const cache = new Map<string, { at: number; places: Place[] }>()
const UA = 'RideSync/1.0 (college carpooling app)'
// Mumbai metropolitan region, biased to campus.
const BBOX = '72.6,18.8,73.3,19.5'

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en', ...headers } })
    if (!res.ok) throw new Error(`maps ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

type MTFeature = { id: string; text: string; place_name: string; center: [number, number] }
type NomRow = { place_id: number; lat: string; lon: string; name?: string; display_name: string }

const short = (full: string, name: string) =>
  full
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== name)
    .slice(0, 2)
    .join(', ')

export async function searchPlaces(q: string, sessionToken?: string): Promise<Place[]> {
  const key = q.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 3600_000) return hit.places
  let places: Place[] = []
  if (googleConfigured()) {
    try {
      places = await googleAutocomplete(q, sessionToken)
      cache.set(key, { at: Date.now(), places })
      return places
    } catch (e) {
      console.error('[ridesync] Google place search failed, using OpenStreetMap', (e as Error).message)
    }
  }
  try {
    if (env.maptilerKey) {
      const data = await getJson<{ features: MTFeature[] }>(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${env.maptilerKey}&country=in&bbox=${BBOX}&proximity=${CAMPUS.lng},${CAMPUS.lat}&limit=6&language=en`,
      )
      places = data.features.map((f) => ({ id: `mt-${f.id}`, name: f.text, area: short(f.place_name, f.text), lat: f.center[1], lng: f.center[0], kind: 'custom' as const }))
    } else {
      const rows = await getJson<NomRow[]>(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&viewbox=${BBOX}&bounded=1&q=${encodeURIComponent(q)}`)
      places = rows.map((r) => {
        const name = r.name || r.display_name.split(',')[0]
        return { id: `osm-${r.place_id}`, name, area: short(r.display_name, name), lat: Number(r.lat), lng: Number(r.lon), kind: 'custom' as const }
      })
    }
  } catch (e) {
    console.error('[ridesync] place search failed', (e as Error).message)
    return []
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, { at: Date.now(), places })
  return places
}

/** Coordinates for a Google suggestion the student picked. */
export async function resolvePlace(placeId: string, sessionToken?: string): Promise<Place> {
  return googlePlaceDetails(placeId, sessionToken)
}

/** Human-readable name for coordinates ("Current location" → "Near Dadar TT Circle"). */
export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; area: string } | null> {
  if (googleConfigured()) {
    try {
      const r = await googleReverse(lat, lng)
      if (r) return r
    } catch (e) {
      console.error('[ridesync] Google place name failed, using OpenStreetMap', (e as Error).message)
    }
  }
  try {
    if (env.maptilerKey) {
      const data = await getJson<{ features: MTFeature[] }>(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${env.maptilerKey}&limit=1&language=en`)
      const f = data.features[0]
      return f ? { name: f.text, area: short(f.place_name, f.text) } : null
    }
    const r = await getJson<{ name?: string; display_name?: string; address?: Record<string, string> }>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`,
    )
    if (!r.display_name) return null
    const a = r.address ?? {}
    const name = r.name || a.road || a.neighbourhood || a.suburb || r.display_name.split(',')[0]
    return { name, area: [a.suburb || a.neighbourhood, a.city || a.town].filter(Boolean).join(', ') }
  } catch {
    return null
  }
}
