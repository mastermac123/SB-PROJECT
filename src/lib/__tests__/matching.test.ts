import { describe, expect, it } from 'vitest'
import { placeById } from '../../data/places'
import { scoreRide, sortMatches, suggestFarePerSeat, tierFor } from '../matching'
import { syntheticRoute, polylineLengthKm } from '../geo'
import type { Ride, SearchQuery } from '../types'
import { validateStudentId, validateCollegeEmail, luhn } from '../validation'

const rahul = { id: 'u1', name: 'Rahul Sharma', rating: 4.8, ratingCount: 30, ridesOffered: 32, ridesTaken: 2, completionRate: 0.97, gender: 'male' as const }
const vehicle = { id: 'v', make: 'Honda', model: 'City', color: 'White', plate: 'MH 01 AB 1234', seats: 3, fuel: 'petrol' as const }
const origin = placeById('vit-campus')!
const destination = placeById('malad')!
const coords = syntheticRoute(origin, destination)
const route = { coords, distanceKm: polylineLengthKm(coords) * 1.1, durationMin: 60 }

const ride: Ride = {
  id: 'r1', driverId: rahul.id, origin, destination,
  departAt: new Date('2030-01-10T17:30:00').toISOString(),
  seatsTotal: 3, seatsBooked: 0, farePerSeat: 120, maxDetourKm: 3,
  preferences: ['no_smoking'], vehicleId: 'v', status: 'scheduled', createdAt: '',
  distanceKm: route.distanceKm, durationMin: 60, route: coords,
}
const q = (over: Partial<SearchQuery> = {}): SearchQuery => ({ pickup: origin, drop: destination, date: '2030-01-10', time: '17:30', seats: 1, preferences: [], ...over })
const score = (query: SearchQuery, r: Ride = ride) => scoreRide({ query, ride: r, route, driver: rahul, vehicle })

describe('scoreRide', () => {
  it('scores an exact route and time as an excellent match', () => {
    const m = score(q())!
    expect(m.score).toBeGreaterThanOrEqual(85)
    expect(m.tier).toBe('excellent')
    expect(m.fare).toBe(120)
    expect('gender' in m.driver).toBe(false)
  })

  it('filters rides going the opposite way', () => {
    expect(score(q({ pickup: destination, drop: origin }))).toBeNull()
  })

  it('filters rides without enough seats', () => {
    expect(score(q({ seats: 2 }), { ...ride, seatsBooked: 2 })).toBeNull()
  })

  it('filters rides more than 3 hours from the requested time', () => {
    expect(score(q({ time: '13:00' }))).toBeNull()
  })

  it('lowers the time factor as the gap grows', () => {
    const near = score(q({ time: '17:40' }))!
    const far = score(q({ time: '18:45' }))!
    expect(near.factors.time).toBeGreaterThan(far.factors.time)
    expect(far.caveats.some((c) => c.includes('later'))).toBe(false)
    expect(far.caveats.some((c) => c.includes('earlier'))).toBe(true)
  })

  it('reports unmet preferences', () => {
    const m = score(q({ preferences: ['quiet', 'no_smoking'] }))!
    expect(m.factors.preference).toBe(0.5)
    expect(m.caveats.join()).toContain('Quiet ride')
  })

  it('charges riders for the share of the route they travel', () => {
    const mid = coords[30]
    const m = score(q({ pickup: { id: 'x', name: 'mid', area: '', lat: mid.lat, lng: mid.lng } }))!
    expect(m.fare).toBeLessThan(120)
  })
})

describe('helpers', () => {
  it('tiers and sorting', () => {
    expect(tierFor(90)).toBe('excellent')
    expect(tierFor(50)).toBe('poor')
    const a = score(q())!
    const b = { ...a, score: 50, fare: 40, ride: { ...a.ride, id: 'b' } }
    expect(sortMatches([b, a], 'best')[0]).toBe(a)
    expect(sortMatches([a, b], 'fare')[0]).toBe(b)
  })
  it('suggests a cost-share, not a fare', () => {
    expect(suggestFarePerSeat(30, 3)).toBe(80)
    expect(suggestFarePerSeat(2, 3)).toBe(40)
  })
  it('validates VIT identity', () => {
    expect(validateCollegeEmail('aarav.menon@vit.edu.in')).toBeNull()
    expect(validateCollegeEmail('aarav@gmail.com')).toMatch(/vit\.edu\.in/)
    expect(validateCollegeEmail('x@evilvit.edu.in')).not.toBeNull()
    expect(validateStudentId('22101A0012')).toBeNull()
    expect(validateStudentId('a b')).not.toBeNull()
    expect(luhn('4111 1111 1111 1111')).toBe(true)
  })
})
