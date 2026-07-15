import { t } from '@/i18n/es'
import { Toast } from './Toast'

interface UpdateToastProps {
  onUpdate: () => void
}

/**
 * Shown when the service worker has a new version ready in the background.
 * Unlike UndoToast this never auto-expires or auto-applies — reloading the
 * app out from under someone mid-edit would be worse than a stale version
 * lingering a little longer, so it just waits for an explicit tap.
 */
export function UpdateToast({ onUpdate }: UpdateToastProps) {
  return <Toast message={t.pwa.updateAvailable} actionLabel={t.pwa.updateAction} onAction={onUpdate} />
}
