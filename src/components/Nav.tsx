import { Bell, CarFront, House, MessageCircle, Route, Search, UserRound, Wallet } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Q, useMe, useQuery, type Badges } from '@/services/api'
import { Logo } from './Logo'
import { Avatar, Button } from './ui'

const ITEMS = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/find', label: 'Find Ride', icon: Search },
  { to: '/rides', label: 'My Rides', icon: Route },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function BottomNav() {
  const requests = useQuery<Badges>(Q.badges).data?.requests ?? 0
  return (
    <nav className="bottom-nav only-mobile" aria-label="Primary">
      {ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="bottom-nav__item">
          <Icon />
          {label}
          {to === '/rides' && requests > 0 && <span className="bottom-nav__pip" aria-label={`${requests} pending requests`} />}
        </NavLink>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const nav = useNavigate()
  const { user: u } = useMe()
  const badges = useQuery<Badges>(Q.badges).data
  if (!u) return null
  const unread = badges?.unread ?? 0
  const requests = badges?.requests ?? 0
  const canDrive = u.commute !== 'rider'
  return (
    <aside className="sidebar only-desktop" aria-label="Primary">
      <Logo className="sidebar__logo" height={34} />
      {ITEMS.slice(0, 4).map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="sidebar__item">
          <Icon />
          {label}
          {to === '/rides' && requests > 0 && <span className="sidebar__count">{requests}</span>}
        </NavLink>
      ))}
      <NavLink to="/chat" className="sidebar__item">
        <MessageCircle />
        Messages
      </NavLink>
      <NavLink to="/notifications" className="sidebar__item">
        <Bell />
        Notifications
        {unread > 0 && <span className="sidebar__count">{unread}</span>}
      </NavLink>
      {canDrive && (
        <Button className="sidebar__cta" variant="tonal" block icon={<CarFront />} onClick={() => nav('/offer')}>
          Offer a Ride
        </Button>
      )}
      <NavLink to="/profile" className="sidebar__footer">
        <Avatar name={u.name} src={u.photo} size="sm" verified />
        <span className="stack grow" style={{ minWidth: 0 }}>
          <span className="t-sm t-strong truncate">{u.name}</span>
          <span className="t-caption t-muted truncate" style={{ fontWeight: 400 }}>
            {u.studentId} · {u.email.split('@')[1]}
          </span>
        </span>
      </NavLink>
    </aside>
  )
}
