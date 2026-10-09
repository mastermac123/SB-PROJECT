import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.OLA_MAPS_KEY = 'ola_test'
process.env.TOMTOM_KEY = 'tt_test'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mock(handler: (url: string) => unknown) {
  const urls: string[] = []
  globalThis.fetch = vi.fn(async (u: unknown) => {
    const url = String(u)
    urls.push(url)
    const body = handler(url)
    return body === undefined ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  return urls
}

const { mapsConfig, reverseGeocode, searchPlaces } = await import('../maps')

describe('Building names for a dropped pin', () => {
  it('uses the nearest Ola Maps venue first', async () => {
    const urls = mock((u) =>
      u.includes('olamaps.io/places/v1/nearbysearch')
        ? { predictions: [
            { structured_formatting: { main_text: 'Far Mall', secondary_text: 'Wadala' }, distance_meters: 55 },
            { structured_formatting: { main_text: 'Shanti Niwas', secondary_text: 'Gokhale Road, Dadar West, Mumbai' }, distance_meters: 12 },
          ] }
        : undefined,
    )
    expect(await reverseGeocode(19.0211, 72.8422)).toEqual({ name: 'Shanti Niwas', area: 'Gokhale Road, Dadar West' })
    expect(urls[0]).toContain('api_key=ola_test')
    // Cached: dragging back to the same spot doesn't call again.
    await reverseGeocode(19.0211, 72.8422)
    expect(urls.length).toBe(1)
  })

  it('falls back to the Ola street address, skipping highway names', async () => {
    mock((u) =>
      u.includes('nearbysearch') ? { predictions: [] } : u.includes('reverse-geocode') ? { results: [{ formatted_address: 'NH 48, Sion, Mumbai, Maharashtra 400022, India' }] } : undefined,
    )
    expect(await reverseGeocode(19.04, 72.86)).toEqual({ name: 'Sion', area: 'Mumbai, Maharashtra 400022' })
  })

  it('uses TomTom nearby places when Ola has nothing', async () => {
    mock((u) =>
      u.includes('olamaps.io')
        ? { predictions: [], results: [] }
        : u.includes('api.tomtom.com/search/2/nearbySearch')
          ? { results: [
              { dist: 80, poi: { name: 'Too Far Cafe' } },
              { dist: 20, poi: { name: 'VIT Wadala' }, address: { municipalitySubdivision: 'Wadala', municipality: 'Mumbai' } },
            ] }
          : undefined,
    )
    // "Wadala" is already in the name, so the area is just the city.
    expect(await reverseGeocode(19.0222, 72.8711)).toEqual({ name: 'VIT Wadala', area: 'Mumbai' })
  })

  it('searches with Ola Maps', async () => {
    mock((u) =>
      u.includes('olamaps.io/places/v1/autocomplete')
        ? { predictions: [{ place_id: 'ola:1', description: 'Lodha Park, Worli, Mumbai', structured_formatting: { main_text: 'Lodha Park', secondary_text: 'Worli, Mumbai' }, geometry: { location: { lat: 19.0, lng: 72.82 } } }] }
        : undefined,
    )
    expect(await searchPlaces('lodha park')).toEqual([{ id: 'ola-ola:1', name: 'Lodha Park', area: 'Worli, Mumbai', lat: 19.0, lng: 72.82, kind: 'custom' }])
  })

  it('uses the Ola Maps style first for the website map', () => {
    const c = mapsConfig()
    expect(c.vectorStyles[0]).toContain('api.olamaps.io')
    expect(c.vectorStyles).toHaveLength(2)
    expect(c.olaKey).toBe('ola_test')
    expect(c.search).toBe('ola')
  })
})
