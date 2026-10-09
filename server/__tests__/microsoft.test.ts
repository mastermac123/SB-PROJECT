import request from 'supertest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const TENANT = 'c7b00d7f-ad99-442a-b12f-c2c912044fdc'
process.env.DATABASE_PATH = ':memory:'
process.env.ALLOWED_EMAIL_DOMAIN = 'vit.edu.in'
process.env.MICROSOFT_CLIENT_ID = 'test-client-id'
process.env.MICROSOFT_CLIENT_SECRET = 'test-secret'
process.env.MICROSOFT_TENANT_ID = TENANT
process.env.PUBLIC_URL = 'https://ridesync.example'

let app: Parameters<typeof request>[0]
let key: CryptoKey
const realFetch = globalThis.fetch

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  key = pair.privateKey as CryptoKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }
  const ms = await import('../microsoft')
  ms.__setJwksForTests(createLocalJWKSet({ keys: [jwk] }))
  app = (await import('../app')).createApp()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

async function idToken(claims: Record<string, unknown>, tid = TENANT) {
  return new SignJWT({ tid, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience('test-client-id')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

/** Start sign-in, then complete the callback with a token Microsoft would return. */
async function signIn(claims: Record<string, unknown>, tid?: string) {
  const agent = request.agent(app)
  const start = await agent.get('/api/auth/microsoft/start?from=/rides')
  expect(start.status).toBe(302)
  const url = new URL(start.headers.location)
  const state = url.searchParams.get('state')!
  const nonce = url.searchParams.get('nonce')!
  const token = await idToken({ nonce, ...claims }, tid)
  let tokenBody = ''
  globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
    tokenBody = String(init?.body)
    return new Response(JSON.stringify({ id_token: token }), { status: 200 })
  }) as typeof fetch
  const cb = await agent.get(`/api/auth/microsoft/callback?code=abc&state=${state}`)
  return { agent, cb, url, state, tokenBody }
}

describe('Sign in with Microsoft', () => {
  it('sends students to the college tenant with PKCE and a domain hint', async () => {
    const res = await request(app).get('/api/auth/microsoft/start')
    const url = new URL(res.headers.location)
    expect(url.origin + url.pathname).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`)
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://ridesync.example/api/auth/microsoft/callback')
    expect(url.searchParams.get('domain_hint')).toBe('vit.edu.in')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect((await request(app).get('/api/config')).body.microsoftLogin).toBe(true)
  })

  it('creates the account and a session for a VIT Outlook user', async () => {
    const { agent, cb, tokenBody } = await signIn({ name: 'Aarav Menon', preferred_username: 'Aarav.Menon@vit.edu.in' })
    expect(cb.status).toBe(302)
    expect(cb.headers.location).toBe('/onboarding')
    expect(tokenBody).toContain('code_verifier=')
    expect(tokenBody).toContain('client_secret=test-secret')
    const me = await agent.get('/api/me')
    expect(me.body).toMatchObject({ email: 'aarav.menon@vit.edu.in', name: 'Aarav Menon', onboarded: false })
  })

  it('rejects accounts from another Microsoft tenant', async () => {
    const { cb, agent } = await signIn({ preferred_username: 'x@vit.edu.in' }, '11111111-2222-3333-4444-555555555555')
    expect(cb.headers.location).toMatch(/^\/login\?error=/)
    expect((await agent.get('/api/me')).status).toBe(401)
  })

  it('rejects non-college emails even inside the tenant', async () => {
    const { cb } = await signIn({ preferred_username: 'guest@outlook.com' })
    expect(decodeURIComponent(cb.headers.location)).toContain('@vit.edu.in')
  })

  it('rejects a wrong nonce, a replayed state, and an expired/unknown state', async () => {
    const { cb, state } = await signIn({ preferred_username: 'y@vit.edu.in', nonce: 'tampered' })
    expect(cb.headers.location).toMatch(/error=/)
    const replay = await request(app).get(`/api/auth/microsoft/callback?code=abc&state=${state}`)
    expect(decodeURIComponent(replay.headers.location)).toContain('expired')
  })

  it('explains when the college requires admin approval', async () => {
    const res = await request(app).get('/api/auth/microsoft/callback?error=access_denied&error_description=AADSTS65001')
    expect(decodeURIComponent(res.headers.location)).toContain('admin approval')
  })
})
