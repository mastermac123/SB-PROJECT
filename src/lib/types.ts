export type LatLng = { lat: number; lng: number }

export type Place = {
  id: string
  name: string
  area: string
  lat: number
  lng: number
  kind?: 'campus' | 'station' | 'airport' | 'area' | 'custom'
}

export type CommuteMode = 'driver' | 'rider' | 'both'

export type RidePreference = 'quiet' | 'female_friendly' | 'no_smoking' | 'no_pets' | 'minimal_detour' | 'music_ok' | 'ac'

export type CampusId = 'chennai' | 'vellore'

export type Vehicle = {
  id: string
  make: string
  model: string
  color: string
  plate: string
  seats: number // passenger seats excluding driver
  fuel: 'petrol' | 'diesel' | 'cng' | 'ev'
}

export type User = {
  id: string
  name: string
  email: string
  studentId: string
  phone: string
  photo?: string
  gender?: 'female' | 'male' | 'other' | 'undisclosed'
  campus: CampusId
  programme?: string
  verified: boolean
  emailVerified: boolean
  commute?: CommuteMode
  vehicle?: Vehicle
  rating: number
  ratingCount: number
  ridesTaken: number
  ridesOffered: number
  completionRate: number // 0–1, rides completed / rides committed
  co2SavedKg: number
  preferences: RidePreference[]
  joinedAt: string
  emergencyContacts?: { name: string; phone: string }[]
  simulated?: boolean // seed community member driven by the local simulator
}

export type RideStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type Ride = {
  id: string
  driverId: string
  origin: Place
  destination: Place
  departAt: string // ISO
  seatsTotal: number
  seatsBooked: number
  farePerSeat: number
  maxDetourKm: number
  preferences: RidePreference[]
  vehicleId: string
  note?: string
  status: RideStatus
  createdAt: string
  distanceKm?: number
  durationMin?: number
}

export type BookingStatus =
  | 'pending' // requested, awaiting driver
  | 'accepted' // driver accepted, awaiting payment
  | 'rejected'
  | 'confirmed' // paid
  | 'driver_arriving'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Booking = {
  id: string
  rideId: string
  riderId: string
  pickup: Place
  drop: Place
  seats: number
  fare: number // total for all seats
  status: BookingStatus
  matchScore: number
  createdAt: string
  updatedAt: string
  paymentId?: string
  cancelledBy?: 'rider' | 'driver'
  cancelReason?: string
  riderRating?: number // rating rider gave the driver
  phaseStartedAt?: string // when the current live phase began (arriving / in progress)
  message?: string // note from rider to driver with the request
}

export type PaymentMethodKind = 'upi' | 'gpay' | 'phonepe' | 'paytm' | 'card' | 'wallet'

export type Payment = {
  id: string
  bookingId: string
  amount: number
  method: PaymentMethodKind
  status: 'success' | 'failed' | 'refunded'
  reference: string
  createdAt: string
  testMode: boolean
  failureReason?: string
}

export type WalletTxn = {
  id: string
  userId: string
  type: 'credit' | 'debit'
  amount: number
  title: string
  subtitle?: string
  createdAt: string
}

export type Message = {
  id: string
  threadId: string // booking id
  senderId: string
  text: string
  createdAt: string
  system?: boolean
}

export type NotificationKind = 'request' | 'accepted' | 'rejected' | 'cancelled' | 'payment' | 'arriving' | 'match' | 'system' | 'chat'

export type AppNotification = {
  id: string
  userId: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  link?: string
}

export type SearchQuery = {
  pickup: Place
  drop: Place
  date: string // yyyy-mm-dd
  time: string // HH:mm
  seats: number
  preferences: RidePreference[]
}

export type MatchFactors = {
  route: number
  time: number
  pickup: number
  preference: number
  reliability: number
}

export type MatchResult = {
  ride: Ride
  driver: User
  vehicle: Vehicle
  score: number // 0–100
  factors: MatchFactors
  tier: 'excellent' | 'good' | 'fair' | 'poor'
  pickupDistanceKm: number
  dropDistanceKm: number
  timeDiffMin: number
  detourKm: number
  fare: number // per seat for this rider
  reasons: string[]
  caveats: string[]
  history?: string
}
