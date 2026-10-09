import type { ReactNode } from 'react'
import { BottomSheet } from '@/components/Sheet'
import { useIsDesktop } from '@/hooks'
import type { MapPadding } from '@/components/MapView'

/**
 * Map-first screen. Mobile: full-bleed map + draggable bottom sheet.
 * Desktop: information panel on the left, map on the right — the panel is
 * not a stretched sheet, it has its own header/body/footer rhythm.
 */
export function MapScreen({
  map,
  top,
  header,
  footer,
  children,
  snaps = [0.42, 0.9],
  initialSnap = 0,
  snapTo,
}: {
  map: ReactNode
  top?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  snaps?: number[]
  initialSnap?: number
  snapTo?: number
}) {
  const desktop = useIsDesktop()
  return (
    <div className="map-screen">
      <div className="map-screen__map">
        {map}
        {top && <div className="map-screen__top">{top}</div>}
      </div>
      {desktop ? (
        <aside className="map-screen__panel">
          {header && <div className="map-screen__panel-head">{header}</div>}
          <div className="map-screen__panel-body">{children}</div>
          {footer && <div className="map-screen__panel-footer">{footer}</div>}
        </aside>
      ) : (
        <BottomSheet snaps={snaps} initial={initialSnap} header={header ? <div style={{ padding: '0 16px' }}>{header}</div> : undefined} footer={footer} snapTo={snapTo}>
          {children}
        </BottomSheet>
      )}
    </div>
  )
}

/** Map padding so routes are never hidden under the sheet / panel. */
export function useMapPadding(snap = 0.42): MapPadding {
  const desktop = useIsDesktop()
  if (desktop) return { top: 88, bottom: 64, left: 64, right: 64 }
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return { top: 96, bottom: Math.round(h * snap) + 8, left: 40, right: 40 }
}
