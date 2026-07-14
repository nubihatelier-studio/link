import { useEffect } from 'react'
import { t } from '@/i18n/es'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onExpire: () => void
  durationMs?: number
}

/**
 * "Action happened, here's ~6s to undo it" pattern for destructive actions
 * (delete a pattern, reset weave progress) — replaces a blocking native
 * confirm() with something that doesn't interrupt the flow but still gives
 * a real way back before the action becomes permanent.
 */
export function UndoToast({ message, onUndo, onExpire, durationMs = 6000 }: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onExpire, durationMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto flex items-center gap-4 rounded-full bg-surface-3 px-4 py-2.5 shadow-lg">
        <span className="text-sm">{message}</span>
        <button onClick={onUndo} className="shrink-0 text-sm font-semibold text-accent-500 hover:text-accent-600">
          {t.common.undo}
        </button>
      </div>
    </div>
  )
}
