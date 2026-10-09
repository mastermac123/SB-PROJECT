import type { LatLng } from './types'

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * Move a map marker smoothly from one point to another (like a ride app's car)
 * instead of jumping on every GPS update. Returns a cancel function.
 */
export function glide(from: LatLng, to: LatLng, onFrame: (p: LatLng) => void, ms = 1400): () => void {
  if (reduceMotion() || (from.lat === to.lat && from.lng === to.lng)) {
    onFrame(to)
    return () => {}
  }
  let raf = 0
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    const k = ease(t)
    onFrame({ lat: from.lat + (to.lat - from.lat) * k, lng: from.lng + (to.lng - from.lng) * k })
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/** Reveal a route from start to end over `ms` (the "route draws itself" effect). */
export function drawRoute(coords: LatLng[], onFrame: (partial: LatLng[]) => void, ms = 900): () => void {
  if (reduceMotion() || coords.length < 3) {
    onFrame(coords)
    return () => {}
  }
  let raf = 0
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    const k = 1 - (1 - t) ** 3
    onFrame(coords.slice(0, Math.max(2, Math.ceil(coords.length * k))))
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
