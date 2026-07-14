import { openDB, type IDBPDatabase } from 'idb'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter, WeaveProgressRecord } from './types'

const DB_NAME = 'nubih-db'
const DB_VERSION = 1
const PATTERNS_STORE = 'patterns'
const WEAVE_STORE = 'weaveProgress'

/**
 * Web storage backend. IndexedDB instead of localStorage for two reasons:
 * it isn't capped at ~5MB (localStorage's ceiling, which photo-derived
 * patterns with thousands of cells can hit fast), and writes are per-record
 * (one pattern), not a single ever-growing serialized blob.
 */
export class IndexedDbAdapter implements StorageAdapter {
  readonly backend = 'indexeddb' as const
  private dbPromise: Promise<IDBPDatabase> | null = null

  async init(): Promise<void> {
    await this.db()
  }

  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(PATTERNS_STORE)) {
            db.createObjectStore(PATTERNS_STORE, { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains(WEAVE_STORE)) {
            db.createObjectStore(WEAVE_STORE, { keyPath: 'patternId' })
          }
        },
      })
    }
    return this.dbPromise
  }

  async listPatterns(): Promise<PatternDoc[]> {
    const db = await this.db()
    return db.getAll(PATTERNS_STORE)
  }

  async getPattern(id: string): Promise<PatternDoc | undefined> {
    const db = await this.db()
    return db.get(PATTERNS_STORE, id)
  }

  async savePattern(doc: PatternDoc): Promise<void> {
    const db = await this.db()
    await db.put(PATTERNS_STORE, doc)
  }

  async deletePattern(id: string): Promise<void> {
    const db = await this.db()
    await db.delete(PATTERNS_STORE, id)
  }

  async getWeaveProgress(patternId: string): Promise<WeaveProgressRecord | undefined> {
    const db = await this.db()
    return db.get(WEAVE_STORE, patternId)
  }

  async setWeaveProgress(record: WeaveProgressRecord): Promise<void> {
    const db = await this.db()
    await db.put(WEAVE_STORE, record)
  }

  async deleteWeaveProgress(patternId: string): Promise<void> {
    const db = await this.db()
    await db.delete(WEAVE_STORE, patternId)
  }
}
