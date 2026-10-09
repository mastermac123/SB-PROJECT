import { haversineKm, ROAD_CIRCUITY } from '@/lib/geo'
import { suggestFarePerSeat } from '@/lib/matching'
import type { Booking, Message, Payment, Ride, RidePreference, User, Vehicle, WalletTxn, AppNotification } from '@/lib/types'
import { CAMPUSES, placeById } from './places'

/**
 * Local seed data — a small community of VIT students so the product can be
 * explored end-to-end without a backend. Community members marked
 * `simulated` respond to requests via services/simulator.ts.
 */

const v = (id: string, make: string, model: string, color: string, plate: string, seats: number, fuel: Vehicle['fuel'] = 'petrol'): Vehicle => ({
  id,
  make,
  model,
  color,
  plate,
  seats,
  fuel,
})

type SeedUser = Omit<User, 'joinedAt' | 'emailVerified' | 'verified' | 'co2SavedKg'> & Partial<User>

const base = (u: SeedUser): User => ({
  verified: true,
  emailVerified: true,
  joinedAt: '2025-08-01T10:00:00.000Z',
  co2SavedKg: Math.round((u.ridesOffered * 4.2 + u.ridesTaken * 2.1) * 10) / 10,
  ...u,
})

export const SEED_USERS: User[] = [
  base({ id: 'u_rahul', name: 'Rahul Sharma', email: 'rahul.sharma2021@vitstudent.ac.in', studentId: '21BCE1042', phone: '9840012345', gender: 'male', campus: 'chennai', programme: 'B.Tech CSE · 4th year', commute: 'both', vehicle: v('v_rahul', 'Honda', 'City', 'White', 'TN 14 AB 1234', 3), rating: 4.8, ratingCount: 29, ridesTaken: 6, ridesOffered: 32, completionRate: 0.97, preferences: ['no_smoking', 'music_ok', 'ac'], simulated: true }),
  base({ id: 'u_ananya', name: 'Ananya Iyer', email: 'ananya.iyer2022@vitstudent.ac.in', studentId: '22BEC1310', phone: '9840023456', gender: 'female', campus: 'chennai', programme: 'B.Tech ECE · 3rd year', commute: 'both', vehicle: v('v_ananya', 'Hyundai', 'i20', 'Grey', 'TN 09 CK 4471', 3), rating: 4.9, ratingCount: 44, ridesTaken: 11, ridesOffered: 47, completionRate: 0.99, preferences: ['female_friendly', 'quiet', 'no_smoking', 'no_pets', 'ac'], simulated: true }),
  base({ id: 'u_karthik', name: 'Karthik Raman', email: 'karthik.raman2023@vitstudent.ac.in', studentId: '23BME1077', phone: '9840034567', gender: 'male', campus: 'chennai', programme: 'B.Tech Mech · 2nd year', commute: 'driver', vehicle: v('v_karthik', 'Maruti Suzuki', 'Swift', 'Red', 'TN 22 DM 8810', 3), rating: 4.6, ratingCount: 16, ridesTaken: 2, ridesOffered: 18, completionRate: 0.9, preferences: ['music_ok'], simulated: true }),
  base({ id: 'u_priya', name: 'Priya Nair', email: 'priya.nair2021@vitstudent.ac.in', studentId: '21BAI1203', phone: '9840045678', gender: 'female', campus: 'chennai', programme: 'B.Tech CSE (AI & ML) · 4th year', commute: 'both', vehicle: v('v_priya', 'Tata', 'Nexon EV', 'Blue', 'TN 14 EV 2209', 4, 'ev'), rating: 4.9, ratingCount: 58, ridesTaken: 8, ridesOffered: 61, completionRate: 0.98, preferences: ['no_smoking', 'no_pets', 'quiet', 'ac'], simulated: true }),
  base({ id: 'u_arjun', name: 'Arjun Mehta', email: 'arjun.mehta2022@vitstudent.ac.in', studentId: '22BCE1556', phone: '9840056789', gender: 'male', campus: 'chennai', programme: 'B.Tech CSE · 3rd year', commute: 'driver', vehicle: v('v_arjun', 'Kia', 'Seltos', 'Black', 'TN 11 AZ 5520', 4, 'diesel'), rating: 4.7, ratingCount: 23, ridesTaken: 3, ridesOffered: 25, completionRate: 0.95, preferences: ['no_smoking', 'music_ok', 'ac'], simulated: true }),
  base({ id: 'u_nikhil', name: 'Nikhil Joshi', email: 'nikhil.joshi2024@vitstudent.ac.in', studentId: '24BCE1019', phone: '9840067890', gender: 'male', campus: 'chennai', programme: 'B.Tech CSE · 1st year', commute: 'driver', vehicle: v('v_nikhil', 'Toyota', 'Glanza', 'Silver', 'TN 10 BL 6634', 3), rating: 4.4, ratingCount: 8, ridesTaken: 0, ridesOffered: 9, completionRate: 0.82, preferences: ['music_ok'], simulated: true }),
  base({ id: 'u_sneha', name: 'Sneha Reddy', email: 'sneha.reddy2022@vitstudent.ac.in', studentId: '22BIT0291', phone: '9840078901', gender: 'female', campus: 'vellore', programme: 'B.Tech IT · 3rd year', commute: 'both', vehicle: v('v_sneha', 'Honda', 'Amaze', 'Silver', 'AP 39 HT 7712', 3), rating: 4.8, ratingCount: 20, ridesTaken: 5, ridesOffered: 22, completionRate: 0.96, preferences: ['female_friendly', 'no_smoking', 'ac'], simulated: true }),
  base({ id: 'u_vikram', name: 'Vikram Singh', email: 'vikram.singh2021@vitstudent.ac.in', studentId: '21BEE0412', phone: '9840089012', gender: 'male', campus: 'vellore', programme: 'B.Tech EEE · 4th year', commute: 'driver', vehicle: v('v_vikram', 'Mahindra', 'XUV700', 'White', 'TN 23 BX 3091', 5, 'diesel'), rating: 4.5, ratingCount: 11, ridesTaken: 1, ridesOffered: 12, completionRate: 0.88, preferences: ['music_ok', 'ac'], simulated: true }),
  // Riders
  base({ id: 'u_meera', name: 'Meera Krishnan', email: 'meera.krishnan2023@vitstudent.ac.in', studentId: '23BCE1420', phone: '9840090123', gender: 'female', campus: 'chennai', programme: 'B.Tech CSE · 2nd year', commute: 'rider', rating: 4.9, ratingCount: 15, ridesTaken: 17, ridesOffered: 0, completionRate: 1, preferences: ['female_friendly', 'quiet'], simulated: true }),
  base({ id: 'u_aditya', name: 'Aditya Rao', email: 'aditya.rao2022@vitstudent.ac.in', studentId: '22BCE1702', phone: '9840001234', gender: 'male', campus: 'chennai', programme: 'B.Tech CSE · 3rd year', commute: 'rider', rating: 4.7, ratingCount: 21, ridesTaken: 24, ridesOffered: 0, completionRate: 0.96, preferences: ['no_smoking'], simulated: true }),
  base({ id: 'u_fatima', name: 'Fatima Sheikh', email: 'fatima.sheikh2024@vitstudent.ac.in', studentId: '24BAI1088', phone: '9840011223', gender: 'female', campus: 'chennai', programme: 'B.Tech CSE (AI & ML) · 1st year', commute: 'rider', rating: 5, ratingCount: 6, ridesTaken: 6, ridesOffered: 0, completionRate: 1, preferences: ['female_friendly', 'no_smoking'], simulated: true }),
  base({ id: 'u_rohan', name: 'Rohan Das', email: 'rohan.das2023@vitstudent.ac.in', studentId: '23BEC1135', phone: '9840022334', gender: 'male', campus: 'chennai', programme: 'B.Tech ECE · 2nd year', commute: 'rider', rating: 4.6, ratingCount: 12, ridesTaken: 13, ridesOffered: 0, completionRate: 0.92, preferences: [], simulated: true }),
]

