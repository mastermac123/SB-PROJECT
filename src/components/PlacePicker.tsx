import { ArrowLeft, Building2, GraduationCap, LocateFixed, MapPin, MapPinned, Plane, Search, TrainFront, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '@/data/places'
import type { Place } from '@/lib/types'
import { ApiError, locatePrecise, resolvePlaceRemote, searchPlacesRemote } from '@/services/api'
import { PinPicker } from './PinPicker'
import { ModalSheet } from './Sheet'
import { Field, IconButton, ListRow, Notice } from './ui'

const KIND_ICON = {
  campus: <GraduationCap />,
  station: <TrainFront />,
  airport: <Plane />,
  area: <Building2 />,
  custom: <MapPin />,
}

export function PlacePicker({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  onClose: () => void
  onPick: (p: Place) => void
}) {
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<Place[]>([])
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  // Set when the student is fine-tuning the pin on the map.
  const [pin, setPin] = useState<{ start?: { lat: number; lng: number }; accuracy?: number } | null>(null)
  const timer = useRef<number>(undefined)
  // One Google autocomplete session per search: typing + the final pick are billed as one lookup.
  const session = useRef<string>(newSession())

  useEffect(() => {
    if (!open) {
      setQ('')
      setRemote([])
      setLocError(null)
      setPickError(null)
      setResolving(null)
      setPin(null)
      session.current = newSession()
    }
  }, [open])

  useEffect(() => {
    setRemote([])
    if (q.trim().length < 3) return
    const ctrl = new AbortController()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      searchPlacesRemote(q, session.current)
        .then((r) => !ctrl.signal.aborted && setRemote(r))
        .catch(() => {})
    }, 450)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer.current)
    }
  }, [q])

  const local = searchPlaces(q)
  const localIds = new Set(local.map((p) => p.name.toLowerCase()))
  const extra = remote.filter((p) => !localIds.has(p.name.toLowerCase()))

  async function useLocation() {
    setLocating(true)
    setLocError(null)
    try {
      // GPS (or Wi-Fi on laptops) can be tens of metres off: confirm the spot on the map.
      const p = await locatePrecise()
      setPin({ start: { lat: p.lat, lng: p.lng }, accuracy: p.accuracy })
    } catch (e) {
      setLocError(e instanceof ApiError ? e.message : 'Couldn’t get your location.')
    } finally {
      setLocating(false)
    }
  }

  const pick = async (p: Place) => {
    if (!p.googlePlaceId) return onPick(p)
    if (resolving) return
    setResolving(p.id)
    setPickError(null)
    try {
      const full = await resolvePlaceRemote(p.googlePlaceId, session.current)
      session.current = newSession()
      onPick({ ...full, name: p.name || full.name, area: p.area || full.area })
    } catch (e) {
      setPickError(e instanceof ApiError ? e.message : 'Couldn’t load that place. Try again.')
    } finally {
      setResolving(null)
    }
  }

  if (pin) {
    return (
      <ModalSheet open={open} onClose={onClose} title={title}>
        <div className="stack gap-3">
          <div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPin(null)}>
              <span className="btn__label">
                <ArrowLeft /> Back to search
              </span>
            </button>
          </div>
          <PinPicker title={title} start={pin.start} accuracy={pin.accuracy} onConfirm={onPick} />
        </div>
      </ModalSheet>
    )
  }

  return (
    <ModalSheet open={open} onClose={onClose} title={title}>
      <div className="stack gap-3">
        <Field
          quiet
          autoFocus
          placeholder="Search places, stations, areas"
          aria-label="Search places"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leading={<Search />}
          trailing={
            q ? (
              <IconButton type="button" label="Clear search" onClick={() => setQ('')}>
                <X />
              </IconButton>
            ) : undefined
          }
        />
        <div className="list">
          {!q && (
            <>
              <ListRow icon={<LocateFixed />} title={locating ? 'Finding your location…' : 'Use current location'} subtitle="Uses your device’s location — then adjust the pin" onClick={useLocation} chevron={false} />
              <ListRow icon={<MapPinned />} title="Choose on map" subtitle="Drag the map to your exact building or gate" onClick={() => setPin({})} chevron={false} />
              {locError && (
                <div style={{ paddingBottom: 8 }}>
                  <Notice tone="warning" icon={<MapPin />} title={locError === 'Location permission denied' ? 'Location is blocked' : undefined}>
                    {locError === 'Location permission denied'
                      ? 'Allow location for this site in your browser settings, or pick a place from the list.'
                      : locError}
                  </Notice>
                </div>
              )}
              <div className="section__title" style={{ padding: '12px 0 4px' }}>
                Popular with VIT students
              </div>
            </>
          )}
          {local.map((p) => (
            <ListRow key={p.id} icon={KIND_ICON[p.kind ?? 'area']} title={p.name} subtitle={p.area} onClick={() => void pick(p)} chevron={false} />
          ))}
          {extra.length > 0 && (
            <>
              <div className="section__title" style={{ padding: '12px 0 4px' }}>
                More places
              </div>
              {extra.map((p) => (
                <ListRow
                  key={p.id}
                  icon={<MapPin />}
                  title={p.name}
                  subtitle={resolving === p.id ? 'Loading…' : p.area}
                  onClick={() => void pick(p)}
                  chevron={false}
                />
              ))}
              {pickError && (
                <div style={{ paddingTop: 8 }}>
                  <Notice tone="warning" icon={<MapPin />}>
                    {pickError}
                  </Notice>
                </div>
              )}
            </>
          )}
          {q && local.length === 0 && extra.length === 0 && (
            <p className="t-sm t-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              No places match “{q}”. Try a landmark or area name.
            </p>
          )}
        </div>
      </div>
    </ModalSheet>
  )
}

function newSession() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}
