import { t } from '@/i18n/es'
import { InfoScreen } from './InfoScreen'

/**
 * Shown instead of an indefinite loading spinner when opening IndexedDB
 * itself fails (no IndexedDB support, quota/permissions denied by the
 * browser, a locked-down private-browsing mode, etc.) — see
 * `patternsStore.hydrate`'s catch block. Without this, a storage failure
 * left the app stuck on the boot spinner forever with no explanation.
 */
export function StorageErrorScreen() {
  return (
    <InfoScreen
      title={t.storage.errorTitle}
      message={t.storage.errorMessage}
      action={{ label: t.storage.retry, onClick: () => window.location.reload() }}
    />
  )
}
