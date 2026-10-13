import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * El borde hace la separación y la sombra solo insinúa altura. `raised` se
 * reserva para lo que de verdad flota por encima del resto de la página.
 */
export function Card({
  children,
  className,
  as: Tag = 'section',
  raised,
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
  raised?: boolean
}) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-line bg-surface',
        raised ? 'shadow-raised' : 'shadow-card',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4.5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-md font-semibold tracking-[-0.011em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="-mt-1 shrink-0">{action}</div> : null}
    </div>
  )
}
