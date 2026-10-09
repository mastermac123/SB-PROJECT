import request from 'supertest'
import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_PATH = ':memory:'
process.env.DEV_LOGIN = 'true'
process.env.ALLOWED_EMAIL_DOMAIN = 'vit.edu.in'
process.env.OSRM_URL = 'http://127.0.0.1:9' // force the offline route estimate

let app: Parameters<typeof request>[0]
const H = { 'x-ridesync': '1' }

async function login(email: string) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/dev').set(H).send({ email })
  return { agent, res }
}

const campus = { id: 'vit-campus', name: 'VIT Wadala', area: 'Wadala', lat: 19.0222, lng: 72.8711, kind: 'campus' }
const malad = { id: 'malad', name: 'Malad', area: 'Malad Station', lat: 19.1868, lng: 72.8484, kind: 'station' }

beforeAll(async () => {
  const { createApp } = await import('../app')
  app = createApp()
})

describe('auth', () => {
  it('rejects emails outside the college domain', async () => {
    const { res } = await login('someone@gmail.com')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/vit\.edu\.in/)
    const lookalike = await login('someone@notvit.edu.in')
    expect(lookalike.res.status).toBe(403)
  })

  it('blocks state-changing requests without the CSRF header', async () => {
    const res = await request(app).post('/api/auth/dev').send({ email: 'a.b@vit.edu.in' })
    expect(res.status).toBe(403)
  })

  it('signs in with an emailed one-time code', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const agent = request.agent(app)
    expect((await agent.post('/api/auth/code/request').set(H).send({ email: 'x@gmail.com' })).status).toBe(403)
    expect((await agent.post('/api/auth/code/request').set(H).send({ email: 'Neha.Patil@vit.edu.in' })).status).toBe(200)
    const code = String(log.mock.calls.flat().join(' ').match(/│\s+(\d{6})/)?.[1])
    log.mockRestore()
    expect((await agent.post('/api/auth/code/verify').set(H).send({ email: 'neha.patil@vit.edu.in', code: code === '000000' ? '111111' : '000000' })).status).toBe(400)
    const ok = await agent.post('/api/auth/code/verify').set(H).send({ email: 'neha.patil@vit.edu.in', code })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ isNew: true, user: { email: 'neha.patil@vit.edu.in', name: 'Neha Patil', onboarded: false } })
    // Codes are single-use.
    expect((await request(app).post('/api/auth/code/verify').set(H).send({ email: 'neha.patil@vit.edu.in', code })).status).toBe(400)
    expect((await agent.get('/api/me')).body.email).toBe('neha.patil@vit.edu.in')
    await agent.post('/api/auth/logout').set(H)
    expect((await agent.get('/api/me')).status).toBe(401)
  })

  it('requires a session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401)
    expect((await request(app).get('/api/trips')).status).toBe(401)
  })

  it('requires onboarding before using rides', async () => {
    const { agent } = await login('new.student@vit.edu.in')
    expect((await agent.get('/api/trips')).status).toBe(403)
    const bad = await agent.patch('/api/me').set(H).send({ phone: '123', onboarded: true })
    expect(bad.status).toBe(400)
  })
})

