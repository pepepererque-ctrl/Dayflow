import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { subjectShort } from '@/lib/subjects'
import type { Subject } from '@/types'

/**
 * Etiqueta de asignatura: un punto con su color y las siglas. El texto usa
 * el color de la asignatura sobre una mezcla suave del mismo, igual que Badge.
 */
export function SubjectChip({
  subject,
  className,
  full,
}: {
  subject: Subject
  className?: string
  /** Muestra el nombre completo en vez de las siglas. */
  full?: boolean
}) {
  const label = full ? subject.name : subjectShort(subject)
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
      style={{
        color: colorVar(subject.color),
        background: `color-mix(in srgb, ${colorVar(subject.color)} 12%, transparent)`,
      }}
      title={subject.name}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: colorVar(subject.color) }}
      />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** Cuadrado con las siglas: hace de icono de la asignatura en todas las listas. */
export function SubjectMark({ subject, size = 44 }: { subject: Subject; size?: number }) {
  const tint = colorVar(subject.color)
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        color: tint,
        background: `color-mix(in srgb, ${tint} 14%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 28%, transparent)`,
      }}
    >
      <span className="max-w-full truncate px-1">{subjectShort(subject).slice(0, 4)}</span>
    </span>
  )
}
