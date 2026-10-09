import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { LatLng } from '@/lib/types'
import { useConfig } from '@/services/api'
import { glide } from '@/lib/glide'
import { googleMapsFailed, onGoogleMapsFailed } from './googleLoader'

const GoogleMap = lazy(() => import('./GoogleMap'))

const CARTO_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png'

export type MapMarker = {
  id: string
  at: LatLng
  kind: 'pickup' | 'drop' | 'me' | 'car'
  label?: string
  sublabel?: string
  heading?: number
  darkLabel?: boolean
}

export type MapRoute = { id: string; coords: LatLng[]; kind?: 'primary' | 'alt' | 'muted' }

export type MapPadding = { top?: number; bottom?: number; left?: number; right?: number }

const CAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 19 21 12 17 5 21Z" fill="currentColor"/></svg>'

/** Marker HTML shared by the Leaflet and Google maps (styled by .mk-* in components.css). */
export function markerHtml(m: MapMarker): { html: string; size: number } {
  const label = m.label
    ? `<span class="mk-label${m.darkLabel ? ' mk-label--dark' : ''}">${escape(m.label)}${m.sublabel ? `<small>${escape(m.sublabel)}</small>` : ''}</span>`
    : ''
  if (m.kind === 'car') {
    return {
      html: `<div class="mk-car"><span class="mk-car__arrow" style="display:grid;transform:rotate(${m.heading ?? 0}deg);transition:transform 300ms">${CAR_SVG}</span></div>${label}`,
      size: 36,
    }
  }
  const cls = m.kind === 'pickup' ? 'mk-pin' : m.kind === 'drop' ? 'mk-drop' : 'mk-me'
  return { html: `<div class="${cls}"></div>${label}`, size: 18 }
}

