import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Info, TriangleAlert, Undo2 } from 'lucide-react'
import { uid } from '@/lib/id'

type Tone = 'success' | 'info' | 'error'

interface ToastItem {
  id: string
  message: string
  tone: Tone
  actionLabel?: string
  onAction?: () => void
}

interface ToastApi {
  toast: (message: string, opts?: { tone?: Tone; actionLabel?: string; onAction?: () => void }) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS: Record<Tone, ReactNode> = {
  success: <Check size={15} />,
  info: <Info size={15} />,
  error: <TriangleAlert size={15} />,
}

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-good',
  info: 'text-ink-2',
  error: 'text-bad',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle) window.clearTimeout(handle)
    timers.current.delete(id)
  }, [])

  const toast = useCallback<ToastApi['toast']>(
    (message, opts) => {
      const item: ToastItem = {
        id: uid('toast'),
        message,
        tone: opts?.tone ?? 'success',
        actionLabel: opts?.actionLabel,
        onAction: opts?.onAction,
      }
      // Cap the stack so rapid actions never bury the screen.
      setItems((prev) => [...prev.slice(-2), item])
      timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), 4200))
    },
    [dismiss],
  )

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="safe-b pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
          role="status"
          aria-live="polite"
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-pop animate-[sheet_0.28s_cubic-bezier(0.22,1,0.36,1)_both]"
            >
              <span className={TONE_CLASS[item.tone]}>{ICONS[item.tone]}</span>
              <p className="min-w-0 flex-1 text-sm font-medium text-ink">{item.message}</p>
              {item.actionLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.()
                    dismiss(item.id)
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
                >
                  <Undo2 size={13} />
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
