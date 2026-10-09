import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScrolled } from '@/hooks'
import { IconButton, cx } from './ui'

export function BackButton({ to, surface, label = 'Back' }: { to?: string; surface?: boolean; label?: string }) {
  const nav = useNavigate()
  return (
    <IconButton label={label} surface={surface} onClick={() => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav('/home'))}>
      <ArrowLeft />
    </IconButton>
  )
}

export function TopBar({ title, back = true, backTo, actions, left }: { title?: ReactNode; back?: boolean; backTo?: string; actions?: ReactNode; left?: boolean }) {
  const scrolled = useScrolled()
  return (
    <header className={cx('topbar', scrolled && 'is-scrolled')}>
      {back ? <BackButton to={backTo} /> : null}
      <h1 className={cx('topbar__title', (left || !back) && 'topbar__title--left')}>{title}</h1>
      {actions ?? (back ? <span className="topbar__spacer" /> : null)}
    </header>
  )
}
