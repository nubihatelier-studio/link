import { useEffect } from 'react'
import { t } from '@/i18n/es'
import { Toast } from './Toast'

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

  return <Toast message={message} actionLabel={t.common.undo} onAction={onUndo} />
}
