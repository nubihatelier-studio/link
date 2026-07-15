import { useRegisterSW } from 'virtual:pwa-register/react'

export interface AppUpdateState {
  /** A new service worker has installed and is waiting to take over. */
  needRefresh: boolean
  /** Activates the waiting service worker and reloads once. */
  update: () => void
  /** Hides the toast without updating — the new version stays queued for next launch. */
  dismiss: () => void
}

/**
 * Surfaces "a new build is ready" without ever swapping the app out from
 * under someone mid-edit. registerType is 'prompt' (see vite.config.ts), so
 * the new service worker installs and waits in the background; this hook
 * only exposes a `needRefresh` flag for the UI (see UpdateToast) to show a
 * dismissible toast, and `update()` is the one and only path that actually
 * activates it and reloads — always an explicit tap, never automatic.
 */
export function useAppUpdate(): AppUpdateState {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return {
    needRefresh,
    update: () => updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  }
}
