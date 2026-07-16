import { useEffect, useState } from 'react'

export interface StorageStatus {
  /** Whether `navigator.storage.persisted()` exists at all in this browser. */
  supported: boolean
  /** null while unknown/unsupported, otherwise the browser's actual persisted-storage answer. */
  persisted: boolean | null
  usageBytes: number | null
  quotaBytes: number | null
}

const INITIAL: StorageStatus = { supported: false, persisted: null, usageBytes: null, quotaBytes: null }

/** Read-only view of the current storage-persistence state, for the home screen's indicator. */
export function useStorageStatus(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>(INITIAL)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const supported = typeof navigator !== 'undefined' && typeof navigator.storage?.persisted === 'function'
      const persisted = supported ? await navigator.storage.persisted() : null
      let usageBytes: number | null = null
      let quotaBytes: number | null = null
      if (typeof navigator !== 'undefined' && typeof navigator.storage?.estimate === 'function') {
        const estimate = await navigator.storage.estimate()
        usageBytes = estimate.usage ?? null
        quotaBytes = estimate.quota ?? null
      }
      if (!cancelled) setStatus({ supported, persisted, usageBytes, quotaBytes })
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
