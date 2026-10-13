import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/i18n/I18nProvider'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Open modals, oldest first. A confirmation opened on top of an editor must be
 * the only one that reacts to Escape, otherwise one keypress dismisses both.
 */
const stack: symbol[] = []

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** `md` for forms, `lg` for detail panels, `sm` for confirmations. */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Con `false`, Esc, el aspa y el clic fuera no cierran el diálogo: hay que
   * elegir una de sus opciones. Para decisiones que no deben tomarse sin querer.
   */
  dismissable?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: ModalProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null

    const token = Symbol('modal')
    stack.push(token)
    const isTopmost = () => stack[stack.length - 1] === token

    document.body.style.overflow = 'hidden'

    const focusFirst = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const target = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(target ?? panel).focus()
    }, 10)

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (dismissable) onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
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

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(focusFirst)
      document.removeEventListener('keydown', onKeyDown, true)
      const at = stack.indexOf(token)
      if (at !== -1) stack.splice(at, 1)
      // Release the scroll lock only once every modal is gone.
      if (stack.length === 0) document.body.style.overflow = ''
      restoreTo.current?.focus?.()
    }
  }, [open, onClose, dismissable])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-[fade_0.2s_ease-out_both] bg-[rgb(20_16_14/0.45)] backdrop-blur-[2px]"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-modal outline-none',
          'animate-[sheet_0.28s_cubic-bezier(0.22,1,0.36,1)_both]',
          'rounded-t-3xl sm:rounded-2xl',
          'border-t border-line sm:border',
          widths[size],
          'sm:mx-4',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
          </div>
          {dismissable ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <div className="safe-b flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
