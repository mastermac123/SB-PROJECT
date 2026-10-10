import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.OLA_MAPS_KEY = ''
process.env.OLA_CLIENT_ID = 'cid'
process.env.OLA_CLIENT_SECRET = 'csecret'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const { olaFetch, olaReady, resetOla } = await import('../ola')
const { olaDirections } = await import('../landmarks')

describe('Ola Maps sign-in', () => {
  it('signs in with Client ID/Secret and sends a Bearer token (once, then reuses it)', async () => {
    resetOla()
    const calls: { url: string; auth: string | null; body?: string }[] = []
    globalThis.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
      const url = String(u)
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization'), body: init?.body?.toString() })
      if (url.includes('openid-connect/token')) return new Response(JSON.stringify({ access_token: 'tok123', expires_in: 3600 }))
      return new Response(JSON.stringify({ ok: true }))
    }) as typeof fetch
    await olaFetch('https://api.olamaps.io/places/v1/reverse-geocode?latlng=1,2')
    await olaFetch('https://api.olamaps.io/places/v1/reverse-geocode?latlng=1,3')
    expect(calls.filter((c) => c.url.includes('token'))).toHaveLength(1)
    expect(calls[0].body).toContain('client_id=cid')
    expect(calls[1].auth).toBe('Bearer tok123')
    expect(calls[1].url).not.toContain('api_key')
  })

  it('stops calling Ola for a while after a 401 instead of slowing every request', async () => {
    resetOla()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let hits = 0
    globalThis.fetch = vi.fn(async (u: unknown) => {
      if (String(u).includes('token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }))
      hits++
      return new Response('{"message":"Unauthorized"}', { status: 401 })
    }) as typeof fetch
    expect(await olaDirections({ lat: 19, lng: 72.8 }, { lat: 19.1, lng: 72.9 })).toBeNull()
    expect(olaReady()).toBe(false)
    expect(await olaDirections({ lat: 19, lng: 72.8 }, { lat: 19.1, lng: 72.9 })).toBeNull()
    expect(hits).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    err.mockRestore()
  })
})
