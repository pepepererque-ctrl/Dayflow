import { useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { useMeasure } from '@/lib/useMeasure'
import type { ColorKey } from '@/types'

export interface Point {
  label: string
  value: number
  /** Longer label shown in the tooltip. */
  caption?: string
}

const PAD = { top: 12, right: 8, bottom: 24, left: 34 }

function niceMax(raw: number, minimum = 1): number {
  const target = Math.max(raw, minimum)
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)))
  const scaled = target / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

function resolve(color: ColorKey | 'brand'): string {
  return color === 'brand' ? 'var(--brand)' : colorVar(color)
}

/* ------------------------------ line / area ------------------------------- */

export function TrendChart({
  data,
  height = 190,
  color = 'brand',
  formatValue = (v: number) => String(v),
  className,
  ariaLabel,
}: {
  data: Point[]
  height?: number
  color?: ColorKey | 'brand'
  formatValue?: (v: number) => string
  className?: string
  ariaLabel: string
}) {
  const gradientId = useId()
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const stroke = resolve(color)

  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const areaPath = data.length
    ? `${linePath} L${x(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
    : ''

  const ticks = [0, 0.5, 1]
  // Keep the x-axis readable no matter how many days are in range.
  const labelEvery = Math.max(1, Math.ceil(data.length / (innerW > 520 ? 10 : 5)))

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const rel = e.clientX - rect.left - PAD.left
            const idx = Math.round((rel / Math.max(1, innerW)) * (data.length - 1))
            setHover(Math.max(0, Math.min(data.length - 1, idx)))
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {ticks.map((t) => {
            const yy = PAD.top + innerH - t * innerH
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={yy}
                  y2={yy}
                  stroke="var(--line)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text
                  x={PAD.left - 8}
                  y={yy + 3.5}
                  textAnchor="end"
                  className="tnum"
                  fontSize="10.5"
                  fill="var(--ink-3)"
                >
                  {formatValue(Math.round(max * t))}
                </text>
              </g>
            )
          })}

          {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
          <path
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={d.label + i}
                x={x(i)}
                y={height - 7}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--ink-3)"
              >
                {d.label}
              </text>
            ) : null,
          )}

          {hover !== null && data[hover] ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              <circle cx={x(hover)} cy={y(data[hover].value)} r={4.5} fill={stroke} />
              <circle cx={x(hover)} cy={y(data[hover].value)} r={8} fill={stroke} fillOpacity={0.18} />
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center shadow-pop"
          style={{ left: Math.min(Math.max(x(hover), 60), Math.max(60, width - 60)) }}
        >
          <p className="text-2xs font-medium text-ink-3">{data[hover].caption ?? data[hover].label}</p>
          <p className="tnum text-sm font-semibold text-ink">{formatValue(data[hover].value)}</p>
        </div>
      ) : null}
    </div>
  )
}

/* --------------------------------- bars ----------------------------------- */

export function BarChart({
  data,
  height = 190,
  color = 'brand',
  formatValue = (v: number) => String(v),
  className,
  ariaLabel,
  highlightIndex,
}: {
  data: Point[]
  height?: number
  color?: ColorKey | 'brand'
  formatValue?: (v: number) => string
  className?: string
  ariaLabel: string
  highlightIndex?: number
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const fill = resolve(color)

  const slot = data.length ? innerW / data.length : 0
  const barW = Math.max(3, Math.min(28, slot * 0.62))
  const labelEvery = Math.max(1, Math.ceil(data.length / (innerW > 520 ? 10 : 5)))

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((t) => {
            const yy = PAD.top + innerH - t * innerH
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={yy}
                  y2={yy}
                  stroke="var(--line)"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : '3 4'}
                />
                <text x={PAD.left - 8} y={yy + 3.5} textAnchor="end" className="tnum" fontSize="10.5" fill="var(--ink-3)">
                  {formatValue(Math.round(max * t))}
                </text>
              </g>
            )
          })}

          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2
            const h = max === 0 ? 0 : (d.value / max) * innerH
            const active = hover === i || highlightIndex === i
            return (
              <g key={d.label + i} onMouseEnter={() => setHover(i)}>
                <rect
                  x={cx - slot / 2}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                />
                <rect
                  x={cx - barW / 2}
                  y={PAD.top + innerH - h}
                  width={barW}
                  height={Math.max(h, d.value > 0 ? 2 : 0)}
                  rx={Math.min(4, barW / 2)}
                  fill={fill}
                  opacity={active ? 1 : 0.72}
                  style={{ transition: 'opacity 150ms ease' }}
                />
                {i % labelEvery === 0 || i === data.length - 1 ? (
                  <text x={cx} y={height - 7} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
                    {d.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}

      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center shadow-pop"
          style={{
            left: Math.min(Math.max(PAD.left + slot * hover + slot / 2, 60), Math.max(60, width - 60)),
          }}
        >
          <p className="text-2xs font-medium text-ink-3">{data[hover].caption ?? data[hover].label}</p>
          <p className="tnum text-sm font-semibold text-ink">{formatValue(data[hover].value)}</p>
        </div>
      ) : null}
    </div>
  )
}

/* --------------------------------- donut ---------------------------------- */

export interface Slice {
  label: string
  value: number
  color: ColorKey
}

export function DonutChart({
  slices,
  size = 152,
  thickness = 22,
  centerLabel,
  centerValue,
  ariaLabel,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  ariaLabel: string
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={ariaLabel}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-surface-3" />
        {total > 0 &&
          slices.map((s) => {
            const portion = s.value / total
            const dash = portion * circumference
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colorVar(s.color)}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue ? <span className="tnum text-2xl font-semibold tracking-tight text-ink">{centerValue}</span> : null}
        {centerLabel ? <span className="text-2xs text-ink-3">{centerLabel}</span> : null}
      </div>
    </div>
  )
}

/* ------------------------------- sparkline -------------------------------- */

export function Sparkline({
  values,
  width = 88,
  height = 28,
  color = 'brand',
}: {
  values: number[]
  width?: number
  height?: number
  color?: ColorKey | 'brand'
}) {
  if (values.length < 2) return <div style={{ width, height }} />
  const max = Math.max(...values, 1)
  const step = width / (values.length - 1)
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 3) - 1.5).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={resolve(color)} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
