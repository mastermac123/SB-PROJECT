import type { LatLng, Place } from '../src/lib/types'
import { CAMPUS } from '../src/data/places'
import { env } from './env'

/**
 * Google Maps Platform (used when GOOGLE_MAPS_API_KEY is set).
 *   Places API (New)  → autocomplete + place details
 *   Geocoding API     → name for "Use current location"
 *   Routes API        → driving route, distance and time
 *
 * Search uses autocomplete sessions: the typing requests and the final pick share a
 * session token, so Google bills them as one Place Details call.
 */

export const googleConfigured = () => !!env.google.key

async function call<T>(url: string, init: { method?: string; body?: unknown; fieldMask?: string } = {}): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      signal: ctrl.signal,
      headers: {
        'X-Goog-Api-Key': env.google.key,
        ...(init.fieldMask ? { 'X-Goog-FieldMask': init.fieldMask } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } }
    if (!res.ok) throw new Error(`google ${res.status}${json.error?.message ? `: ${json.error.message}` : ''}`)
    return json
  } finally {
    clearTimeout(t)
  }
}

/* ---- Place search ------------------------------------------------------- */

type Prediction = {
  placePrediction?: {
    placeId: string
    text?: { text: string }
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
  }
}

/** Suggestions while typing. They carry a Google place id; coordinates come from resolvePlace(). */
export async function googleAutocomplete(input: string, sessionToken?: string): Promise<Place[]> {
  const data = await call<{ suggestions?: Prediction[] }>('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    body: {
      input,
      sessionToken,
      languageCode: 'en',
      includedRegionCodes: ['in'],
      // Mumbai region, centred on campus.
      locationBias: { circle: { center: { latitude: CAMPUS.lat, longitude: CAMPUS.lng }, radius: 50_000 } },
      origin: { latitude: CAMPUS.lat, longitude: CAMPUS.lng },
    },
  })
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<Prediction['placePrediction']> => !!p?.placeId)
    .slice(0, 6)
    .map((p) => ({
      id: `g-${p.placeId}`,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Place',
      area: p.structuredFormat?.secondaryText?.text?.split(',').slice(0, 2).join(',').trim() ?? '',
      lat: 0,
      lng: 0,
      kind: 'custom' as const,
      googlePlaceId: p.placeId,
    }))
}

/** Coordinates for a picked suggestion (ends the autocomplete session). */
export async function googlePlaceDetails(placeId: string, sessionToken?: string): Promise<Place> {
  const q = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en` : '?languageCode=en'
  const p = await call<{ id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${q}`,
    { fieldMask: 'id,displayName,formattedAddress,location' },
  )
  if (!p.location) throw new Error('google: place has no location')
  const name = p.displayName?.text ?? p.formattedAddress?.split(',')[0] ?? 'Place'
  const area = (p.formattedAddress ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== name && !/^\d{6}$/.test(s) && s !== 'India')
    .slice(0, 2)
    .join(', ')
  return { id: `g-${p.id}`, name, area, lat: p.location.latitude, lng: p.location.longitude, kind: 'custom' }
}

/* ---- Reverse geocoding --------------------------------------------------- */

type Component = { long_name: string; short_name: string; types: string[] }

export async function googleReverse(lat: number, lng: number): Promise<{ name: string; area: string } | null> {
  const data = await call<{ status: string; results?: { formatted_address: string; address_components: Component[] }[] }>(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${encodeURIComponent(env.google.key)}`,
  )
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(`google geocode ${data.status}`)
  const r = data.results?.[0]
  if (!r) return null
  const find = (...types: string[]) => r.address_components.find((c) => types.some((t) => c.types.includes(t)))?.long_name
  const name = find('premise', 'point_of_interest', 'establishment', 'route', 'sublocality_level_2', 'neighborhood') ?? r.formatted_address.split(',')[0]
  const area = [find('sublocality_level_1', 'sublocality'), find('locality')].filter((x) => x && x !== name).join(', ')
  return { name, area }
}

/* ---- Driving routes ------------------------------------------------------ */

/** Google's encoded polyline format → coordinates. */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = []
  let i = 0
  let lat = 0
  let lng = 0
  while (i < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0
      let shift = 0
      let b: number
      do {
        b = encoded.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20 && i < encoded.length)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return out
}

/**
 * Google route with live traffic: the time includes current traffic, and the slow / jammed
 * stretches come back as index ranges on the polyline (Google's own traffic colours).
 */
export async function googleRoute(a: LatLng, b: LatLng): Promise<{ coords: LatLng[]; distanceKm: number; durationMin: number; freeFlowMin: number; segments: { from: number; to: number; level: 'slow' | 'heavy' | 'severe' }[] }> {
  type Interval = { startPolylinePointIndex?: number; endPolylinePointIndex?: number; speed?: 'NORMAL' | 'SLOW' | 'TRAFFIC_JAM' }
  const data = await call<{ routes?: { distanceMeters?: number; duration?: string; staticDuration?: string; polyline?: { encodedPolyline?: string }; travelAdvisory?: { speedReadingIntervals?: Interval[] } }[] }>(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      fieldMask: 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.travelAdvisory.speedReadingIntervals',
      body: {
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        extraComputations: ['TRAFFIC_ON_POLYLINE'],
        languageCode: 'en',
        units: 'METRIC',
      },
    },
  )
  const r = data.routes?.[0]
  if (!r?.polyline?.encodedPolyline || r.distanceMeters == null) throw new Error('google: no route')
  const durationMin = Math.round(parseFloat(r.duration ?? '0') / 60)
  return {
    coords: decodePolyline(r.polyline.encodedPolyline),
    distanceKm: r.distanceMeters / 1000,
    durationMin,
    freeFlowMin: r.staticDuration ? Math.round(parseFloat(r.staticDuration) / 60) : durationMin,
    segments: (r.travelAdvisory?.speedReadingIntervals ?? [])
      .filter((i) => i.speed === 'SLOW' || i.speed === 'TRAFFIC_JAM')
      .map((i) => ({ from: i.startPolylinePointIndex ?? 0, to: i.endPolylinePointIndex ?? 0, level: i.speed === 'TRAFFIC_JAM' ? ('heavy' as const) : ('slow' as const) }))
      .filter((x) => x.to > x.from),
  }
}
