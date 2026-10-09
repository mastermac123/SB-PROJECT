/**
 * Loads the Google Maps JavaScript API once. If the key is rejected or the script
 * can't load, maps switch back to the free OpenStreetMap map.
 */

let promise: Promise<typeof google.maps> | null = null
let failed = false
const listeners = new Set<() => void>()

export const googleMapsFailed = () => failed

export function onGoogleMapsFailed(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

function fail(reason: string) {
  if (failed) return
  failed = true
  console.warn(`[ridesync] Google Maps unavailable (${reason}), using OpenStreetMap instead`)
  for (const fn of listeners) fn()
}

declare global {
  interface Window {
    __ridesyncGmaps?: () => void
    gm_authFailure?: () => void
  }
}

export function loadGoogleMaps(key: string): Promise<typeof google.maps> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) return resolve(window.google.maps)
    // Called by Google when the key is invalid, restricted or billing is off.
    window.gm_authFailure = () => {
      fail('key rejected')
      reject(new Error('Google Maps key rejected'))
    }
    window.__ridesyncGmaps = () => resolve(window.google.maps)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=en&region=IN&callback=__ridesyncGmaps`
    s.async = true
    s.onerror = () => {
      fail('script failed to load')
      reject(new Error('Google Maps failed to load'))
    }
    document.head.appendChild(s)
  })
  return promise
}
