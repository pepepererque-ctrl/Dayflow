import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Hoja que sube desde abajo, con las esquinas muy redondeadas. Para elecciones
 * rápidas (un mes, una vista) donde un diálogo centrado con cabecera sobra.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  /** Nombre accesible del diálogo. */
  label: string
  children: ReactNode
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusFirst = window.setTimeout(() => {
      const panel = panelRef.current
      ;(panel?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="true"]') ??
        panel?.querySelector<HTMLElement>(FOCUSABLE) ??
        panel)?.focus()
    }, 10)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(focusFirst)
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 animate-[fade_0.2s_ease-out_both] bg-[rgb(20_16_14/0.5)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'safe-b relative w-full max-w-md animate-[sheet_0.28s_cubic-bezier(0.22,1,0.36,1)_both] outline-none',
          'rounded-t-[28px] border border-b-0 border-line bg-surface p-5 shadow-modal',
          'sm:mb-8 sm:rounded-[28px] sm:border-b',
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  )
}
