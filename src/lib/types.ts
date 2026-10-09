/* Shared between the browser app and the API server. */

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
export type Gender = 'female' | 'male' | 'other' | 'undisclosed'

export type RidePreference = 'quiet' | 'female_friendly' | 'no_smoking' | 'no_pets' | 'minimal_detour' | 'music_ok' | 'ac'

export type Vehicle = {
  id: string
  make: string
  model: string
  color: string
  plate: string
  seats: number // passenger seats excluding driver
  fuel: 'petrol' | 'diesel' | 'cng' | 'ev'
}

/** What other students can see about you. */
export type PublicUser = {
  id: string
  name: string
  photo?: string
  programme?: string
  rating: number // 0 when there are no ratings yet
  ratingCount: number
  ridesOffered: number
  ridesTaken: number
  completionRate: number // 0–1
}

/** The signed-in user. */
export type User = PublicUser & {
  email: string
  phone: string
  studentId: string
  gender: Gender
  commute?: CommuteMode
  upiId?: string
  preferences: RidePreference[]
  emergencyContacts: { name: string; phone: string }[]
  vehicle?: Vehicle
  onboarded: boolean
  co2SavedKg: number
  createdAt: string
}

export type RideStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type DriverLocation = { lat: number; lng: number; heading?: number; at: string }

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
  distanceKm: number
  durationMin: number
  route: LatLng[]
  driverLocation?: DriverLocation
}

export type BookingStatus =
  | 'pending' // requested, awaiting driver
  | 'accepted' // driver accepted, rider to choose payment
  | 'rejected'
  | 'confirmed' // seat confirmed
  | 'driver_arriving' // ride started, driver on the way to this rider
  | 'driver_arrived'
  | 'in_progress' // rider picked up
  | 'completed'
  | 'cancelled'

/** upi = direct to the driver's UPI ID · cash = at pickup · online = through the payment gateway (Razorpay) */
export type PaymentMethodKind = 'upi' | 'cash' | 'online'
/** paid_online = collected by the gateway · refunded = returned by the gateway after a cancellation */
export type PaymentStatus = 'unpaid' | 'marked_paid' | 'received' | 'paid_online' | 'refunded'

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
  message?: string
  paymentMethod?: PaymentMethodKind
  paymentStatus: PaymentStatus
  paymentRef?: string
  paidAt?: string
  arrivedAt?: string
  pickedUpAt?: string
  droppedAt?: string
  cancelledBy?: 'rider' | 'driver'
  cancelReason?: string
  riderRating?: number // rider → driver
  driverRating?: number // driver → rider
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
  date: string // yyyy-mm-dd (rider's local date)
  time: string // HH:mm (rider's local time)
  at?: string // ISO instant of date+time, set by the client so servers in any timezone agree
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
  driver: PublicUser
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

/* ---- API response shapes -------------------------------------------------- */

export type RiderInfo = PublicUser & { phone?: string }

export type RideDetail = {
  ride: Ride
  driver: PublicUser
  vehicle: Vehicle
  myBooking?: Booking
  /** Only for the driver of the ride. */
  bookings?: (Booking & { rider: RiderInfo })[]
}

export type BookingDetail = {
  role: 'rider' | 'driver'
  booking: Booking
  ride: Ride
  driver: PublicUser
  vehicle: Vehicle
  rider: PublicUser
  driverPhone?: string
  driverUpiId?: string
  riderPhone?: string
}

export type TripItem = Booking & { ride: Ride; driver: PublicUser }
export type OfferedItem = Ride & { pending: number; earned: number; riders: number }
export type Trips = { bookings: TripItem[]; rides: OfferedItem[] }

export type Thread = { bookingId: string; ride: Ride; other: PublicUser; last?: Message; status: BookingStatus }

export type PaymentRecord = {
  bookingId: string
  direction: 'paid' | 'received'
  amount: number
  method: PaymentMethodKind
  status: PaymentStatus
  reference?: string
  counterparty: string
  route: string
  at: string
}

export type ServerEvent =
  | { type: 'sync' }
  | { type: 'notification'; notification: AppNotification }
  | { type: 'location'; rideId: string; location: DriverLocation }