function iconFor(m: MapMarker) {
  const { html, size } = markerHtml(m)
  return L.divIcon({ className: 'mk', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const ROUTE_STYLE = {
  primary: { casing: { color: '#ffffff', weight: 9, opacity: 1 }, line: { color: '#5038e6', weight: 5, opacity: 1 } },
  alt: { casing: { color: '#ffffff', weight: 7, opacity: 0.9 }, line: { color: '#a99ef2', weight: 4, opacity: 0.9 } },
  muted: { casing: { color: '#ffffff', weight: 7, opacity: 0.9 }, line: { color: '#9aa0b8', weight: 4, opacity: 0.9, dashArray: '2 8' } },
}

export type MapViewProps = {
  markers?: MapMarker[]
  routes?: MapRoute[]
  fit?: LatLng[]
  padding?: MapPadding
  center?: LatLng
  zoom?: number
  interactive?: boolean
  animateRoutes?: boolean
  /** Keep this marker id in view as it moves. */
  follow?: string
}

/**
 * Map surface. Google Maps when the server has a Google key, otherwise Leaflet with
 * OpenStreetMap tiles. If Google fails to load (bad key, quota), it switches to Leaflet.
 */
export function MapView(props: MapViewProps) {
  const config = useConfig().data
  const [failed, setFailed] = useState(googleMapsFailed)
  useEffect(() => onGoogleMapsFailed(() => setFailed(true)), [])
  const google = config?.maps?.google
  if (!config) return <MapShell />
  if (google && !failed) {
    return (
      <Suspense fallback={<MapShell />}>
        <GoogleMap {...props} browserKey={google.browserKey} />
      </Suspense>
    )
  }
  return <LeafletMap {...props} />
}

function MapShell() {
  return (
    <div className="map">
      <div className="map__fallback" aria-hidden />
    </div>
  )
}

/** Leaflet + CARTO/MapTiler tiles (OpenStreetMap data). Missing tiles fall back to a neutral grid. */
function LeafletMap({
  markers = [],
  routes = [],
  fit,
  padding,
  center = { lat: 12.93, lng: 80.19 },
  zoom = 12,
  interactive = true,
  animateRoutes = true,
  follow,
}: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const markerRefs = useRef(new Map<string, { marker: L.Marker; sig: string }>())
  const gliding = useRef(new Map<string, () => void>())
  const tileLayer = useRef<L.TileLayer | null>(null)
  const tiles = useConfig().data?.maps?.tiles
  const traffic = useConfig().data?.maps?.traffic

  // Create map once
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
      zoomSnap: 0.25,
      fadeAnimation: true,
    }).setView([center.lat, center.lng], zoom)
    m.attributionControl.setPrefix(false)
    routeLayer.current = L.layerGroup().addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize({ pan: false }))
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      markerRefs.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tiles (provider comes from the server config: MapTiler when a key is set, else CARTO/OpenStreetMap)
  const tileUrl = tiles?.url ?? CARTO_URL
  const tileAttribution =
    tiles?.attribution ?? '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'
  useEffect(() => {
    const m = map.current
    if (!m) return
    tileLayer.current?.remove()
    const layer = L.tileLayer(tileUrl, { attribution: tileAttribution, subdomains: 'abcd', maxZoom: 19 }).addTo(m)
    // If the keyed provider keeps failing (bad key, quota), switch to the free CARTO map.
    let errors = 0
    if (tileUrl !== CARTO_URL)
      layer.on('tileerror', () => {
        if (++errors !== 4) return
        console.warn('[ridesync] map tiles failing — switching to the free OpenStreetMap map')
        layer.setUrl(CARTO_URL)
      })
    tileLayer.current = layer
  }, [tileUrl, tileAttribution])

  // Live traffic: green / orange / red road colours over the map (TomTom, via our server).
  useEffect(() => {
    const m = map.current
    if (!m || !traffic) return
    const layer = L.tileLayer('/api/traffic/{z}/{x}/{y}.png', { minZoom: 10, maxZoom: 19, maxNativeZoom: 18, opacity: 0.85, attribution: 'Traffic © TomTom', zIndex: 2 }).addTo(m)
    // Refresh every 2 minutes so the colours follow real traffic.
    const t = window.setInterval(() => layer.setUrl(`/api/traffic/{z}/{x}/{y}.png?t=${Math.floor(Date.now() / 120_000)}`), 120_000)
    return () => {
      window.clearInterval(t)
      layer.remove()
    }
  }, [traffic])

  // Routes
  const routeSig = routes.map((r) => `${r.id}:${r.kind}:${r.coords.length}:${r.coords[0]?.lat.toFixed(4)}:${r.coords.at(-1)?.lat.toFixed(4)}`).join('|')
  useEffect(() => {
    const layer = routeLayer.current
    if (!layer) return
    layer.clearLayers()
    const ordered = [...routes].sort((a, b) => (a.kind === 'primary' ? 1 : 0) - (b.kind === 'primary' ? 1 : 0))
    for (const r of ordered) {
      const style = ROUTE_STYLE[r.kind ?? 'primary']
      const pts = r.coords.map((c) => [c.lat, c.lng] as [number, number])
      const casing = L.polyline(pts, { ...style.casing, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer)
      const line = L.polyline(pts, { ...style.line, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layer)
      if (animateRoutes && (r.kind ?? 'primary') === 'primary') {
        for (const pl of [casing, line]) {
          const path = pl.getElement() as SVGPathElement | undefined
          if (!path || typeof path.getTotalLength !== 'function') continue
          const len = path.getTotalLength()
          path.style.strokeDasharray = `${len}`
          path.style.strokeDashoffset = `${len}`
          path.getBoundingClientRect()
          path.style.transition = 'stroke-dashoffset 900ms cubic-bezier(0.2, 0, 0, 1)'
          path.style.strokeDashoffset = '0'
          setTimeout(() => {
            path.style.strokeDasharray = ''
            path.style.transition = ''
          }, 950)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig])

  // Markers — update in place so moving markers glide instead of flicker.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    for (const mk of markers) {
      seen.add(mk.id)
      const sig = `${mk.kind}|${mk.label}|${mk.sublabel}|${mk.darkLabel}`
      const existing = markerRefs.current.get(mk.id)
      if (existing && existing.sig === sig) {
        if (mk.kind === 'car') {
          // The car glides between GPS updates like in a ride app.
          const cur = existing.marker.getLatLng()
          gliding.current.get(mk.id)?.()
          gliding.current.set(mk.id, glide({ lat: cur.lat, lng: cur.lng }, mk.at, (p) => existing.marker.setLatLng([p.lat, p.lng])))
        } else {
          existing.marker.setLatLng([mk.at.lat, mk.at.lng])
        }
        if (mk.kind === 'car') {
          const arrow = existing.marker.getElement()?.querySelector<HTMLElement>('.mk-car__arrow')
          if (arrow) arrow.style.transform = `rotate(${mk.heading ?? 0}deg)`
        }
      } else {
        existing?.marker.remove()
        const marker = L.marker([mk.at.lat, mk.at.lng], { icon: iconFor(mk), keyboard: false, interactive: false, zIndexOffset: mk.kind === 'car' ? 1000 : 0 }).addTo(m)
        markerRefs.current.set(mk.id, { marker, sig })
      }
    }
    for (const [id, ref] of markerRefs.current) {
      if (!seen.has(id)) {
        ref.marker.remove()
        markerRefs.current.delete(id)
        gliding.current.get(id)?.()
        gliding.current.delete(id)
      }
    }
  }, [markers])

  // Fit to bounds
  const fitSig = fit?.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|') + JSON.stringify(padding ?? {})
  useEffect(() => {
    const m = map.current
    if (!m || !fit || fit.length === 0) return
    const pad = { top: 72, bottom: 48, left: 48, right: 48, ...padding }
    if (fit.length === 1) {
      m.setView([fit[0].lat, fit[0].lng], 14, { animate: true })
      return
    }
    const b = L.latLngBounds(fit.map((p) => [p.lat, p.lng] as [number, number]))
    m.flyToBounds(b, { paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], duration: 0.6, maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSig])

  // Follow a moving marker
  const followed = follow ? markers.find((x) => x.id === follow) : undefined
  useEffect(() => {
    const m = map.current
    if (!m || !followed) return
    const inner = m.getBounds().pad(-0.25)
    if (!inner.contains([followed.at.lat, followed.at.lng])) m.panTo([followed.at.lat, followed.at.lng], { animate: true, duration: 0.8 })
  }, [followed?.at.lat, followed?.at.lng, followed])

  return (
    <div className="map">
      <div className="map__fallback" aria-hidden />
      <div ref={el} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Map showing the route" />
    </div>
  )
}
