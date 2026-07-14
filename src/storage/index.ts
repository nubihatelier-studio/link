import { Capacitor } from '@capacitor/core'
import type { StorageAdapter } from './types'

export type { StorageAdapter, WeaveProgressRecord, PatternBackupFile, FullBackupFile } from './types'
export { SCHEMA_VERSION } from './types'

let adapterPromise: Promise<StorageAdapter> | null = null

/**
 * Lazily creates and initializes the right backend for this platform —
 * IndexedDB on web, SQLite on a native Capacitor build — and memoizes it so
 * every caller shares the same open connection.
 */
export function getStorageAdapter(): Promise<StorageAdapter> {
  if (!adapterPromise) {
    adapterPromise = (async () => {
      const adapter = Capacitor.isNativePlatform()
        ? new (await import('./sqliteAdapter')).SqliteAdapter()
        : new (await import('./indexedDbAdapter')).IndexedDbAdapter()
      await adapter.init()
      return adapter
    })()
  }
  return adapterPromise
}
