import { cx } from './ui'

/**
 * The RideSync AI logo, used exactly as supplied. Variants are crops of the
 * original artwork (public/brand/ridesync-logo-original.webp) — never redrawn.
 *   full     mark + wordmark + "Smart rides • Brighter tomorrows"
 *   compact  mark + wordmark (tagline cropped for small sizes)
 *   mark     the R mark alone (app icon, avatars, loaders)
 */
export function Logo({ variant = 'compact', height = 32, className }: { variant?: 'full' | 'compact' | 'mark'; height?: number; className?: string }) {
  const src = variant === 'mark' ? '/brand/ridesync-mark.png' : variant === 'full' ? '/brand/ridesync-logo.png' : '/brand/ridesync-logo-compact.png'
  return <img src={src} alt="RideSync AI" height={height} style={{ height, width: 'auto' }} className={cx('logo', className)} draggable={false} />
}
