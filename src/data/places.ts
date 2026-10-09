import type { CampusId, Place } from '@/lib/types'

export const CAMPUSES: Record<CampusId, { id: CampusId; name: string; short: string; gate: Place; center: [number, number] }> = {
  chennai: {
    id: 'chennai',
    name: 'VIT Chennai',
    short: 'VIT Chennai',
    gate: { id: 'vit-chennai', name: 'VIT Chennai', area: 'Main Gate, Vandalur–Kelambakkam Rd', lat: 12.8406, lng: 80.1534, kind: 'campus' },
    center: [12.93, 80.19],
  },
  vellore: {
    id: 'vellore',
    name: 'VIT Vellore',
    short: 'VIT Vellore',
    gate: { id: 'vit-vellore', name: 'VIT Vellore', area: 'Main Gate, Katpadi', lat: 12.9692, lng: 79.1559, kind: 'campus' },
    center: [12.96, 79.15],
  },
}

/** Curated places students actually travel to. Search also falls back to OpenStreetMap. */
export const PLACES: Place[] = [
  CAMPUSES.chennai.gate,
  CAMPUSES.vellore.gate,
  { id: 'vit-chennai-mh', name: 'VIT Chennai Men’s Hostel', area: 'VIT Chennai campus', lat: 12.8432, lng: 80.1559, kind: 'campus' },
  { id: 'vit-chennai-lh', name: 'VIT Chennai Ladies’ Hostel', area: 'VIT Chennai campus', lat: 12.8389, lng: 80.1561, kind: 'campus' },
  { id: 'maa', name: 'Chennai Airport', area: 'Tirusulam, Chennai', lat: 12.9941, lng: 80.1709, kind: 'airport' },
  { id: 'mas', name: 'Chennai Central', area: 'Park Town, Chennai', lat: 13.0827, lng: 80.2757, kind: 'station' },
  { id: 'ms', name: 'Chennai Egmore', area: 'Egmore, Chennai', lat: 13.0732, lng: 80.2609, kind: 'station' },
  { id: 'tbm', name: 'Tambaram', area: 'Tambaram Railway Station', lat: 12.9249, lng: 80.1, kind: 'station' },
  { id: 'cmbt', name: 'Kilambakkam Bus Terminus', area: 'Vandalur, Chennai', lat: 12.8697, lng: 80.0827, kind: 'station' },
  { id: 'tnagar', name: 'T. Nagar', area: 'Pondy Bazaar, Chennai', lat: 13.0418, lng: 80.2341, kind: 'area' },
  { id: 'velachery', name: 'Velachery', area: 'Phoenix MarketCity, Chennai', lat: 12.9915, lng: 80.2167, kind: 'area' },
  { id: 'guindy', name: 'Guindy', area: 'Guindy Metro, Chennai', lat: 13.0067, lng: 80.2206, kind: 'area' },
  { id: 'adyar', name: 'Adyar', area: 'Adyar Signal, Chennai', lat: 13.0012, lng: 80.2565, kind: 'area' },
  { id: 'besant', name: 'Besant Nagar', area: 'Elliot’s Beach, Chennai', lat: 12.9986, lng: 80.2669, kind: 'area' },
  { id: 'annanagar', name: 'Anna Nagar', area: 'Anna Nagar Tower, Chennai', lat: 13.085, lng: 80.2101, kind: 'area' },
  { id: 'omr', name: 'Sholinganallur', area: 'OMR, Chennai', lat: 12.901, lng: 80.2279, kind: 'area' },
  { id: 'siruseri', name: 'SIPCOT Siruseri', area: 'OMR, Chennai', lat: 12.825, lng: 80.219, kind: 'area' },
  { id: 'kelambakkam', name: 'Kelambakkam', area: 'Kelambakkam Bus Stand', lat: 12.7867, lng: 80.2209, kind: 'area' },
  { id: 'chromepet', name: 'Chromepet', area: 'GST Road, Chennai', lat: 12.9516, lng: 80.1462, kind: 'area' },
  { id: 'guduvanchery', name: 'Guduvanchery', area: 'GST Road', lat: 12.8447, lng: 80.0606, kind: 'area' },
  { id: 'medavakkam', name: 'Medavakkam', area: 'Medavakkam Junction, Chennai', lat: 12.9171, lng: 80.1923, kind: 'area' },
  { id: 'mylapore', name: 'Mylapore', area: 'Kapaleeshwarar Temple, Chennai', lat: 13.0339, lng: 80.2696, kind: 'area' },
  { id: 'katpadi', name: 'Katpadi Junction', area: 'Katpadi, Vellore', lat: 12.9716, lng: 79.1386, kind: 'station' },
  { id: 'vellore-bus', name: 'Vellore New Bus Stand', area: 'Vellore', lat: 12.9346, lng: 79.1373, kind: 'station' },
  { id: 'cmc', name: 'CMC Vellore', area: 'Ida Scudder Rd, Vellore', lat: 12.9246, lng: 79.1353, kind: 'area' },
  { id: 'blr-majestic', name: 'Bengaluru Majestic', area: 'Kempegowda Bus Station, Bengaluru', lat: 12.9767, lng: 77.5713, kind: 'station' },
  { id: 'blr-airport', name: 'Bengaluru Airport', area: 'Devanahalli, Bengaluru', lat: 13.1989, lng: 77.7068, kind: 'airport' },
  { id: 'blr-silkboard', name: 'Silk Board', area: 'BTM Layout, Bengaluru', lat: 12.9177, lng: 77.6238, kind: 'area' },
]

export const placeById = (id: string) => PLACES.find((p) => p.id === id)

export function searchPlaces(q: string, campus?: CampusId): Place[] {
  const s = q.trim().toLowerCase()
  const list = campus
    ? [...PLACES].sort((a, b) => campusDistance(a, campus) - campusDistance(b, campus))
    : PLACES
  if (!s) return list.slice(0, 8)
  return list.filter((p) => p.name.toLowerCase().includes(s) || p.area.toLowerCase().includes(s)).slice(0, 8)
}

function campusDistance(p: Place, campus: CampusId) {
  const g = CAMPUSES[campus].gate
  return Math.abs(p.lat - g.lat) + Math.abs(p.lng - g.lng)
}
