import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import type { ColorKey } from '@/types'

export function ProgressBar({
  value,
  color = 'indigo',
  height = 8,
  className,
  label,
}: {
  /** 0 to 1. */
  value: number
  color?: ColorKey | 'brand'
  height?: number
  className?: string
  label?: string
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const fill = color === 'brand' ? 'var(--brand)' : colorVar(color)
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 120,
  thickness = 10,
  color = 'brand',
  children,
  trackClassName,
}: {
  value: number
  size?: number
  thickness?: number
  color?: ColorKey | 'brand'
  children?: React.ReactNode
  trackClassName?: string
}) {
  const clamped = Math.max(0, Math.min(1, value))
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const stroke = color === 'brand' ? 'var(--brand)' : colorVar(color)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className={cn('stroke-surface-3', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
