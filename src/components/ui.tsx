import { motion } from 'framer-motion'
import { BadgeCheck, Check, ChevronRight, CircleAlert, Eye, EyeOff, FlaskConical, Minus, Plus, Star } from 'lucide-react'
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { initials } from '@/lib/format'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---- Button -------------------------------------------------------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger' | 'danger-ghost' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  loading?: boolean
  icon?: ReactNode
  trailing?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, trailing, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx('btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className="btn__label">
        {icon}
        {children}
        {trailing}
      </span>
      {loading && <span className="btn__spinner" aria-hidden />}
    </button>
  )
})

export function IconButton({
  label,
  surface,
  size,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; surface?: boolean; size?: 'sm' | 'lg' }) {
  return (
    <button aria-label={label} title={label} className={cx('icon-btn', surface && 'icon-btn--surface', size && `icon-btn--${size}`, className)} {...rest}>
      {children}
    </button>
  )
}

/* ---- Field / inputs ------------------------------------------------------ */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: ReactNode
  error?: string | null
  leading?: ReactNode
  trailing?: ReactNode
  valid?: boolean
  quiet?: boolean
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, leading, trailing, valid, quiet, className, id, disabled, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined
  return (
    <div className={cx('field', className)}>
      {label && (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={cx('input-wrap', quiet && 'input-wrap--quiet', error && 'is-invalid', valid && !error && 'is-valid', disabled && 'is-disabled')}>
        {leading && <span className="input-wrap__leading">{leading}</span>}
        <input ref={ref} id={inputId} className="input" aria-invalid={!!error || undefined} aria-describedby={describedBy} disabled={disabled} {...rest} />
        {(trailing || (valid && !error)) && (
          <span className="input-wrap__trailing">{trailing ?? <Check style={{ marginRight: 8 }} />}</span>
        )}
      </div>
      {error ? (
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          id={`${inputId}-err`}
          className="field__error"
          role="alert"
        >
          <CircleAlert />
          {error}
        </motion.span>
      ) : (
        hint && (
          <span id={`${inputId}-hint`} className="field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
})

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(props, ref) {
  const [show, setShow] = useState(false)
  return (
    <Field
      ref={ref}
      type={show ? 'text' : 'password'}
      trailing={
        <IconButton type="button" label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff /> : <Eye />}
        </IconButton>
      }
      {...props}
    />
  )
})

/* ---- Chip ---------------------------------------------------------------- */
export function Chip({
  selected,
  icon,
  size,
  soft,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode; size?: 'sm'; soft?: boolean }) {
  return (
    <button type="button" aria-pressed={selected} className={cx('chip', size && 'chip--sm', soft && 'chip--soft', className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/* ---- Segmented control --------------------------------------------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className="segmented__item" onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="segmented__thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---- Tabs ---------------------------------------------------------------- */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  label,
}: {
  value: T
  tabs: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} className="tabs__item" onClick={() => onChange(t.value)}>
          {t.label}
          {!!t.count && <span className="tabs__count">{t.count}</span>}
          {t.value === value && <motion.span layoutId={`tab-${id}`} className="tabs__indicator" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </button>
      ))}
    </div>
  )
}

/* ---- Switch -------------------------------------------------------------- */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
}

/* ---- Stepper ------------------------------------------------------------- */
export function Stepper({ value, min = 1, max = 4, onChange, label }: { value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper__btn" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus />
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="stepper__btn" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus />
      </button>
    </div>
  )
}

/* ---- Avatar -------------------------------------------------------------- */
const TINTS = ['#e9e5ff', '#e2ebff', '#e6f4ec', '#fdf0e1', '#fbe7ee', '#e5f3f6', '#efe9e1']
const tintFor = (name: string) => TINTS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length]

export function Avatar({ name, src, size, verified }: { name: string; src?: string; size?: 'xs' | 'sm' | 'lg' | 'xl'; verified?: boolean }) {
  const el = (
    <span className={cx('avatar', size && `avatar--${size}`)} style={{ background: src ? undefined : tintFor(name) }} aria-hidden={!src}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </span>
  )
  if (!verified) return el
  return (
    <span className="avatar-wrap">
      {el}
      <span className="avatar-wrap__badge" title="Verified VIT student">
        <Check />
      </span>
    </span>
  )
}

