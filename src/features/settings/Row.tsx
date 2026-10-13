import type { ReactNode } from 'react'

/** Fila de ajuste: título y explicación a un lado, el control al otro. */
export function Row({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {children ? <div className="shrink-0 sm:max-w-[300px]">{children}</div> : null}
    </div>
  )
}
