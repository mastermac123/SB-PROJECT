import { CarFront, Clock, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { MapView, type MapMarker } from '@/components/MapView'
import { Stops } from '@/components/Stops'
import { Avatar, Badge, Plate, Rating } from '@/components/ui'
import { dayTime, relative, time } from '@/lib/format'
import type { SharedTrip } from '@/lib/types'

/**
 * Public page family and friends open from a shared link: where the car is right now,
 * who's driving and which car to look for. No sign-in; refreshes every 5 seconds.
 */
export function SharedTripPage() {
  const { token = '' } = useParams()
  const [trip, setTrip] = useState<SharedTrip | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (stop) return
        if (!res.ok) setError(body.error ?? 'This trip link isn’t available.')
        else {
          setTrip(body as SharedTrip)
          setError(null)
        }
      } catch {
        /* offline — keep the last view */
      }
    }
    void load()
    const t = window.setInterval(load, 5000)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [token])

  if (error && !trip)
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 16 }}>
        <div className="stack gap-3" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 360 }}>
          <Logo />
          <h1 className="t-h2">{error}</h1>
          <p className="t-body t-muted">Shared RideSync trips can be viewed while the ride is on and for 2 hours after.</p>
        </div>
      </div>
    )
  if (!trip) return <div className="page" style={{ minHeight: '100dvh' }} />

  const loc = trip.driverLocation
  const done = trip.status === 'completed'
  const stopped = ['cancelled', 'rejected', 'expired'].includes(trip.status)
  const headline = done
    ? `${trip.rider} has arrived`
    : stopped
      ? 'This trip was cancelled'
      : trip.status === 'in_progress'
        ? `${trip.rider} is on the way`
        : trip.status === 'driver_arrived'
          ? `Driver is at the pickup`
          : trip.status === 'driver_arriving'
            ? `Driver is heading to ${trip.rider}`
            : `Trip at ${time(trip.departAt)}`
  const sub = done
    ? `Dropped at ${trip.drop.name}${trip.droppedAt ? ` · ${time(trip.droppedAt)}` : ''}`
    : trip.status === 'in_progress'
      ? `Picked up${trip.pickedUpAt ? ` at ${time(trip.pickedUpAt)}` : ''} · heading to ${trip.drop.name}`
      : stopped
        ? 'No one is travelling on this ride.'
        : `Leaves ${dayTime(trip.departAt).toLowerCase()} from ${trip.pickup.name}`

  const markers: MapMarker[] = [
    { id: 'pick', at: trip.pickup, kind: 'pickup', label: trip.pickup.name, darkLabel: true },
    { id: 'drop', at: trip.drop, kind: 'drop', label: trip.drop.name },
    ...(loc ? [{ id: 'car', at: loc, kind: 'car' as const, heading: loc.heading }] : []),
  ]

  return (
    <div className="shared-trip">
      <div className="shared-trip__map">
        <MapView markers={markers} routes={[{ id: 'r', coords: trip.route }]} fit={loc ? [loc, trip.status === 'in_progress' ? trip.drop : trip.pickup] : [trip.pickup, trip.drop]} follow={loc ? 'car' : undefined} />
      </div>
      <div className="shared-trip__panel">
        <div className="row row--between">
          <Logo />
          <Badge tone={done ? 'success' : stopped ? 'error' : trip.rideStatus === 'in_progress' ? 'success' : 'info'}>{done ? 'Arrived' : stopped ? 'Cancelled' : trip.rideStatus === 'in_progress' ? '● Live' : 'Scheduled'}</Badge>
        </div>
        <div className="stack gap-1">
          <h1 className="t-h2" aria-live="polite">
            {headline}
          </h1>
          <p className="t-body t-muted">{sub}</p>
          {loc && !done && (
            <p className="t-sm t-muted">
              <Clock style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
              Location updated {relative(loc.at).toLowerCase()}
            </p>
          )}
        </div>
        <div className="row gap-3">
          <Avatar name={trip.driver.name} src={trip.driver.photo} size="lg" verified={trip.driver.verified} />
          <div className="stack grow gap-1" style={{ minWidth: 0 }}>
            <span className="t-h3 truncate">{trip.driver.name}</span>
            <Rating value={trip.driver.rating} />
            <span className="t-sm t-muted">
              <CarFront style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
              {trip.vehicle.color} {trip.vehicle.make} {trip.vehicle.model}
            </span>
          </div>
          <Plate>{trip.vehicle.plate}</Plate>
        </div>
        <Stops from={{ title: trip.pickup.name, subtitle: trip.pickup.area }} to={{ title: trip.drop.name, subtitle: trip.drop.area }} />
        <p className="t-caption t-muted" style={{ fontWeight: 400 }}>
          <ShieldCheck style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
          {trip.rider} shared this RideSync trip with you. Everyone on RideSync signs in with a Vidyalankar (@vit.edu.in) email. In an emergency call 112.
        </p>
        <p className="t-caption t-muted" style={{ fontWeight: 400 }}>
          <MapPin style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
          This page updates by itself.
        </p>
      </div>
    </div>
  )
}
