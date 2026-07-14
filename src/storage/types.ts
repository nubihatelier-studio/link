import type { PatternDoc } from '@/engine/types'

/** Bumped whenever the on-disk/exported shape of a pattern or backup changes. */
export const SCHEMA_VERSION = 1

export interface WeaveProgressRecord {
  patternId: string
  currentIndex: number
  updatedAt: number
}

/**
 * Single storage contract implemented by both the web (IndexedDB) and native
 * (Capacitor SQLite) backends, so the rest of the app never branches on
 * platform. Deliberately per-record CRUD (not "read/write the whole
 * collection as one blob") — that's what actually avoids re-serializing an
 * ever-growing JSON string on every autosave tick, which is how the old
 * localStorage-backed store hit its size ceiling fastest.
 */
export interface StorageAdapter {
  /** Human-readable backend name, surfaced in diagnostics/exports. */
  readonly backend: 'indexeddb' | 'sqlite'

  init(): Promise<void>

  listPatterns(): Promise<PatternDoc[]>
  getPattern(id: string): Promise<PatternDoc | undefined>
  savePattern(doc: PatternDoc): Promise<void>
  deletePattern(id: string): Promise<void>

  getWeaveProgress(patternId: string): Promise<WeaveProgressRecord | undefined>
  setWeaveProgress(record: WeaveProgressRecord): Promise<void>
  deleteWeaveProgress(patternId: string): Promise<void>
}

export interface PatternBackupFile {
  schemaVersion: number
  exportedAt: number
  kind: 'pattern'
  pattern: PatternDoc
}

export interface FullBackupFile {
  schemaVersion: number
  exportedAt: number
  kind: 'full-backup'
  patterns: PatternDoc[]
  weaveProgress: WeaveProgressRecord[]
}
