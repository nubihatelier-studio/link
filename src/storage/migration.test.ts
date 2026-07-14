import { describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { migrateFromLocalStorage, MIGRATION_FLAG_KEY, MIGRATION_FLAG_VALUE } from './migration'
import type { StorageAdapter, WeaveProgressRecord } from './types'

/** In-memory stand-in for a real adapter, so migration logic can be tested without a browser DB. */
function createFakeAdapter(): StorageAdapter {
  const patterns = new Map<string, PatternDoc>()
  const progress = new Map<string, WeaveProgressRecord>()
  return {
    backend: 'indexeddb',
    async init() {},
    async listPatterns() {
      return [...patterns.values()]
    },
    async getPattern(id) {
      return patterns.get(id)
    },
    async savePattern(doc) {
      patterns.set(doc.id, doc)
    },
    async deletePattern(id) {
      patterns.delete(id)
    },
    async getWeaveProgress(patternId) {
      return progress.get(patternId)
    },
    async setWeaveProgress(record) {
      progress.set(record.patternId, record)
    },
    async deleteWeaveProgress(patternId) {
      progress.delete(patternId)
    },
  }
}

/** Minimal Storage stand-in (avoids depending on jsdom's real localStorage across tests). */
function createFakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

const SAMPLE_PATTERN: PatternDoc = {
  id: 'p_abc123',
  name: 'Patrón 1',
  config: { technique: 'peyote', cols: 6, rows: 50, beadTypeId: 'miyuki-delica-11' },
  cells: { '0,0': '#1c1c1e', '0,1': '#c9a227' },
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
}

/** Exactly the shape zustand's `persist` middleware writes for these two stores. */
function legacyLocalStorageWith(patterns: PatternDoc[], progress: Record<string, { currentIndex: number; updatedAt: number }> = {}) {
  const patternsMap: Record<string, PatternDoc> = {}
  for (const p of patterns) patternsMap[p.id] = p
  return {
    'nubih-patterns': JSON.stringify({
      state: { patterns: patternsMap, order: patterns.map((p) => p.id) },
      version: 0,
    }),
    'nubih-weave-progress': JSON.stringify({ state: { progress }, version: 0 }),
  }
}

describe('migrateFromLocalStorage', () => {
  it('copies every legacy pattern and weave-progress record into the adapter', async () => {
    const storage = createFakeStorage(
      legacyLocalStorageWith([SAMPLE_PATTERN], { [SAMPLE_PATTERN.id]: { currentIndex: 12, updatedAt: 1700000002000 } }),
    )
    const adapter = createFakeAdapter()

    const result = await migrateFromLocalStorage(adapter, storage)

    expect(result.ran).toBe(true)
    expect(result.patternsMigrated).toBe(1)
    expect(result.progressMigrated).toBe(1)
    expect(result.errors).toEqual([])

    const migrated = await adapter.getPattern(SAMPLE_PATTERN.id)
    expect(migrated).toEqual(SAMPLE_PATTERN)
    const progress = await adapter.getWeaveProgress(SAMPLE_PATTERN.id)
    expect(progress).toEqual({ patternId: SAMPLE_PATTERN.id, currentIndex: 12, updatedAt: 1700000002000 })
  })

  it('marks the migration flag done only after a successful run, and never touches the legacy keys', async () => {
    const storage = createFakeStorage(legacyLocalStorageWith([SAMPLE_PATTERN]))
    const adapter = createFakeAdapter()

    await migrateFromLocalStorage(adapter, storage)

    expect(storage.getItem(MIGRATION_FLAG_KEY)).toBe(MIGRATION_FLAG_VALUE)
    // The original localStorage data must survive as an emergency backup.
    expect(storage.getItem('nubih-patterns')).not.toBeNull()
  })

  it('is a no-op on a second call once the flag is set', async () => {
    const storage = createFakeStorage(legacyLocalStorageWith([SAMPLE_PATTERN]))
    const adapter = createFakeAdapter()
    const saveSpy = vi.spyOn(adapter, 'savePattern')

    await migrateFromLocalStorage(adapter, storage)
    saveSpy.mockClear()
    const second = await migrateFromLocalStorage(adapter, storage)

    expect(second.ran).toBe(false)
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('marks done with zero migrations on a fresh install (nothing in localStorage)', async () => {
    const storage = createFakeStorage()
    const adapter = createFakeAdapter()

    const result = await migrateFromLocalStorage(adapter, storage)

    expect(result.ran).toBe(false)
    expect(storage.getItem(MIGRATION_FLAG_KEY)).toBe(MIGRATION_FLAG_VALUE)
  })

  it('does not set the done flag if a pattern fails verification, so it can retry next launch', async () => {
    const storage = createFakeStorage(legacyLocalStorageWith([SAMPLE_PATTERN]))
    const adapter = createFakeAdapter()
    // Simulate a backend that silently drops the write (e.g. a quota error swallowed upstream).
    vi.spyOn(adapter, 'savePattern').mockResolvedValue(undefined)
    vi.spyOn(adapter, 'getPattern').mockResolvedValue(undefined)

    const result = await migrateFromLocalStorage(adapter, storage)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(storage.getItem(MIGRATION_FLAG_KEY)).toBeNull()
  })

  it('skips malformed pattern entries instead of throwing', async () => {
    const storage = createFakeStorage({
      'nubih-patterns': JSON.stringify({
        state: { patterns: { bad: { id: 'bad' /* missing cells/config/name */ } }, order: ['bad'] },
        version: 0,
      }),
    })
    const adapter = createFakeAdapter()

    const result = await migrateFromLocalStorage(adapter, storage)

    expect(result.patternsMigrated).toBe(0)
    expect(result.errors.length).toBe(1)
  })
})
