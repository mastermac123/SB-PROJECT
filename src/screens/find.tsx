import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Ban, Bell, CarFront, CigaretteOff, Clock, PawPrint, Pencil, Route as RouteIcon, SearchX, Sparkle, TriangleAlert, Venus, VolumeX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapView, type MapMarker, type MapRoute } from '@/components/MapView'
import { RideCard } from '@/components/RideCard'
import { NetworkError, StateView } from '@/components/States'
import { BackButton } from '@/components/TopBar'
import { TripForm, validateTrip, type TripDraft } from '@/components/TripForm'
import { Button, Chip, Notice, RideCardSkeleton, Segmented } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { CAMPUSES } from '@/data/places'
import { useIsDesktop } from '@/hooks'
import { dayLabel, plural } from '@/lib/format'
import { desiredTime, PREFERENCE_LABEL, sortMatches, type SortKey } from '@/lib/matching'
import type { MatchResult, RidePreference, SearchQuery } from '@/lib/types'
import { MapScreen, useMapPadding } from '@/layouts/MapScreen'
import { me } from '@/services/api'
import { useDB } from '@/services/db'
import { estimateRoute, routeNow } from '@/services/routing'
import { defaultQuery, useEnsureResults, useSearch } from '@/state/search'

export const PREF_OPTIONS: { value: RidePreference; icon: React.ReactNode }[] = [
  { value: 'quiet', icon: <VolumeX /> },
  { value: 'female_friendly', icon: <Venus /> },
  { value: 'no_smoking', icon: <CigaretteOff /> },
  { value: 'no_pets', icon: <PawPrint /> },
  { value: 'minimal_detour', icon: <RouteIcon /> },
]

/* ==========================================================================
   Find Ride — search form
   ========================================================================== */

export function FindRide() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const search = useSearch()
  const base = search.query ?? defaultQuery(CAMPUSES[u.campus].gate)
  const [draft, setDraft] = useState<TripDraft>({ pickup: base.pickup, drop: search.query ? base.drop : null, date: base.date, time: base.time, seats: base.seats })
  const [prefs, setPrefs] = useState<RidePreference[]>(search.query?.preferences ?? [])
  const [errors, setErrors] = useState<ReturnType<typeof validateTrip>>({})
  const padding = useMapPadding(0.66)

  const preview = draft.pickup && draft.drop && draft.pickup.id !== draft.drop.id ? estimateRoute(draft.pickup, draft.drop) : null
  const markers: MapMarker[] = [
    ...(draft.pickup ? [{ id: 'p', at: draft.pickup, kind: 'pickup' as const, label: draft.pickup.name }] : []),
    ...(draft.drop ? [{ id: 'd', at: draft.drop, kind: 'drop' as const, label: draft.drop.name }] : []),
  ]

  function submit() {
    const errs = validateTrip(draft)
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return
    const q: SearchQuery = { pickup: draft.pickup!, drop: draft.drop!, date: draft.date, time: draft.time, seats: draft.seats, preferences: prefs }
    void search.run(q)
    nav('/find/results')
  }

  const toggle = (p: RidePreference) => setPrefs((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))

  return (
    <MapScreen
      snaps={[0.66, 0.92]}
      map={<MapView markers={markers} routes={preview ? [{ id: 'preview', coords: [draft.pickup!, draft.drop!], kind: 'muted' }] : []} fit={markers.map((m) => m.at)} padding={padding} />}
      header={
        <div className="stack gap-1" style={{ paddingBottom: 8 }}>
          <h1 className="t-h2">Find a Ride</h1>
          <p className="t-sm t-muted">Rides offered by verified VIT students.</p>
        </div>
      }
      footer={
        <Button size="lg" block onClick={submit}>
          Find AI Matches
        </Button>
      }
    >
      <div className="stack gap-5">
        <TripForm value={draft} onChange={(v) => { setDraft(v); setErrors({}) }} campus={u.campus} userId={u.id} errors={errors} />
        <div className="stack gap-3">
          <div className="row row--between">
            <h2 className="section__title" style={{ padding: 0 }}>
              Preferences
            </h2>
            {prefs.length > 0 && (
              <button className="t-sm t-strong t-primary" onClick={() => setPrefs([])}>
                Clear
              </button>
            )}
          </div>
          <div className="row wrap gap-2">
            {PREF_OPTIONS.map((o) => (
              <Chip key={o.value} selected={prefs.includes(o.value)} icon={o.icon} onClick={() => toggle(o.value)}>
                {PREFERENCE_LABEL[o.value]}
              </Chip>
            ))}
          </div>
          <p className="t-caption t-muted" style={{ fontWeight: 400 }}>
            Preferences adjust your match scores — they don’t hide rides.
          </p>
        </div>
        {preview && (
          <p className="t-sm t-muted row gap-2">
            <Clock size={15} />
            About {Math.round(preview.distanceKm)} km · {preview.durationMin} min by car
          </p>
        )}
      </div>
    </MapScreen>
  )
}

