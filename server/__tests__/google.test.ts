import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.CITY_SPEED_FLOOR = 'off'
process.env.DEV_LOGIN = 'true'
process.env.OSRM_URL = 'http://127.0.0.1:9'
process.env.GOOGLE_MAPS_API_KEY = 'AIza-test-key'

let app: Parameters<typeof request>[0]
const H = { 'x-ridesync': '1' }
const realFetch = globalThis.fetch

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> }
let calls: Call[] = []
let googleDown = false
function mockGoogle() {
  calls = []
  globalThis.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u)
    if (!/googleapis\.com/.test(url)) return new Response('{}', { status: 503 })
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body ?? '{}')) })
    if (googleDown) return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })
    if (url.endsWith('places:autocomplete'))
      return Response.json({
        suggestions: [
          { placePrediction: { placeId: 'ChIJdadarTT0000', text: { text: 'Dadar TT Circle, Mumbai' }, structuredFormat: { mainText: { text: 'Dadar TT Circle' }, secondaryText: { text: 'Dadar East, Mumbai, Maharashtra' } } } },
        ],
      })
    if (url.includes('places.googleapis.com/v1/places/'))
      return Response.json({ id: 'ChIJdadarTT0000', displayName: { text: 'Dadar TT Circle' }, formattedAddress: 'Dadar TT Circle, Dadar East, Mumbai, Maharashtra 400014, India', location: { latitude: 19.0176, longitude: 72.8562 } })
    if (url.includes('geocode/json'))
      return Response.json({
        status: 'OK',
        results: [{ formatted_address: 'Antop Hill, Wadala, Mumbai', address_components: [{ long_name: 'Antop Hill Road', short_name: 'x', types: ['route'] }, { long_name: 'Wadala', short_name: 'x', types: ['sublocality_level_1', 'sublocality'] }, { long_name: 'Mumbai', short_name: 'x', types: ['locality'] }] }],
      })
    if (url.includes('computeRoutes')) return Response.json({ routes: [{ distanceMeters: 12_400, duration: '1860s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }] })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}
afterEach(() => {
  globalThis.fetch = realFetch
  googleDown = false
})

beforeAll(async () => {
  app = (await import('../app')).createApp()
})

async function student(email: string) {
  const agent = request.agent(app)
  await agent.post('/api/auth/dev').set(H).send({ email })
  return agent
}

describe('Google Maps', () => {
  it('decodes Google encoded polylines', async () => {
    const { decodePolyline } = await import('../google')
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ])
  })

  it('tells the browser to use the Google map', async () => {
    const res = await request(app).get('/api/config')
    expect(res.body.maps.google).toEqual({ browserKey: 'AIza-test-key' })
    expect(res.body.maps.search).toBe('google')
    expect(res.body.maps.routing).toBe('google')
  })

  it('searches with autocomplete and resolves the pick in the same session', async () => {
    const a = await student('g.search@vit.edu.in')
    mockGoogle()
    const s = '0b7f3c1e-1111-4222-8333-944455556666'
    const list = await a.get(`/api/places?q=dadar%20tt&s=${s}`)
    expect(list.status).toBe(200)
    expect(list.body[0]).toMatchObject({ name: 'Dadar TT Circle', googlePlaceId: 'ChIJdadarTT0000' })
    expect(calls[0].headers['X-Goog-Api-Key']).toBe('AIza-test-key')
    expect(calls[0].body).toMatchObject({ sessionToken: s, includedRegionCodes: ['in'] })

    const place = await a.get(`/api/places/resolve?id=ChIJdadarTT0000&s=${s}`)
    expect(place.status).toBe(200)
    expect(place.body).toMatchObject({ name: 'Dadar TT Circle', lat: 19.0176, lng: 72.8562, area: 'Dadar East, Mumbai' })
    expect(calls[1].url).toContain(`sessionToken=${s}`)
    expect(calls[1].headers['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location')
  })

  it('rejects malformed place ids', async () => {
    const a = await student('g.bad@vit.edu.in')
    mockGoogle()
    expect((await a.get('/api/places/resolve?id=../../x')).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('names the current location with Google geocoding', async () => {
    const a = await student('g.reverse@vit.edu.in')
    mockGoogle()
    const res = await a.get('/api/places/reverse?lat=19.03&lng=72.87')
    expect(res.body).toEqual({ name: 'Antop Hill Road', area: 'Wadala, Mumbai' })
  })

  it('uses Google routes for ride routes', async () => {
    const a = await student('g.route@vit.edu.in')
    mockGoogle()
    const res = await a
      .post('/api/route')
      .set(H)
      .send({ from: { id: 'a', name: 'A', area: '', lat: 19.0, lng: 72.8 }, to: { id: 'b', name: 'B', area: '', lat: 19.1, lng: 72.9 } })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ source: 'google', distanceKm: 12.4, durationMin: 31 })
    expect(calls[0].headers['X-Goog-FieldMask']).toContain('routes.polyline.encodedPolyline')
  })

  it('falls back to an estimate when Google is down', async () => {
    const a = await student('g.down@vit.edu.in')
    mockGoogle()
    googleDown = true
    const res = await a
      .post('/api/route')
      .set(H)
      .send({ from: { id: 'a', name: 'A', area: '', lat: 19.2, lng: 72.8 }, to: { id: 'b', name: 'B', area: '', lat: 19.3, lng: 72.9 } })
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('estimate')
  })
})
