import { useEffect, useRef, useState } from 'react'
import { drawRoute, glide } from '@/lib/glide'
import { loadGoogleMaps } from './googleLoader'
import { markerHtml, ROUTE_STYLE, type MapMarker, type MapViewProps } from './MapView'

type HtmlMarker = google.maps.OverlayView & { el: HTMLDivElement; pos: google.maps.LatLngLiteral; update(m: MapMarker): void; setPosition(p: google.maps.LatLngLiteral): void }

/** Quieter Google basemap so routes and pins stand out (business pins and transit icons hidden). */
const STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ saturation: -100 }, { lightness: 20 }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

/** HTML marker drawn above the map, using the same markup and CSS as the Leaflet map. */
function makeMarkerClass(g: typeof google.maps) {
  return class extends g.OverlayView {
    el = document.createElement('div')
    pos: google.maps.LatLngLiteral
    private size = 18
    constructor(m: MapMarker) {
      super()
      this.pos = { lat: m.at.lat, lng: m.at.lng }
      this.el.className = 'mk'
      this.el.style.position = 'absolute'
      this.update(m)
    }
    update(m: MapMarker) {
      const { html, size } = markerHtml(m)
      this.size = size
      this.el.innerHTML = html
      this.el.style.width = this.el.style.height = `${size}px`
      this.el.style.zIndex = m.kind === 'car' ? '10' : '1'
      this.draw()
    }
    setPosition(p: google.maps.LatLngLiteral) {
      this.pos = p
      this.draw()
    }
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(this.el)
    }
    draw() {
      const pt = this.getProjection()?.fromLatLngToDivPixel(this.pos)
      if (!pt) return
      this.el.style.left = `${pt.x - this.size / 2}px`
      this.el.style.top = `${pt.y - this.size / 2}px`
    }
    onRemove() {
      this.el.remove()
    }
  }
}

