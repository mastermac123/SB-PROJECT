import type { Place } from '../lib/types'

/** Vidyalankar Institute of Technology (vit.edu.in), Wadala East, Mumbai. */
export const CAMPUS: Place = {
  id: 'vit-campus',
  name: 'VIT Wadala',
  area: 'Vidyalankar Institute of Technology, Wadala (E)',
  lat: 19.0222,
  lng: 72.8711,
  kind: 'campus',
}

export const CAMPUS_CENTER = { lat: 19.07, lng: 72.87 }

/** Curated places students travel to. Search also falls back to OpenStreetMap. */
export const PLACES: Place[] = [
  CAMPUS,
  { id: 'wadala-rd', name: 'Wadala Road', area: 'Wadala Road Station', lat: 19.0164, lng: 72.8592, kind: 'station' },
  { id: 'gtb-nagar', name: 'GTB Nagar', area: 'Guru Tegh Bahadur Nagar Station', lat: 19.0368, lng: 72.8645, kind: 'station' },
  { id: 'sion', name: 'Sion', area: 'Sion Station', lat: 19.0473, lng: 72.8635, kind: 'station' },
  { id: 'matunga', name: 'Matunga', area: 'Matunga Station', lat: 19.027, lng: 72.8553, kind: 'station' },
  { id: 'dadar', name: 'Dadar', area: 'Dadar Station', lat: 19.0186, lng: 72.8429, kind: 'station' },
  { id: 'csmt', name: 'CSMT', area: 'Chhatrapati Shivaji Maharaj Terminus', lat: 18.94, lng: 72.8353, kind: 'station' },
  { id: 'mumbai-central', name: 'Mumbai Central', area: 'Mumbai Central Station', lat: 18.969, lng: 72.8205, kind: 'station' },
  { id: 'ltt', name: 'LTT Kurla', area: 'Lokmanya Tilak Terminus', lat: 19.0688, lng: 72.8901, kind: 'station' },
  { id: 'kurla', name: 'Kurla', area: 'Kurla Station', lat: 19.0658, lng: 72.8791, kind: 'station' },
  { id: 'chembur', name: 'Chembur', area: 'Chembur Station', lat: 19.0622, lng: 72.9006, kind: 'station' },
  { id: 'ghatkopar', name: 'Ghatkopar', area: 'Ghatkopar Station', lat: 19.086, lng: 72.9081, kind: 'station' },
  { id: 'powai', name: 'Powai', area: 'Hiranandani Gardens, Powai', lat: 19.1176, lng: 72.906, kind: 'area' },
  { id: 'bkc', name: 'BKC', area: 'Bandra Kurla Complex', lat: 19.0656, lng: 72.8682, kind: 'area' },
  { id: 'bandra', name: 'Bandra', area: 'Bandra Station (W)', lat: 19.0544, lng: 72.8406, kind: 'station' },
  { id: 'worli', name: 'Worli', area: 'Worli Naka', lat: 19.0176, lng: 72.815, kind: 'area' },
  { id: 'lower-parel', name: 'Lower Parel', area: 'Lower Parel Station', lat: 18.9953, lng: 72.8302, kind: 'station' },
  { id: 'andheri', name: 'Andheri', area: 'Andheri Station', lat: 19.1197, lng: 72.8464, kind: 'station' },
  { id: 'airport-t2', name: 'Mumbai Airport T2', area: 'CSMIA Terminal 2, Sahar', lat: 19.0989, lng: 72.8742, kind: 'airport' },
  { id: 'airport-t1', name: 'Mumbai Airport T1', area: 'CSMIA Terminal 1, Santacruz', lat: 19.0919, lng: 72.855, kind: 'airport' },
  { id: 'goregaon', name: 'Goregaon', area: 'Goregaon Station', lat: 19.1647, lng: 72.8492, kind: 'station' },
  { id: 'malad', name: 'Malad', area: 'Malad Station', lat: 19.1868, lng: 72.8484, kind: 'station' },
  { id: 'kandivali', name: 'Kandivali', area: 'Kandivali Station', lat: 19.2045, lng: 72.8517, kind: 'station' },
  { id: 'borivali', name: 'Borivali', area: 'Borivali Station', lat: 19.2295, lng: 72.8573, kind: 'station' },
  { id: 'mulund', name: 'Mulund', area: 'Mulund Station', lat: 19.1726, lng: 72.9566, kind: 'station' },
  { id: 'thane', name: 'Thane', area: 'Thane Station', lat: 19.186, lng: 72.9757, kind: 'station' },
  { id: 'vashi', name: 'Vashi', area: 'Vashi Station, Navi Mumbai', lat: 19.0771, lng: 72.9988, kind: 'station' },
  { id: 'belapur', name: 'CBD Belapur', area: 'Belapur Station, Navi Mumbai', lat: 19.0187, lng: 73.039, kind: 'station' },
]

export const placeById = (id: string) => PLACES.find((p) => p.id === id)

export function searchPlaces(q: string): Place[] {
  const s = q.trim().toLowerCase()
  const byDistance = [...PLACES].sort((a, b) => dist(a) - dist(b))
  if (!s) return byDistance.slice(0, 8)
  return byDistance.filter((p) => p.name.toLowerCase().includes(s) || p.area.toLowerCase().includes(s)).slice(0, 8)
}

const dist = (p: Place) => Math.abs(p.lat - CAMPUS.lat) + Math.abs(p.lng - CAMPUS.lng)
