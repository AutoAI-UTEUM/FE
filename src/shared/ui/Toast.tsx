import { X } from 'lucide-react'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import { cx } from '../lib/cx'
import { ToastContext, type ToastTone } from './toastContext'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const AUTO_DISMISS_MS = 5000

const toneClasses: Record<ToastTone, string> = {
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-stone-200 bg-white text-stone-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextIdRef.current++
      setToasts((current) => [...current, { id, message, tone }])
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            className={cx(
              'pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 type-body font-medium shadow-sm',
              toneClasses[toast.tone],
            )}
            key={toast.id}
          >
            <span className="break-words">{toast.message}</span>
            <button
              aria-label="알림 닫기"
              className="mt-0.5 shrink-0 rounded text-current opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

