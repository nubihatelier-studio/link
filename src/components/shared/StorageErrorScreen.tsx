import { t } from '@/i18n/es'
import { Button } from './Button'

/**
 * Shown instead of an indefinite loading spinner when opening IndexedDB
 * itself fails (no IndexedDB support, quota/permissions denied by the
 * browser, a locked-down private-browsing mode, etc.) — see
 * `patternsStore.hydrate`'s catch block. Without this, a storage failure
 * left the app stuck on the boot spinner forever with no explanation.
 */
export function StorageErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <img src="/logo.png" alt="" className="h-12 w-12 rounded-full opacity-60" />
      <h1 className="text-lg font-bold text-text">{t.storage.errorTitle}</h1>
      <p className="max-w-sm text-sm text-text-muted">{t.storage.errorMessage}</p>
      <Button onClick={() => window.location.reload()}>{t.storage.retry}</Button>
    </div>
  )
}