/* ---- Badges -------------------------------------------------------------- */
export function Badge({ tone, icon, children }: { tone?: 'verified' | 'success' | 'warning' | 'error' | 'info' | 'dark' | 'outline'; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx('badge', tone && `badge--${tone}`)}>
      {icon}
      {children}
    </span>
  )
}

export function VerifiedBadge({ short }: { short?: boolean }) {
  return (
    <Badge tone="verified" icon={<BadgeCheck />}>
      {short ? 'Verified' : 'Verified VIT Student'}
    </Badge>
  )
}

export function Rating({ value, count, countLabel = 'rides' }: { value: number; count?: number; countLabel?: string }) {
  if (!value)
    return (
      <span className="row gap-1">
        <span className="rating" style={{ fontWeight: 500, color: 'var(--ink-500)' }}>
          <Star style={{ fill: 'var(--ink-300)' }} />
          New
        </span>
        {!!count && <span className="t-muted dot-sep">{`${count} ${countLabel}`}</span>}
      </span>
    )
  return (
    <span className="row gap-1">
      <span className="rating" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
        <Star />
        {value.toFixed(1)}
      </span>
      {count !== undefined && <span className="t-muted dot-sep">{`${count} ${countLabel}`}</span>}
    </span>
  )
}

export function TestModeBadge({ children = 'Test mode' }: { children?: ReactNode }) {
  return (
    <span className="test-mode">
      <FlaskConical />
      {children}
    </span>
  )
}

export function Plate({ children }: { children: ReactNode }) {
  return <span className="plate">{children}</span>
}

export function Seats({ total, taken }: { total: number; taken: number }) {
  return (
    <span className="seats" aria-label={`${total - taken} of ${total} seats available`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('seats__seat', i < taken && 'is-taken')} />
      ))}
    </span>
  )
}

/* ---- Notice -------------------------------------------------------------- */
export function Notice({ tone, icon, title, children, action }: { tone?: 'info' | 'warning' | 'error' | 'success' | 'ai'; icon?: ReactNode; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('notice', tone && `notice--${tone}`)} role={tone === 'error' ? 'alert' : undefined}>
      {icon}
      <div className="grow">
        {title && <span className="notice__title">{title}</span>}
        {children}
      </div>
      {action}
    </div>
  )
}

/* ---- Skeleton ------------------------------------------------------------ */
export function Skeleton({ w = '100%', h = 14, circle, style }: { w?: number | string; h?: number | string; circle?: boolean; style?: React.CSSProperties }) {
  return <span className={cx('skel', circle && 'skel--circle')} style={{ display: 'block', width: w, height: h, ...style }} aria-hidden />
}

export function RideCardSkeleton() {
  return (
    <div className="ride-card" aria-hidden>
      <div className="ride-card__head">
        <Skeleton w={40} h={40} circle />
        <div className="grow stack gap-2">
          <Skeleton w="45%" h={14} />
          <Skeleton w="65%" h={12} />
        </div>
        <Skeleton w={72} h={28} style={{ borderRadius: 999 }} />
      </div>
      <div className="row gap-3">
        <Skeleton w={64} h={22} />
        <Skeleton w="50%" h={12} />
      </div>
      <Skeleton w="100%" h={1} />
      <Skeleton w="70%" h={12} />
    </div>
  )
}

/* ---- List row ------------------------------------------------------------ */
export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  chevron = !!onClick,
  danger,
  plainIcon,
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  chevron?: boolean
  danger?: boolean
  plainIcon?: boolean
}) {
  const content = (
    <>
      {icon && <span className={cx('list-row__icon', plainIcon && 'list-row__icon--plain')}>{icon}</span>}
      <span className="list-row__body">
        <span className="list-row__title">{title}</span>
        {subtitle && <span className="list-row__sub">{subtitle}</span>}
      </span>
      {(trailing || chevron) && (
        <span className="list-row__trail">
          {trailing}
          {chevron && <ChevronRight />}
        </span>
      )}
    </>
  )
  const cls = cx('list-row', danger && 'list-row--danger')
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  )
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('section', className)}>
      {(title || action) && (
        <div className="section__header">
          {title && <h2 className="section__title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Divider({ inset }: { inset?: boolean }) {
  return <hr className={cx('divider', inset && 'divider--inset')} />
}
