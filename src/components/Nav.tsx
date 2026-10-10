import { Bell, CarFront, House, MessageCircle, Route, Search, UserRound, Wallet } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Q, useMe, useQuery, type Badges } from '@/services/api'
import { Logo } from './Logo'
import { Avatar, Button } from './ui'

const ITEMS = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/find', label: 'Find a ride', icon: Search },
  { to: '/rides', label: 'My rides', icon: Route },
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

/** Desktop navigation: a quiet bar so the map gets the whole width below it. */
export function TopNav() {
  const nav = useNavigate()
  const { user: u } = useMe()
  const badges = useQuery<Badges>(Q.badges).data
  if (!u) return null
  const unread = badges?.unread ?? 0
  const requests = badges?.requests ?? 0
  const canDrive = u.commute !== 'rider'
  return (
    <header className="topnav only-desktop">
      <NavLink to="/home" className="topnav__logo" aria-label="RideSync home">
        <Logo height={28} />
      </NavLink>
      <nav className="topnav__links" aria-label="Primary">
        {ITEMS.slice(0, 4).map(({ to, label }) => (
          <NavLink key={to} to={to} className="topnav__link">
            {label}
            {to === '/rides' && requests > 0 && <span className="topnav__count" aria-label={`${requests} pending requests`}>{requests}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="topnav__right">
        {canDrive && (
          <Button size="sm" variant="tonal" icon={<CarFront />} onClick={() => nav('/offer')}>
            Offer a ride
          </Button>
        )}
        <NavLink to="/chat" className="icon-btn topnav__icon" aria-label="Messages">
          <MessageCircle />
        </NavLink>
        <NavLink to="/notifications" className="icon-btn topnav__icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell />
          {unread > 0 && <span className="dot-badge" />}
        </NavLink>
        <NavLink to="/profile" className="topnav__me" aria-label="Your profile">
          <Avatar name={u.name} src={u.photo} size="sm" verified={u.verified} />
        </NavLink>
      </div>
    </header>
  )
}