export const DEMO_EMAIL = 'aarav.menon2022@vitstudent.ac.in'
export const DEMO_PASSWORD = 'ridesync123'

export const DEMO_USER: User = base({
  id: 'u_demo',
  name: 'Aarav Menon',
  email: DEMO_EMAIL,
  studentId: '22BCE1187',
  phone: '9876543210',
  gender: 'male',
  campus: 'chennai',
  programme: 'B.Tech CSE · 3rd year',
  commute: 'both',
  vehicle: v('v_demo', 'Maruti Suzuki', 'Baleno', 'Nexa Blue', 'TN 14 CD 9087', 3),
  rating: 4.9,
  ratingCount: 14,
  ridesTaken: 23,
  ridesOffered: 9,
  completionRate: 0.98,
  co2SavedKg: 41.6,
  preferences: ['no_smoking'],
  emergencyContacts: [{ name: 'Lakshmi Menon (Mother)', phone: '9847012345' }],
  joinedAt: '2025-07-22T10:00:00.000Z',
})

/** People who can be surfaced as incoming requesters on rides the user offers. */
export const REQUESTER_IDS = ['u_meera', 'u_aditya', 'u_fatima', 'u_rohan']

/** Simulated drivers who decline requests (so the "ride declined" state is reachable). */
export const DECLINING_DRIVERS = new Set(['u_vikram'])

