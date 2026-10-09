import type { ReactNode } from 'react'
import { TopBar } from '@/components/TopBar'
import { cx } from '@/components/ui'

export function Page({
  title,
  back = true,
  backTo,
  actions,
  footer,
  narrow,
  canvas,
  sheet,
  children,
  header,
}: {
  title?: ReactNode
  back?: boolean
  backTo?: string
  actions?: ReactNode
  footer?: ReactNode
  narrow?: boolean
  canvas?: boolean
  /** Wrap content in a surface card on desktop. */
  sheet?: boolean
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cx('page', canvas && 'page--canvas')}>
      {(title !== undefined || back) && <TopBar title={title} back={back} backTo={backTo} actions={actions} left={!back} />}
      <div className={cx('page__content', narrow && 'page__content--narrow')}>
        {header && <div className="page__header">{header}</div>}
        {sheet ? <div className="page__sheet">{children}</div> : children}
      </div>
      {footer && <div className={cx('page__footer', narrow && 'page__footer--narrow')}>{footer}</div>}
    </div>
  )
}