/* ==========================================================================
   AI match results
   ========================================================================== */

export function MatchResults() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const search = useEnsureResults()
  const [sort, setSort] = useState<SortKey>('best')
  const [hover, setHover] = useState<string | null>(null)
  const padding = useMapPadding(0.5)
  const q = search.query

  const sorted = useMemo(() => (search.results ? sortMatches(search.results, sort) : []), [search.results, sort])
  const good = sorted.filter((m) => m.tier !== 'poor')
  const weakOnly = sorted.length > 0 && good.length === 0

  if (!q) {
    return (
      <div className="page" style={{ justifyContent: 'center' }}>
        <StateView icon={<SearchX />} title="Start a search" body="Tell us where you’re going and we’ll find VIT drivers heading your way." actions={<Button block onClick={() => nav('/find')}>Find a Ride</Button>} />
      </div>
    )
  }

  const ridesThatWindow = db.rides.filter(
    (r) => r.status === 'scheduled' && r.driverId !== u.id && Math.abs(+new Date(r.departAt) - desiredTime(q).getTime()) < 4.5 * 3600_000 && +new Date(r.departAt) > Date.now(),
  ).length

  const focus: MatchResult | undefined = sorted.find((m) => m.ride.id === hover) ?? sorted[0]
  const routes: MapRoute[] = sorted.slice(0, 6).map((m) => ({ id: m.ride.id, coords: routeNow(m.ride.origin, m.ride.destination).coords, kind: m.ride.id === focus?.ride.id ? 'primary' : 'alt' }))
  const markers: MapMarker[] = [
    { id: 'p', at: q.pickup, kind: 'pickup', label: 'Pickup', sublabel: q.pickup.name },
    { id: 'd', at: q.drop, kind: 'drop', label: q.drop.name },
  ]
  const fit = [q.pickup, q.drop, ...(focus ? [focus.ride.origin, focus.ride.destination] : [])]

  const loading = search.status === 'loading' || (search.status === 'idle' && !search.results)

  return (
    <MapScreen
      snaps={[0.5, 0.92]}
      initialSnap={0}
      map={<MapView markers={markers} routes={loading ? [] : routes} fit={fit} padding={padding} />}
      top={<BackButton surface to="/find" />}
      header={
        <div className="stack gap-3 grow" style={{ paddingBottom: 12 }}>
          <div className="row gap-2">
            {desktop && <BackButton to="/find" />}
            <button type="button" className="query-pill grow" onClick={() => nav('/find')} aria-label="Edit search">
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="t-body t-strong row gap-1 truncate" style={{ display: 'flex' }}>
                  <span className="truncate">{q.pickup.name}</span>
                  <ArrowRight size={14} className="t-muted" style={{ flex: 'none' }} />
                  <span className="truncate">{q.drop.name}</span>
                </span>
                <span className="t-sm t-muted">
                  {dayLabel(desiredTime(q))}, {desiredTime(q).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {plural(q.seats, 'seat')}
                  {q.preferences.length > 0 && ` · ${plural(q.preferences.length, 'preference')}`}
                </span>
              </span>
              <Pencil size={16} className="t-muted" />
            </button>
          </div>
          {!loading && search.status === 'done' && sorted.length > 0 && (
            <Segmented
              label="Sort rides"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'best', label: 'Best Match' },
                { value: 'earliest', label: 'Earliest' },
                { value: 'fare', label: 'Lowest Fare' },
              ]}
            />
          )}
        </div>
      }
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="stack gap-3" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="analysing">
              <div className="progress progress--indeterminate">
                <div className="progress__bar" />
              </div>
              <span className="t-sm t-muted">Comparing routes, timing and pickup distance…</span>
            </div>
            <RideCardSkeleton />
            <RideCardSkeleton />
            <RideCardSkeleton />
          </motion.div>
        ) : search.status === 'error' ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {search.error?.code === 'network' ? (
              <NetworkError onRetry={search.retry} />
            ) : (
              <StateView tone="error" icon={<TriangleAlert />} title="Couldn’t load rides" body={search.error?.message} actions={<Button variant="secondary" block onClick={search.retry}>Try again</Button>} />
            )}
          </motion.div>
        ) : sorted.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {ridesThatWindow === 0 ? (
              <StateView
                icon={<CarFront />}
                title="No rides offered yet"
                body={`No one from the VIT community has offered a ride around ${desiredTime(q).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} ${dayLabel(desiredTime(q)).toLowerCase()}. Rides are usually posted a few hours before departure.`}
                actions={
                  <>
                    <Button block icon={<Bell />} onClick={() => toast({ tone: 'success', message: 'We’ll notify you when a matching ride is posted' })}>
                      Notify me when one is posted
                    </Button>
                    <Button variant="ghost" block onClick={() => nav('/find')}>
                      Change time
                    </Button>
                  </>
                }
              />
            ) : (
              <StateView
                icon={<SearchX />}
                tone="neutral"
                title="No matching rides"
                body={`${plural(ridesThatWindow, 'ride is', 'rides are')} offered around this time, but none pass close enough to your pickup or have ${q.seats > 1 ? `${q.seats} free seats` : 'a free seat'}.`}
                actions={
                  <>
                    <Button block onClick={() => nav('/find')}>
                      Adjust search
                    </Button>
                    <Button variant="ghost" block icon={<Bell />} onClick={() => toast({ tone: 'success', message: 'We’ll notify you when a matching ride is posted' })}>
                      Notify me
                    </Button>
                  </>
                }
              />
            )}
            {u.commute !== 'rider' && (
              <div style={{ padding: '0 0 16px' }}>
                <Notice tone="ai" icon={<CarFront />} title="Driving this way yourself?" action={<Button size="sm" variant="tonal" onClick={() => nav('/offer', { state: { draft: { pickup: q.pickup, drop: q.drop, date: q.date, time: q.time, seats: 3 } } })}>Offer</Button>}>
                  Offer the seats instead and split your fuel cost.
                </Notice>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="list" className="stack gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {weakOnly ? (
              <Notice tone="warning" icon={<TriangleAlert />} title="Only weak matches found">
                These rides leave far from your pickup or at a different time. Check the details before requesting.
              </Notice>
            ) : (
              <p className="t-sm t-muted row gap-2" style={{ padding: '0 2px' }}>
                <Sparkle size={14} className="t-primary" />
                {sort === 'best' ? 'Best matches for your route' : sort === 'earliest' ? 'Earliest departures first' : 'Lowest cost-share first'} · {plural(sorted.length, 'ride')}
              </p>
            )}
            {(weakOnly ? sorted : good).map((m, i) => (
              <motion.div
                key={m.ride.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.25, ease: [0.2, 0, 0, 1] }}
                onMouseEnter={() => setHover(m.ride.id)}
                onMouseLeave={() => setHover(null)}
              >
                <RideCard match={m} active={desktop && focus?.ride.id === m.ride.id} showDay={q.date !== m.ride.departAt.slice(0, 10)} onOpen={() => nav(`/ride/${m.ride.id}`)} />
              </motion.div>
            ))}
            {!weakOnly && sorted.length > good.length && <WeakMatches list={sorted.filter((m) => m.tier === 'poor')} />}
          </motion.div>
        )}
      </AnimatePresence>
    </MapScreen>
  )
}

function WeakMatches({ list }: { list: MatchResult[] }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <div className="stack gap-3" style={{ marginTop: 4 }}>
      <button type="button" className="row row--between t-sm" style={{ padding: '8px 2px', color: 'var(--ink-700)' }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="row gap-2">
          <Ban size={15} />
          {plural(list.length, 'weak match', 'weak matches')} hidden
        </span>
        <span className="t-strong t-primary">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open &&
        list.map((m) => <RideCard key={m.ride.id} match={m} onOpen={() => nav(`/ride/${m.ride.id}`)} />)}
    </div>
  )
}
