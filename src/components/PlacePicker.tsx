import { Building2, GraduationCap, LocateFixed, MapPin, Plane, Search, TrainFront, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '@/data/places'
import type { Place } from '@/lib/types'
import { ApiError, requestLocation, searchPlacesRemote } from '@/services/api'
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
  const timer = useRef<number>(undefined)

  useEffect(() => {
    if (!open) {
      setQ('')
      setRemote([])
      setLocError(null)
    }
  }, [open])

  useEffect(() => {
    setRemote([])
    if (q.trim().length < 3) return
    const ctrl = new AbortController()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      searchPlacesRemote(q)
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
      onPick(await requestLocation())
    } catch (e) {
      setLocError(e instanceof ApiError ? e.message : 'Couldn’t get your location.')
    } finally {
      setLocating(false)
    }
  }

  const pick = (p: Place) => {
    onPick(p)
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
              <ListRow icon={<LocateFixed />} title={locating ? 'Finding your location…' : 'Use current location'} subtitle="Uses your device’s GPS" onClick={useLocation} chevron={false} />
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
            <ListRow key={p.id} icon={KIND_ICON[p.kind ?? 'area']} title={p.name} subtitle={p.area} onClick={() => pick(p)} chevron={false} />
          ))}
          {extra.length > 0 && (
            <>
              <div className="section__title" style={{ padding: '12px 0 4px' }}>
                More places
              </div>
              {extra.map((p) => (
                <ListRow key={p.id} icon={<MapPin />} title={p.name} subtitle={p.area} onClick={() => pick(p)} chevron={false} />
              ))}
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
