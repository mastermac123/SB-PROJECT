import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.TOMTOM_KEY = 'tt_test'
process.env.OLA_MAPS_KEY = ''
process.env.MAPPLS_KEY = ''

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const { run } = await import('../db')
const { accuracy, factorFor, recordDrop, recordPickup, resetFactors, slotOf } = await import('../calibrate')
const { getRoute } = await import('../routing')

const tomtom = (minutes: number, extra: Record<string, number> = {}) =>
  vi.fn(async (u: unknown) =>
    String(u).includes('api.tomtom.com/routing')
      ? new Response(JSON.stringify({ routes: [{ summary: { lengthInMeters: 15000, travelTimeInSeconds: minutes * 60, noTrafficTravelTimeInSeconds: 18 * 60, ...extra }, legs: [{ points: [{ latitude: 19.12, longitude: 72.85 }, { latitude: 19.02, longitude: 72.87 }] }] }] }))
      : new Response('{}', { status: 404 }),
  ) as typeof fetch

describe('Learning how accurate each traffic source is', () => {
  it('uses TomTom’s typical-traffic time when it is slower than its live time', async () => {
    globalThis.fetch = tomtom(20, { historicTrafficTravelTimeInSeconds: 48 * 60 })
    const r = await getRoute({ lat: 19.1197, lng: 72.8468 }, { lat: 19.0222, lng: 72.8711 })
    expect(r.durationMin).toBeGreaterThanOrEqual(48)
  })

  it('records pickup predictions and real drop times, then corrects TomTom by what real trips took', async () => {
    globalThis.fetch = tomtom(20)
    const now = new Date()
    for (let i = 0; i < 8; i++) {
      await recordPickup(`b${i}`, { lat: 19.1197, lng: 72.8468 }, { lat: 19.0222, lng: 72.8711 }, 20)
      // The trip really took 40 minutes.
      run(`UPDATE eta_samples SET started_at = ? WHERE booking_id = ?`, new Date(Date.now() - 40 * 60_000).toISOString(), `b${i}`)
      recordDrop(`b${i}`)
    }
    resetFactors()
    expect(factorFor('tomtom', now)).toBeCloseTo(2, 1)
    expect(slotOf(now)).toMatch(/^(weekday|saturday|sunday):(rush|day|evening|night)$/)
    const acc = accuracy()
    expect(acc.trips).toBe(8)
    expect(acc.tomtomErrorMin).toBe(20)

    // A new trip: TomTom still says 20 → RideSync now shows ~40 (calibrated, no typical-speed rule).
    const r = await getRoute({ lat: 19.12, lng: 72.85 }, { lat: 19.03, lng: 72.86 })
    expect(r.durationMin).toBe(40)
  })
})
