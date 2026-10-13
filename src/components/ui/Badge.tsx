import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import type { ColorKey } from '@/types'

export function Dot({ color, size = 8 }: { color: ColorKey; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: colorVar(color) }}
    />
  )
}

/**
 * Chip teñido. El color sale de una variable temática y el fondo es una mezcla
 * de baja opacidad de ese mismo color, así que el contraste aguanta en claro y
 * en oscuro.
 */
export function Badge({
  children,
  color,
  className,
  icon,
}: {
  children: ReactNode
  color?: ColorKey
  className?: string
  icon?: ReactNode
}) {
  const base =
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium'

  if (!color) {
    return (
      <span className={cn(base, 'bg-surface-2 text-ink-2', className)}>
        {icon}
        {children}
      </span>
    )
  }
  return (
    <span
      className={cn(base, className)}
      style={{
        color: colorVar(color),
        background: `color-mix(in srgb, ${colorVar(color)} 12%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  )
}

/** Contador pequeño junto a títulos de columna y de sección. */
export function Count({ value }: { value: number }) {
  return (
    <span className="tnum shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-ink-3">
      {value}
    </span>
  )
}
