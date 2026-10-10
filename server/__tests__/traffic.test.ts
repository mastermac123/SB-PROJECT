import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.DEV_LOGIN = 'true'
process.env.TOMTOM_KEY = 'tt_test'
process.env.OSRM_URL = 'http://127.0.0.1:9'

let app: Parameters<typeof request>[0]
const H = { 'x-ridesync': '1' }
const realFetch = globalThis.fetch
const urls: string[] = []

beforeAll(async () => {
  globalThis.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u)
    if (!url.startsWith('https://api.tomtom.com')) return realFetch(u as string, init)
    urls.push(url)
    if (url.includes('/routing/1/calculateRoute/')) {
      return new Response(
        JSON.stringify({
          routes: [
            {
              summary: { lengthInMeters: 12_400, travelTimeInSeconds: 2400, trafficDelayInSeconds: 720, noTrafficTravelTimeInSeconds: 1680 },
              legs: [{ points: [{ latitude: 19.02, longitude: 72.87 }, { latitude: 19.05, longitude: 72.86 }, { latitude: 19.08, longitude: 72.855 }, { latitude: 19.1, longitude: 72.85 }] }],
              sections: [
                { sectionType: 'TRAVEL_MODE', startPointIndex: 0, endPointIndex: 3 },
                { sectionType: 'TRAFFIC', startPointIndex: 1, endPointIndex: 2, magnitudeOfDelay: 2, simpleCategory: 'JAM' },
                { sectionType: 'TRAFFIC', startPointIndex: 2, endPointIndex: 3, magnitudeOfDelay: 4, simpleCategory: 'ROAD_CLOSURE' },
              ],
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.includes('/traffic/map/4/tile/flow/')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  app = (await import('../app')).createApp()
})
afterEach(() => {
  urls.length = 0
})

describe('Live traffic (TomTom)', () => {
  it('returns a traffic-aware ETA with the delay and level', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/dev').set(H).send({ email: 'traffic.a@vit.edu.in' })
    const r = await agent.get('/api/eta').query({ fromLat: 19.0222, fromLng: 72.8711, toLat: 19.1868, toLng: 72.8484 })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ durationMin: 40, trafficDelayMin: 12, traffic: 'heavy', source: 'tomtom', distanceKm: 12.4 })
    expect(urls[0]).toContain('traffic=true')
    expect(urls[0]).toContain('sectionType=traffic')
    // Asking for the route too returns it with the slow stretches, for Google-style colouring.
    const withRoute = await agent.get('/api/eta').query({ fromLat: 19.0222, fromLng: 72.8711, toLat: 19.1868, toLng: 72.8484, route: 1 })
    expect(withRoute.body.coords).toHaveLength(4)
    expect(withRoute.body.segments).toEqual([
      { from: 1, to: 2, level: 'heavy' },
      { from: 2, to: 3, level: 'severe' },
    ])
    // Reused for a couple of minutes instead of calling TomTom again.
    expect(urls.length).toBe(1)
  })

  it('needs a login for ETAs', async () => {
    expect((await request(app).get('/api/eta').query({ fromLat: 1, fromLng: 1, toLat: 2, toLng: 2 })).status).toBe(401)
  })

  it('serves traffic tiles without exposing the key, and advertises the layer', async () => {
    const t = await request(app).get('/api/traffic/14/11520/7330.png')
    expect(t.status).toBe(200)
    expect(t.headers['content-type']).toBe('image/png')
    expect((await request(app).get('/api/traffic/3/1/1.png')).status).toBe(404)
    const cfg = (await request(app).get('/api/config')).body
    expect(cfg.maps).toMatchObject({ traffic: true, routing: 'tomtom' })
    expect(JSON.stringify(cfg)).not.toContain('tt_test')
  })
})