type Template = {
  key: string
  driverId: string
  from: string
  to: string
  at: [number, number]
  seats: number
  booked?: number
  prefs: RidePreference[]
  detour: number
  note?: string
  weekdaysOnly?: boolean
}

const TEMPLATES: Template[] = [
  { key: 'rahul-tnagar', driverId: 'u_rahul', from: 'vit-chennai', to: 'tnagar', at: [17, 35], seats: 3, prefs: ['no_smoking', 'music_ok', 'ac'], detour: 3, note: 'Leaving from Main Gate. Can drop near Pondy Bazaar or Guindy on the way.' },
  { key: 'ananya-velachery', driverId: 'u_ananya', from: 'vit-chennai', to: 'velachery', at: [17, 50], seats: 3, booked: 1, prefs: ['female_friendly', 'quiet', 'no_smoking', 'no_pets', 'ac'], detour: 2, note: 'Female-friendly ride. Pickup at Ladies’ Hostel gate works too.' },
  { key: 'priya-airport', driverId: 'u_priya', from: 'vit-chennai', to: 'maa', at: [18, 10], seats: 4, booked: 1, prefs: ['no_smoking', 'no_pets', 'quiet', 'ac'], detour: 3, note: 'Airport run, EV. Plenty of boot space for luggage.' },
  { key: 'arjun-central', driverId: 'u_arjun', from: 'vit-chennai', to: 'mas', at: [16, 45], seats: 4, booked: 2, prefs: ['no_smoking', 'music_ok', 'ac'], detour: 4, note: 'Heading to Central for the 8:30 PM train.' },
  { key: 'karthik-tambaram', driverId: 'u_karthik', from: 'vit-chennai', to: 'tbm', at: [17, 15], seats: 3, prefs: ['music_ok'], detour: 3 },
  { key: 'nikhil-annanagar', driverId: 'u_nikhil', from: 'vit-chennai', to: 'annanagar', at: [18, 30], seats: 3, prefs: ['music_ok'], detour: 2 },
  { key: 'rahul-guindy-am', driverId: 'u_rahul', from: 'guindy', to: 'vit-chennai', at: [7, 40], seats: 3, booked: 1, prefs: ['no_smoking', 'ac'], detour: 3, weekdaysOnly: true },
  { key: 'ananya-adyar-am', driverId: 'u_ananya', from: 'adyar', to: 'vit-chennai', at: [7, 30], seats: 3, prefs: ['female_friendly', 'quiet', 'no_smoking', 'ac'], detour: 2, weekdaysOnly: true },
  { key: 'karthik-omr', driverId: 'u_karthik', from: 'vit-chennai', to: 'omr', at: [13, 20], seats: 3, prefs: ['music_ok'], detour: 3 },
  { key: 'priya-besant', driverId: 'u_priya', from: 'vit-chennai', to: 'besant', at: [19, 0], seats: 4, prefs: ['no_smoking', 'quiet', 'ac'], detour: 3 },
  { key: 'sneha-central', driverId: 'u_sneha', from: 'vit-vellore', to: 'mas', at: [16, 0], seats: 3, booked: 1, prefs: ['female_friendly', 'no_smoking', 'ac'], detour: 4, note: 'Weekend trip home via NH48. One short tea stop.' },
  { key: 'vikram-blr', driverId: 'u_vikram', from: 'vit-vellore', to: 'blr-silkboard', at: [15, 30], seats: 5, booked: 2, prefs: ['music_ok', 'ac'], detour: 5 },
  { key: 'sneha-katpadi', driverId: 'u_sneha', from: 'katpadi', to: 'vit-vellore', at: [8, 20], seats: 3, prefs: ['female_friendly', 'no_smoking'], detour: 2 },
]

