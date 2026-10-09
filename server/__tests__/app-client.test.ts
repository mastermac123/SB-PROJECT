import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.DEV_LOGIN = 'true'
process.env.OSRM_URL = 'http://127.0.0.1:9'

let app: Parameters<typeof request>[0]
const APP = { 'x-ridesync': '1', 'x-ridesync-app': '1' }

beforeAll(async () => {
  app = (await import('../app')).createApp()
})

describe('Flutter app sign-in (Android/iOS)', () => {
  it('returns a token instead of a cookie, and accepts it as a bearer token', async () => {
    const login = await request(app).post('/api/auth/dev').set(APP).send({ email: 'app.user@vit.edu.in' })
    expect(login.status).toBe(200)
    expect(login.headers['set-cookie']).toBeUndefined()
    const token = login.body.token as string
    expect(token).toMatch(/^[\w-]{40,}$/)

    expect((await request(app).get('/api/me').set(APP)).status).toBe(401)
    const me = await request(app).get('/api/me').set({ ...APP, Authorization: `Bearer ${token}` })
    expect(me.status).toBe(200)
    expect(me.body.email).toBe('app.user@vit.edu.in')

    await request(app).post('/api/auth/logout').set({ ...APP, Authorization: `Bearer ${token}` })
    expect((await request(app).get('/api/me').set({ ...APP, Authorization: `Bearer ${token}` })).status).toBe(401)
  })

  it('accepts the token in the URL only for the live-updates stream', async () => {
    const login = await request(app).post('/api/auth/dev').set(APP).send({ email: 'app.stream@vit.edu.in' })
    const token = login.body.token as string
    expect((await request(app).get(`/api/me?token=${token}`).set(APP)).status).toBe(401)
  })

  it('still gives the website a cookie and no token', async () => {
    const login = await request(app).post('/api/auth/dev').set({ 'x-ridesync': '1' }).send({ email: 'web.user@vit.edu.in' })
    expect(login.headers['set-cookie']?.[0]).toContain('rs_session=')
    expect(login.body.token).toBeUndefined()
  })
})
