import type { ReactNode } from 'react'

export type Stop = { title: ReactNode; subtitle?: ReactNode; time?: ReactNode }

/** Pickup → destination rail used on cards, sheets and receipts. */
export function Stops({ from, to }: { from: Stop; to: Stop }) {
  return (
    <div className="stops">
      <div className="stops__rail" aria-hidden>
        <span className="stops__dot" />
        <span className="stops__line" />
        <span className="stops__dot stops__dot--end" />
      </div>
      <div className="stops__body">
        <StopRow {...from} label="Pickup" />
        <StopRow {...to} label="Destination" />
      </div>
    </div>
  )
}

function StopRow({ title, subtitle, time, label }: Stop & { label: string }) {
  return (
    <div className="stop">
      <span className="sr-only">{label}: </span>
      <div className="row row--between gap-3">
        <span className="stop__title truncate">{title}</span>
        {time && <span className="stop__time t-sm t-secondary">{time}</span>}
      </div>
      {subtitle && <span className="stop__sub">{subtitle}</span>}
    </div>
  )
}