const dateKey = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/** Community rides for today + the next 3 days. Deterministic ids, so it can top up idempotently. */
export function communityRides(now = new Date(), users: User[] = SEED_USERS): Ride[] {
  const out: Ride[] = []
  for (let offset = 0; offset < 4; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const weekday = day.getDay() >= 1 && day.getDay() <= 5
    TEMPLATES.forEach((t, i) => {
      if (t.weekdaysOnly && !weekday) return
      // Skip some combinations so each day looks different.
      if ((i + offset) % 5 === 4) return
      const jitter = ((i * 7 + offset * 11) % 4) * 5 - 5
      const depart = new Date(day)
      depart.setHours(t.at[0], t.at[1] + jitter, 0, 0)
      if (depart.getTime() < now.getTime() + 15 * 60_000) return
      const driver = users.find((u) => u.id === t.driverId)!
      const origin = placeById(t.from)!
      const destination = placeById(t.to)!
      const distanceKm = haversineKm(origin, destination) * ROAD_CIRCUITY
      out.push({
        id: `r_${t.key}_${dateKey(day)}`,
        driverId: t.driverId,
        origin,
        destination,
        departAt: depart.toISOString(),
        seatsTotal: t.seats,
        seatsBooked: t.booked ?? 0,
        farePerSeat: suggestFarePerSeat(distanceKm, t.seats, driver.vehicle?.fuel),
        maxDetourKm: t.detour,
        preferences: t.prefs,
        vehicleId: driver.vehicle!.id,
        note: t.note,
        status: 'scheduled',
        createdAt: new Date(now.getTime() - 3 * 3600_000).toISOString(),
      })
    })
  }
  return out
}