export default function GoogleMap({
  browserKey,
  markers = [],
  routes = [],
  fit,
  padding,
  center = { lat: 19.0222, lng: 72.8711 },
  zoom = 12,
  interactive = true,
  animateRoutes = true,
  follow,
}: MapViewProps & { browserKey: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const Marker = useRef<ReturnType<typeof makeMarkerClass> | null>(null)
  const markerRefs = useRef(new Map<string, { marker: HtmlMarker; sig: string }>())
  const lines = useRef<google.maps.Polyline[]>([])
  const gliding = useRef(new Map<string, () => void>())
  const stopDraw = useRef<() => void>(undefined)
  const [ready, setReady] = useState(false)

  // Create the map once the API has loaded.
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(browserKey)
      .then((g) => {
        if (cancelled || !el.current || map.current) return
        Marker.current = makeMarkerClass(g)
        map.current = new g.Map(el.current, {
          center,
          zoom,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: interactive ? 'greedy' : 'none',
          styles: STYLES,
          backgroundColor: '#eef0f5',
        })
        // Google's own live traffic colours (free with the map).
        new g.TrafficLayer().setMap(map.current)
        setReady(true)
      })
      .catch(() => {
        /* MapView switches to the OpenStreetMap map */
      })
    return () => {
      cancelled = true
      for (const { marker } of markerRefs.current.values()) marker.setMap(null)
      markerRefs.current.clear()
      for (const l of lines.current) l.setMap(null)
      lines.current = []
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserKey])

  // Routes (white casing under a coloured line; dashed for "muted").
  const routeSig = routes.map((r) => `${r.id}:${r.kind}:${r.coords.length}:${r.coords[0]?.lat.toFixed(4)}:${r.coords.at(-1)?.lat.toFixed(4)}`).join('|')
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    for (const l of lines.current) l.setMap(null)
    lines.current = []
    stopDraw.current?.()
    stopDraw.current = undefined
    for (const r of routes) {
      const kind = r.kind ?? 'primary'
      const style = ROUTE_STYLE[kind]
      const path = r.coords.map((c) => ({ lat: c.lat, lng: c.lng }))
      const z = kind === 'primary' ? 3 : 1
      lines.current.push(
        new google.maps.Polyline({ map: m, path, clickable: false, strokeColor: style.casing.color, strokeWeight: style.casing.weight, strokeOpacity: style.casing.opacity, zIndex: z }),
      )
      if (kind === 'muted') {
        lines.current.push(
          new google.maps.Polyline({
            map: m,
            path,
            clickable: false,
            strokeOpacity: 0,
            zIndex: z + 1,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: style.line.opacity, strokeColor: style.line.color, strokeWeight: style.line.weight, scale: 2 }, offset: '0', repeat: '12px' }],
          }),
        )
      } else {
        lines.current.push(
          new google.maps.Polyline({ map: m, path, clickable: false, strokeColor: style.line.color, strokeWeight: style.line.weight, strokeOpacity: style.line.opacity, zIndex: z + 1 }),
        )
        // The main route draws itself from pickup to destination.
        if (kind === 'primary' && animateRoutes) {
          const casing = lines.current.at(-2)!
          const line = lines.current.at(-1)!
          stopDraw.current = drawRoute(path, (partial) => {
            casing.setPath(partial)
            line.setPath(partial)
          })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig, ready])

  // Markers — moved in place so a driving car glides instead of flickering.
  useEffect(() => {
    const m = map.current
    const Cls = Marker.current
    if (!m || !Cls || !ready) return
    const seen = new Set<string>()
    for (const mk of markers) {
      seen.add(mk.id)
      const sig = `${mk.kind}|${mk.label}|${mk.sublabel}|${mk.darkLabel}`
      const existing = markerRefs.current.get(mk.id)
      if (existing && existing.sig === sig) {
        if (mk.kind === 'car') {
          // The car glides between GPS updates like in a ride app.
          gliding.current.get(mk.id)?.()
          gliding.current.set(mk.id, glide(existing.marker.pos, mk.at, (p) => existing.marker.setPosition(p)))
        } else {
          existing.marker.setPosition({ lat: mk.at.lat, lng: mk.at.lng })
        }
        if (mk.kind === 'car') {
          const arrow = existing.marker.el.querySelector<HTMLElement>('.mk-car__arrow')
          if (arrow) arrow.style.transform = `rotate(${mk.heading ?? 0}deg)`
        }
      } else if (existing) {
        existing.marker.update(mk)
        existing.marker.setPosition({ lat: mk.at.lat, lng: mk.at.lng })
        existing.sig = sig
      } else {
        const marker = new Cls(mk) as HtmlMarker
        marker.setMap(m)
        markerRefs.current.set(mk.id, { marker, sig })
      }
    }
    for (const [id, ref] of markerRefs.current) {
      if (!seen.has(id)) {
        ref.marker.setMap(null)
        markerRefs.current.delete(id)
        gliding.current.get(id)?.()
        gliding.current.delete(id)
      }
    }
  }, [markers, ready])

  // Fit to the given points, leaving room for the sheet and header.
  const fitSig = fit?.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|') + JSON.stringify(padding ?? {})
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !fit || fit.length === 0) return
    const pad = { top: 72, bottom: 48, left: 48, right: 48, ...padding }
    if (fit.length === 1) {
      m.panTo(fit[0])
      m.setZoom(14)
      return
    }
    const b = new google.maps.LatLngBounds()
    for (const p of fit) b.extend(p)
    m.fitBounds(b, pad)
    const once = google.maps.event.addListenerOnce(m, 'idle', () => {
      if ((m.getZoom() ?? 0) > 15) m.setZoom(15)
    })
    return () => once.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSig, ready])

  // Follow a moving marker when it nears the edge.
  const followed = follow ? markers.find((x) => x.id === follow) : undefined
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !followed) return
    const b = m.getBounds()
    if (!b) return
    const ne = b.getNorthEast()
    const sw = b.getSouthWest()
    const dLat = (ne.lat() - sw.lat()) * 0.25
    const dLng = (ne.lng() - sw.lng()) * 0.25
    const { lat, lng } = followed.at
    if (lat > ne.lat() - dLat || lat < sw.lat() + dLat || lng > ne.lng() - dLng || lng < sw.lng() + dLng) m.panTo({ lat, lng })
  }, [followed?.at.lat, followed?.at.lng, followed, ready])

  return (
    <div className="map">
      <div className="map__fallback" aria-hidden />
      <div ref={el} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Map showing the route" />
    </div>
  )
}
