import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-3',
            compact ? 'h-9 w-9' : 'h-11 w-11',
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className={cn('font-semibold text-ink', compact ? 'text-sm' : 'text-md')}>{title}</p>
        {description ? (
          <p
            className={cn(
              'mx-auto max-w-[42ch] text-balance text-ink-3',
              compact ? 'text-xs' : 'text-sm leading-relaxed',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