/** Past activity for the demo account so history, wallet and the "ridden together" signal have data. */
export function demoHistory(now = new Date()) {
  const daysAgo = (d: number, h: number, m = 0) => {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
    x.setHours(h, m, 0, 0)
    return x.toISOString()
  }
  const chennai = CAMPUSES.chennai.gate
  const rides: Ride[] = [
    { id: 'r_past_1', driverId: 'u_rahul', origin: chennai, destination: placeById('tnagar')!, departAt: daysAgo(3, 17, 30), seatsTotal: 3, seatsBooked: 2, farePerSeat: 120, maxDetourKm: 3, preferences: ['no_smoking'], vehicleId: 'v_rahul', status: 'completed', createdAt: daysAgo(4, 9) },
    { id: 'r_past_2', driverId: 'u_ananya', origin: placeById('adyar')!, destination: chennai, departAt: daysAgo(6, 7, 30), seatsTotal: 3, seatsBooked: 3, farePerSeat: 110, maxDetourKm: 2, preferences: ['quiet'], vehicleId: 'v_ananya', status: 'completed', createdAt: daysAgo(7, 20) },
    { id: 'r_past_3', driverId: 'u_demo', origin: chennai, destination: placeById('maa')!, departAt: daysAgo(9, 18, 0), seatsTotal: 3, seatsBooked: 2, farePerSeat: 100, maxDetourKm: 3, preferences: ['no_smoking'], vehicleId: 'v_demo', status: 'completed', createdAt: daysAgo(10, 12) },
    { id: 'r_past_4', driverId: 'u_karthik', origin: chennai, destination: placeById('tbm')!, departAt: daysAgo(12, 17, 15), seatsTotal: 3, seatsBooked: 0, farePerSeat: 70, maxDetourKm: 3, preferences: [], vehicleId: 'v_karthik', status: 'cancelled', createdAt: daysAgo(13, 12) },
    { id: 'r_past_5', driverId: 'u_rahul', origin: placeById('guindy')!, destination: chennai, departAt: daysAgo(15, 7, 40), seatsTotal: 3, seatsBooked: 2, farePerSeat: 90, maxDetourKm: 3, preferences: [], vehicleId: 'v_rahul', status: 'completed', createdAt: daysAgo(16, 12) },
  ]
  const bk = (id: string, rideId: string, riderId: string, pickup: string, drop: string, fare: number, status: Booking['status'], at: string, extra: Partial<Booking> = {}): Booking => ({
    id,
    rideId,
    riderId,
    pickup: placeById(pickup)!,
    drop: placeById(drop)!,
    seats: 1,
    fare,
    status,
    matchScore: 90,
    createdAt: at,
    updatedAt: at,
    ...extra,
  })
  const bookings: Booking[] = [
    bk('b_past_1', 'r_past_1', 'u_demo', 'vit-chennai', 'tnagar', 120, 'completed', daysAgo(3, 12), { riderRating: 5, paymentId: 'p_past_1', matchScore: 94 }),
    bk('b_past_2', 'r_past_2', 'u_demo', 'adyar', 'vit-chennai', 110, 'completed', daysAgo(6, 6), { riderRating: 5, paymentId: 'p_past_2', matchScore: 91 }),
    bk('b_past_3a', 'r_past_3', 'u_meera', 'vit-chennai-lh', 'maa', 100, 'completed', daysAgo(9, 10), { matchScore: 96 }),
    bk('b_past_3b', 'r_past_3', 'u_aditya', 'vit-chennai', 'maa', 100, 'completed', daysAgo(9, 11), { matchScore: 92 }),
    bk('b_past_4', 'r_past_4', 'u_demo', 'vit-chennai', 'tbm', 70, 'cancelled', daysAgo(12, 9), { cancelledBy: 'driver', cancelReason: 'Driver’s plans changed', matchScore: 88 }),
    bk('b_past_5', 'r_past_5', 'u_demo', 'guindy', 'vit-chennai', 90, 'completed', daysAgo(15, 6), { riderRating: 4, paymentId: 'p_past_5', matchScore: 89 }),
  ]
  const payments: Payment[] = [
    { id: 'p_past_1', bookingId: 'b_past_1', amount: 120, method: 'upi', status: 'success', reference: 'TEST-UPI-81723', createdAt: daysAgo(3, 12, 5), testMode: true },
    { id: 'p_past_2', bookingId: 'b_past_2', amount: 110, method: 'wallet', status: 'success', reference: 'TEST-WAL-55102', createdAt: daysAgo(6, 6, 5), testMode: true },
    { id: 'p_past_5', bookingId: 'b_past_5', amount: 90, method: 'gpay', status: 'success', reference: 'TEST-UPI-40917', createdAt: daysAgo(15, 6, 5), testMode: true },
  ]
  const wallet: WalletTxn[] = [
    { id: 'w1', userId: 'u_demo', type: 'credit', amount: 500, title: 'Added to wallet', subtitle: 'UPI · Test mode', createdAt: daysAgo(20, 10) },
    { id: 'w2', userId: 'u_demo', type: 'debit', amount: 110, title: 'Ride with Ananya Iyer', subtitle: 'Adyar → VIT Chennai', createdAt: daysAgo(6, 6, 5) },
    { id: 'w3', userId: 'u_demo', type: 'credit', amount: 200, title: 'Cost share received', subtitle: 'VIT Chennai → Chennai Airport · 2 riders', createdAt: daysAgo(9, 19, 20) },
    { id: 'w4', userId: 'u_demo', type: 'credit', amount: 70, title: 'Refund', subtitle: 'Ride cancelled by Karthik', createdAt: daysAgo(12, 9, 30) },
  ]
  const messages: Message[] = [
    { id: 'm1', threadId: 'b_past_1', senderId: 'system', text: 'Ride confirmed. Say hi to Rahul!', createdAt: daysAgo(3, 12, 6), system: true },
    { id: 'm2', threadId: 'b_past_1', senderId: 'u_rahul', text: 'Hey! I’ll be at Main Gate by 5:25.', createdAt: daysAgo(3, 16, 50) },
    { id: 'm3', threadId: 'b_past_1', senderId: 'u_demo', text: 'Perfect, see you there 👍', createdAt: daysAgo(3, 16, 52) },
  ]
  const notifications: AppNotification[] = [
    { id: 'n1', userId: 'u_demo', kind: 'match', title: 'New ride on your usual route', body: 'Rahul is driving VIT Chennai → T. Nagar this evening. 94% match.', createdAt: new Date(now.getTime() - 50 * 60_000).toISOString(), read: false, link: '/find' },
    { id: 'n2', userId: 'u_demo', kind: 'payment', title: 'Refund processed', body: '₹70 returned to your RideSync Wallet for the cancelled Tambaram ride.', createdAt: daysAgo(12, 9, 30), read: true, link: '/wallet' },
    { id: 'n3', userId: 'u_demo', kind: 'system', title: 'You’re verified', body: 'Your VIT student ID has been verified. You can now offer and book rides.', createdAt: daysAgo(30, 10), read: true },
  ]
  return { rides, bookings, payments, wallet, messages, notifications }
}
