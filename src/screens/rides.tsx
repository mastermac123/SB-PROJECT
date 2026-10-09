import { CarFront, Route as RouteIcon, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StateView } from '@/components/States'
import { Badge, Button, Tabs } from '@/components/ui'
import { money, time } from '@/lib/format'
import type { Booking, Ride } from '@/lib/types'
import { Page } from '@/layouts/Page'
import { me, myBookings, myOfferedRides, rideById, userById } from '@/services/api'
import { useDB, type DB } from '@/services/db'
import { StatusBadge } from './trip'

type Tab = 'upcoming' | 'active' | 'completed' | 'cancelled'

type Item =
  | { kind: 'booking'; booking: Booking; ride: Ride; at: Date }
  | { kind: 'offer'; ride: Ride; at: Date }

const BOOKING_TAB: Record<Booking['status'], Tab> = {
  pending: 'upcoming',
  accepted: 'upcoming',
  confirmed: 'upcoming',
  driver_arriving: 'active',
  driver_arrived: 'active',
  in_progress: 'active',
  completed: 'completed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
}

const RIDE_TAB: Record<Ride['status'], Tab> = { scheduled: 'upcoming', in_progress: 'active', completed: 'completed', cancelled: 'cancelled' }

function collect(db: DB, userId: string): Item[] {
  const items: Item[] = []
  for (const b of myBookings(userId, db)) {
    const ride = rideById(b.rideId, db)
    if (ride) items.push({ kind: 'booking', booking: b, ride, at: new Date(ride.departAt) })
  }
  for (const r of myOfferedRides(userId, db)) items.push({ kind: 'offer', ride: r, at: new Date(r.departAt) })
  return items
}

const tabOf = (i: Item): Tab => (i.kind === 'booking' ? BOOKING_TAB[i.booking.status] : RIDE_TAB[i.ride.status])

export function MyRides() {
  const db = useDB()
  const u = me(db)!
  const nav = useNavigate()
  const all = collect(db, u.id)
  const counts = { upcoming: 0, active: 0, completed: 0, cancelled: 0 }
  all.forEach((i) => counts[tabOf(i)]++)
  const [tab, setTab] = useState<Tab>(counts.active ? 'active' : 'upcoming')
  const list = all
    .filter((i) => tabOf(i) === tab)
    .sort((a, b) => (tab === 'upcoming' || tab === 'active' ? +a.at - +b.at : +b.at - +a.at))

  // Group by month for history tabs, by day otherwise.
  const groups: { label: string; items: Item[] }[] = []
  for (const i of list) {
    const label =
      tab === 'completed' || tab === 'cancelled'
        ? i.at.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : sameDay(i.at, new Date())
          ? 'Today'
          : sameDay(i.at, new Date(Date.now() + 86_400_000))
            ? 'Tomorrow'
            : 'Later'
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(i)
    else groups.push({ label, items: [i] })
  }

  return (
    <Page title="My Rides" back={false} actions={u.commute !== 'rider' ? <Button size="sm" variant="tonal" icon={<CarFront />} onClick={() => nav('/offer')} style={{ marginRight: 8 }}>Offer a Ride</Button> : undefined}>
      <div style={{ position: 'sticky', top: 'calc(var(--topbar-height) + var(--safe-top))', background: 'inherit', zIndex: 5, margin: '0 -16px', padding: '0 16px' }}>
        <Tabs
          label="Ride status"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyTab tab={tab} canDrive={u.commute !== 'rider'} />
      ) : (
        <div className="timeline">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="timeline__group">{g.label}</div>
              {g.items.map((i) => (
                <TimelineItem key={i.kind === 'booking' ? i.booking.id : i.ride.id} item={i} db={db} />
              ))}
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

function TimelineItem({ item, db }: { item: Item; db: DB }) {
  const nav = useNavigate()
  const { ride, at } = item
  if (item.kind === 'booking') {
    const b = item.booking
    const driver = userById(ride.driverId, db)!
    const live = ['driver_arriving', 'driver_arrived', 'in_progress'].includes(b.status)
    return (
      <button type="button" className="timeline__item" onClick={() => nav(live ? `/live/${b.id}` : `/trip/${b.id}`)}>
        <DateCol at={at} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="timeline__title truncate">
            {b.pickup.name} → {b.drop.name}
          </span>
          <span className="timeline__sub truncate">
            {time(ride.departAt)} · with {driver.name}
          </span>
          {b.status === 'cancelled' && b.cancelReason && <span className="timeline__sub truncate">{b.cancelledBy === 'driver' ? 'Driver cancelled' : 'You cancelled'} · {b.cancelReason}</span>}
        </span>
        <span className="timeline__end">
          <span className="timeline__amount">{money(b.fare)}</span>
          <StatusBadge status={b.status} />
        </span>
      </button>
    )
  }
  const reqs = db.bookings.filter((b) => b.rideId === ride.id)
  const pending = reqs.filter((b) => b.status === 'pending').length
  const earned = reqs.filter((b) => b.status === 'completed').reduce((s, b) => s + b.fare, 0)
  return (
    <button type="button" className="timeline__item" onClick={() => nav(`/drive/${ride.id}`)}>
      <DateCol at={at} />
      <span className="stack" style={{ minWidth: 0 }}>
        <span className="timeline__title truncate">
          {ride.origin.name} → {ride.destination.name}
        </span>
        <span className="timeline__sub truncate">
          {time(ride.departAt)} · You drove · {ride.seatsBooked}/{ride.seatsTotal} seats
        </span>
      </span>
      <span className="timeline__end">
        {ride.status === 'completed' ? <span className="timeline__amount t-success">+{money(earned)}</span> : <span className="timeline__amount">{money(ride.farePerSeat)}<span className="t-caption t-muted">/seat</span></span>}
        {pending > 0 && ride.status === 'scheduled' ? (
          <Badge tone="error">{pending} new</Badge>
        ) : (
          <Badge tone={ride.status === 'cancelled' ? 'error' : ride.status === 'in_progress' ? 'success' : 'dark'}>{ride.status === 'scheduled' ? 'Driving' : ride.status === 'in_progress' ? 'Live' : ride.status === 'completed' ? 'Driven' : 'Cancelled'}</Badge>
        )}
      </span>
    </button>
  )
}

function DateCol({ at }: { at: Date }) {
  return (
    <span className="timeline__date" aria-hidden>
      <span className="timeline__day">{at.getDate()}</span>
      <span className="timeline__mon">{at.toLocaleDateString('en-IN', { month: 'short' })}</span>
    </span>
  )
}

function EmptyTab({ tab, canDrive }: { tab: Tab; canDrive: boolean }) {
  const nav = useNavigate()
  const copy = {
    upcoming: { title: 'No upcoming rides', body: 'Rides you book or offer will show up here.' },
    active: { title: 'Nothing in progress', body: 'When a ride starts, you can track it from here.' },
    completed: { title: 'No completed rides yet', body: 'Your ride history and receipts will appear here.' },
    cancelled: { title: 'No cancelled rides', body: 'Good news — nothing has been cancelled.' },
  }[tab]
  return (
    <StateView
      icon={<RouteIcon />}
      tone={tab === 'cancelled' ? 'neutral' : 'brand'}
      title={copy.title}
      body={copy.body}
      actions={
        tab === 'upcoming' || tab === 'active' ? (
          <>
            <Button block icon={<Search />} onClick={() => nav('/find')}>
              Find a Ride
            </Button>
            {canDrive && (
              <Button block variant="ghost" icon={<CarFront />} onClick={() => nav('/offer')}>
                Offer a Ride
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  )
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
