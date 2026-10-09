import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CAMPUS } from '@/data/places'
import type { Place } from '@/lib/types'
import { ApiError, locatePrecise, reversePlace, useConfig } from '@/services/api'
import { Button, IconButton, Notice, cx } from './ui'

const CARTO_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png'

/**
 * Ola/Uber-style "move the map to set the pin": the pin stays in the middle,
 * the place name updates when the map stops moving.
 */
export function PinPicker({
  title,
  start,
  accuracy: startAccuracy,
  onConfirm,
}: {
  title: string
  start?: { lat: number; lng: number }
  accuracy?: number
  onConfirm: (p: Place) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const ring = useRef<L.Circle | null>(null)
  const seq = useRef(0)
  const tiles = useConfig().data?.maps?.tiles
  const [center, setCenter] = useState(start ?? { lat: CAMPUS.lat, lng: CAMPUS.lng })
  const [accuracy, setAccuracy] = useState(startAccuracy)
  const [moving, setMoving] = useState(false)
  const [named, setNamed] = useState<{ name: string; area: string } | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!el.current) return
    const s = start ?? { lat: CAMPUS.lat, lng: CAMPUS.lng }
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([s.lat, s.lng], 18)
    L.tileLayer(tiles?.url ?? CARTO_URL, { maxZoom: 19, subdomains: 'abcd', attribution: tiles?.attribution ?? '© OpenStreetMap © CARTO' }).addTo(m)
    m.on('movestart', () => setMoving(true))
    m.on('moveend', () => {
      const c = m.getCenter()
      setMoving(false)
      setCenter({ lat: c.lat, lng: c.lng })
    })
    map.current = m
    // The sheet animates open; let Leaflet measure its final size.
    const t = window.setTimeout(() => m.invalidateSize(), 250)
    return () => {
      window.clearTimeout(t)
      m.remove()
      map.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current
    ring.current?.remove()
    ring.current = null
    if (m && start && accuracy && accuracy > 15) {
      ring.current = L.circle([start.lat, start.lng], { radius: accuracy, color: '#5038e6', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m)
    }
  }, [accuracy, start])

  useEffect(() => {
    if (moving) return
    const id = ++seq.current
    setNamed(null)
    reversePlace(center.lat, center.lng)
      .then((r) => id === seq.current && setNamed(r))
      .catch(() => id === seq.current && setNamed({ name: 'Pinned location', area: `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` }))
  }, [center, moving])

  async function myLocation() {
    setLocating(true)
    setError(null)
    try {
      const p = await locatePrecise()
      setAccuracy(p.accuracy)
      map.current?.setView([p.lat, p.lng], 18)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t get your location.')
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="stack gap-3">
      <div className="pinpick">
        <div ref={el} className="pinpick__map" />
        <div className={cx('pinpick__pin', moving && 'is-moving')} aria-hidden>
          <span className="pinpick__tag">{moving ? 'Release to set' : title}</span>
          <MapPin />
        </div>
        <div className="pinpick__locate">
          <IconButton type="button" surface label="Go to my location" onClick={() => void myLocation()} disabled={locating}>
            <LocateFixed />
          </IconButton>
        </div>
      </div>
      <p className="t-sm t-muted">Move the map to put the pin exactly on your building or gate.</p>
      <div className="row gap-2" style={{ alignItems: 'flex-start' }}>
        <MapPin style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
        <div className="grow" style={{ minWidth: 0 }}>
          {moving || !named ? (
            <span className="t-muted">Finding this place…</span>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>{named.name}</div>
              {named.area && <div className="t-sm t-muted">{named.area}</div>}
            </>
          )}
        </div>
      </div>
      {accuracy !== undefined && accuracy > 50 && (
        <Notice tone="warning" icon={<LocateFixed />}>
          Your location is only accurate to about {Math.round(accuracy)} m (laptops use Wi-Fi, not GPS). Drag the map so the pin sits on your exact spot.
        </Notice>
      )}
      {error && <Notice tone="warning">{error}</Notice>}
      <Button
        block
        disabled={moving || !named}
        onClick={() =>
          named &&
          onConfirm({
            id: `pin-${center.lat.toFixed(5)},${center.lng.toFixed(5)}`,
            name: named.name,
            area: named.area,
            lat: center.lat,
            lng: center.lng,
            kind: 'custom',
          })
        }
      >
        Confirm {title.toLowerCase()}
      </Button>
    </div>
  )
}
