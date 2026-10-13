import { cn } from '@/lib/cn'

/**
 * The DayFlow mark: a single stroke that curves and releases — the "flow" of a
 * day resolving. Kept as one path so it stays legible at 20px.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[10px] bg-brand', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size * 0.72} height={size * 0.72} fill="none">
        <path
          d="M8 21c2.4-7 5-10.5 7.4-10.5 2.6 0 2.9 3.4.9 5.8-1.9 2.4-5.1 2.6-5.1 2.6M16.4 21c2.8 0 5.1-1.8 7.2-5.3"
          stroke="var(--on-brand)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={30} />
      <span className="text-lg font-semibold tracking-[-0.02em] text-ink">
        Day<span className="text-brand-ink">Flow</span>
      </span>
    </span>
  )
}
