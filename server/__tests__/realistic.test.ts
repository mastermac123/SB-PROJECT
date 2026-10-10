import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.TOMTOM_KEY = 'tt_test'
process.env.OLA_MAPS_KEY = 'ola_test'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const { getRoute, cityFloorMin } = await import('../routing')

describe('Realistic Mumbai trip times', () => {
  it('uses Ola Maps when it says the trip is slower than TomTom', async () => {
    globalThis.fetch = vi.fn(async (u: unknown) => {
      const url = String(u)
      if (url.includes('api.tomtom.com/routing'))
        return new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 3000, travelTimeInSeconds: 240, trafficDelayInSeconds: 0, noTrafficTravelTimeInSeconds: 240 }, legs: [{ points: [{ latitude: 19.02, longitude: 72.87 }, { latitude: 19.04, longitude: 72.86 }] }] }] }))
      if (url.includes('api.olamaps.io/routing/v1/directions')) return new Response(JSON.stringify({ routes: [{ legs: [{ duration: 780, distance: 3100 }] }] }))
      return new Response('{}', { status: 404 })
    }) as typeof fetch
    const r = await getRoute({ lat: 19.0222, lng: 72.8711 }, { lat: 19.0375, lng: 72.8642 })
    expect(r.durationMin).toBeGreaterThanOrEqual(13)
    expect(r.trafficDelayMin).toBeGreaterThanOrEqual(9)
    expect(r.traffic).toBe('heavy')
  })

  it('never promises faster than city traffic allows', () => {
    // 3 km: at least ~6 min even at night, ~13 min in the evening rush.
    expect(cityFloorMin(3, new Date('2026-10-10T03:00:00+05:30'))).toBeGreaterThanOrEqual(6)
    expect(cityFloorMin(3, new Date('2026-10-10T18:30:00+05:30'))).toBe(13)
    expect(cityFloorMin(3, new Date('2026-10-10T12:00:00+05:30'))).toBe(10)
  })
})
