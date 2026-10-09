import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.DEV_LOGIN = 'true'

let app: Parameters<typeof request>[0]
const H = { 'x-ridesync': '1' }
beforeAll(async () => {
  app = (await import('../app')).createApp()
})

async function student(email: string) {
  const a = request.agent(app)
  await a.post('/api/auth/dev').set(H).send({ email })
  return a
}

describe('one mobile number and student ID per account', () => {
  it('rejects a mobile number or student ID already used by another student', async () => {
    const a = await student('first.one@vit.edu.in')
    expect((await a.patch('/api/me').set(H).send({ phone: '9876500001', studentId: 'VU1F/2122-001', onboarded: true })).status).toBe(200)

    const b = await student('second.one@vit.edu.in')
    const samePhone = await b.patch('/api/me').set(H).send({ phone: '+91 98765 00001', studentId: 'VU1F2122002', onboarded: true })
    expect(samePhone.status).toBe(409)
    expect(samePhone.body.field).toBe('phone')

    const sameId = await b.patch('/api/me').set(H).send({ phone: '9876500002', studentId: 'vu1f2122001', onboarded: true })
    expect(sameId.status).toBe(409)
    expect(sameId.body.field).toBe('studentId')

    expect((await b.patch('/api/me').set(H).send({ phone: '9876500002', studentId: 'VU1F2122002', onboarded: true })).status).toBe(200)
    // Saving your own details again is fine.
    expect((await a.patch('/api/me').set(H).send({ phone: '9876500001', studentId: 'VU1F/2122-001' })).status).toBe(200)
  })
})