describe('full ride between two devices', () => {
  it('driver offers, rider books, ride completes', async () => {
    const driver = (await login('rahul.sharma@vit.edu.in')).agent
    const rider = (await login('priya.nair@vit.edu.in')).agent

    expect((await driver.patch('/api/me').set(H).send({ phone: '9876543210', studentId: 'VIT2201', gender: 'male', commute: 'driver', upiId: 'rahul@okaxis', onboarded: true })).status).toBe(200)
    expect((await rider.patch('/api/me').set(H).send({ phone: '9876500000', studentId: 'VIT2202', gender: 'female', commute: 'rider', onboarded: true })).status).toBe(200)
    // Student IDs are unique.
    expect((await rider.patch('/api/me').set(H).send({ studentId: 'VIT2201' })).status).toBe(409)

    // Driver needs a car to publish.
    const departAt = new Date(Date.now() + 2 * 3600_000).toISOString()
    const offer = { origin: campus, destination: malad, departAt, seats: 3, farePerSeat: 60, maxDetourKm: 3, preferences: ['no_smoking'] }
    expect((await driver.post('/api/rides').set(H).send(offer)).status).toBe(400)
    expect((await driver.put('/api/me/vehicle').set(H).send({ make: 'Honda', model: 'City', color: 'White', plate: 'MH01AB1234', seats: 3, fuel: 'petrol' })).status).toBe(200)
    // Cost-sharing cap.
    expect((await driver.post('/api/rides').set(H).send({ ...offer, farePerSeat: 2000 })).status).toBe(400)
    const pub = await driver.post('/api/rides').set(H).send(offer)
    expect(pub.status).toBe(200)
    const rideId = pub.body.id

    // Rider on another device sees it.
    const d = new Date(departAt)
    const query = { pickup: campus, drop: malad, date: departAt.slice(0, 10), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, at: departAt, seats: 1, preferences: [] }
    const search = await rider.post('/api/rides/search').set(H).send(query)
    expect(search.status).toBe(200)
    expect(search.body.results).toHaveLength(1)
    expect(search.body.results[0].score).toBeGreaterThan(80)
    expect(search.body.results[0].driver.gender).toBeUndefined()
    const feed = await rider.get('/api/rides/feed')
    expect(feed.body.map((x: { ride: { id: string } }) => x.ride.id)).toContain(rideId)
    // Driver doesn't see their own ride.
    expect((await driver.post('/api/rides/search').set(H).send(query)).body.results).toHaveLength(0)

    const book = await rider.post('/api/bookings').set(H).send({ rideId, query, message: 'At main gate' })
    expect(book.status).toBe(200)
    const bookingId = book.body.id
    expect(book.body.status).toBe('pending')

    // Phone + UPI hidden until accepted.
    let detail = await rider.get(`/api/bookings/${bookingId}`)
    expect(detail.body.driverPhone).toBeUndefined()

    // A third student can't see the booking.
    const stranger = (await login('someone.else@vit.edu.in')).agent
    expect((await stranger.get(`/api/bookings/${bookingId}`)).status).toBe(403) // not onboarded
    await stranger.patch('/api/me').set(H).send({ phone: '9876511111', studentId: 'VIT2203', onboarded: true })
    expect((await stranger.get(`/api/bookings/${bookingId}`)).status).toBe(404)
    expect((await rider.post(`/api/bookings/${bookingId}/respond`).set(H).send({ accept: true })).status).toBe(403)

    const notes = await driver.get('/api/notifications')
    expect(notes.body[0].kind).toBe('request')

    expect((await driver.post(`/api/bookings/${bookingId}/respond`).set(H).send({ accept: true })).status).toBe(200)
    detail = await rider.get(`/api/bookings/${bookingId}`)
    expect(detail.body.booking.status).toBe('accepted')
    expect(detail.body.driverUpiId).toBe('rahul@okaxis')
    expect(detail.body.driverPhone).toBe('9876543210')

    expect((await rider.post(`/api/bookings/${bookingId}/pay`).set(H).send({ method: 'upi', reference: '412345678901' })).status).toBe(200)
    detail = await rider.get(`/api/bookings/${bookingId}`)
    expect(detail.body.booking.status).toBe('confirmed')
    expect(detail.body.booking.paymentStatus).toBe('marked_paid')

    // Chat both ways.
    expect((await rider.post(`/api/bookings/${bookingId}/messages`).set(H).send({ text: 'Hi!' })).status).toBe(200)
    expect((await driver.post(`/api/bookings/${bookingId}/messages`).set(H).send({ text: 'See you at 5' })).status).toBe(200)
    const msgs = await rider.get(`/api/bookings/${bookingId}/messages`)
    expect(msgs.body.filter((m: { system: boolean }) => !m.system).map((m: { text: string }) => m.text)).toEqual(['Hi!', 'See you at 5'])

    // Live ride.
    expect((await driver.post(`/api/rides/${rideId}/start`).set(H).send({})).status).toBe(200)
    expect((await driver.post(`/api/rides/${rideId}/location`).set(H).send({ lat: 19.03, lng: 72.87, heading: 10 })).status).toBe(200)
    const live = await rider.get(`/api/bookings/${bookingId}`)
    expect(live.body.booking.status).toBe('driver_arriving')
    expect(live.body.ride.driverLocation.lat).toBe(19.03)
    expect((await driver.post(`/api/bookings/${bookingId}/arrived`).set(H).send({})).status).toBe(200)
    expect((await driver.post(`/api/bookings/${bookingId}/picked-up`).set(H).send({})).status).toBe(200)
    expect((await driver.post(`/api/bookings/${bookingId}/payment-received`).set(H).send({})).status).toBe(200)
    expect((await driver.post(`/api/bookings/${bookingId}/dropped`).set(H).send({})).status).toBe(200)
    expect((await driver.post(`/api/rides/${rideId}/complete`).set(H).send({})).status).toBe(200)

    expect((await rider.post(`/api/bookings/${bookingId}/rate`).set(H).send({ stars: 5 })).status).toBe(200)
    expect((await rider.post(`/api/bookings/${bookingId}/rate`).set(H).send({ stars: 4 })).status).toBe(409)
    expect((await driver.post(`/api/bookings/${bookingId}/rate`).set(H).send({ stars: 5 })).status).toBe(200)

    const meDriver = await driver.get('/api/me')
    expect(meDriver.body.ridesOffered).toBe(1)
    expect(meDriver.body.rating).toBe(5)
    const pays = await rider.get('/api/payments')
    expect(pays.body[0]).toMatchObject({ direction: 'paid', amount: 60, method: 'upi', status: 'received' })
    const trips = await driver.get('/api/trips')
    expect(trips.body.rides[0]).toMatchObject({ status: 'completed', earned: 60 })
  })

  it('prevents overbooking and handles declines and cancellations', async () => {
    const driver = (await login('karan.mehta@vit.edu.in')).agent
    await driver.patch('/api/me').set(H).send({ phone: '9876522222', studentId: 'VIT2210', onboarded: true })
    await driver.put('/api/me/vehicle').set(H).send({ make: 'Maruti', model: 'Swift', color: 'Red', plate: 'MH02CD5678', seats: 1, fuel: 'petrol' })
    const departAt = new Date(Date.now() + 5 * 3600_000).toISOString()
    const rideId = (await driver.post('/api/rides').set(H).send({ origin: campus, destination: malad, departAt, seats: 1, farePerSeat: 50, maxDetourKm: 3, preferences: [] })).body.id
    const query = { pickup: campus, drop: malad, date: departAt.slice(0, 10), time: '00:00', at: departAt, seats: 1, preferences: [] }

    const a = (await login('rider.one@vit.edu.in')).agent
    const b = (await login('rider.two@vit.edu.in')).agent
    await a.patch('/api/me').set(H).send({ phone: '9876533333', studentId: 'VIT2211', onboarded: true })
    await b.patch('/api/me').set(H).send({ phone: '9876544444', studentId: 'VIT2212', onboarded: true })
    const ba = (await a.post('/api/bookings').set(H).send({ rideId, query })).body.id
    const bb = (await b.post('/api/bookings').set(H).send({ rideId, query })).body.id
    expect((await driver.post(`/api/bookings/${ba}/respond`).set(H).send({ accept: true })).status).toBe(200)
    expect((await driver.post(`/api/bookings/${bb}/respond`).set(H).send({ accept: true })).status).toBe(409)
    expect((await driver.post(`/api/bookings/${bb}/respond`).set(H).send({ accept: false })).status).toBe(200)
    // Full ride no longer appears in search for a 3rd rider.
    const c = (await login('rider.three@vit.edu.in')).agent
    await c.patch('/api/me').set(H).send({ phone: '9876555555', studentId: 'VIT2213', onboarded: true })
    expect((await c.post('/api/rides/search').set(H).send(query)).body.results).toHaveLength(0)
    // UPI not allowed: driver has no UPI ID.
    expect((await a.post(`/api/bookings/${ba}/pay`).set(H).send({ method: 'upi' })).status).toBe(409)
    expect((await a.post(`/api/bookings/${ba}/pay`).set(H).send({ method: 'cash' })).status).toBe(200)
    // Driver cancels the ride: rider is notified and the booking is cancelled.
    expect((await driver.post(`/api/rides/${rideId}/cancel`).set(H).send({ reason: 'Car trouble' })).status).toBe(200)
    const det = await a.get(`/api/bookings/${ba}`)
    expect(det.body.booking).toMatchObject({ status: 'cancelled', cancelledBy: 'driver' })
    expect((await a.get('/api/notifications')).body[0].kind).toBe('cancelled')
  })
})
