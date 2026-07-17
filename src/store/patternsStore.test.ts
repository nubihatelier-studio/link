import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter } from '@/storage/types'

let fakeAdapter: StorageAdapter | null = null
let adapterError: Error | null = null

vi.mock('@/storage', () => ({
  getStorageAdapter: () => (adapterError ? Promise.reject(adapterError) : Promise.resolve(fakeAdapter)),
}))

function createFakeAdapter(seed: PatternDoc[] = []): StorageAdapter {
  const patterns = new Map(seed.map((p) => [p.id, p]))
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
    async getWeaveProgress() {
      return undefined
    },
    async listWeaveProgress() {
      return []
    },
    async setWeaveProgress() {},
    async deleteWeaveProgress() {},
  }
}

const PATTERN: PatternDoc = {
  id: 'p_1',
  name: 'Flor',
  config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  createdAt: 1,
  updatedAt: 1,
}

describe('patternsStore.hydrate', () => {
  beforeEach(() => {
    adapterError = null
    fakeAdapter = createFakeAdapter([PATTERN])
    vi.resetModules()
  })

  it('loads patterns and marks hydrated on success', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    const state = usePatternsStore.getState()
    expect(state.hydrated).toBe(true)
    expect(state.hydrationError).toBeNull()
    expect(state.patterns[PATTERN.id]).toEqual(PATTERN)
  })

  it('sets hydrationError instead of hanging forever when storage fails to open', async () => {
    adapterError = new Error('IndexedDB blocked')
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    const state = usePatternsStore.getState()
    expect(state.hydrated).toBe(false)
    expect(state.hydrationError).toBe('IndexedDB blocked')
  })

  it('is a no-op if already hydrated (does not re-fetch)', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    fakeAdapter = createFakeAdapter([]) // would wipe patterns if re-fetched
    await usePatternsStore.getState().hydrate()
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)
  })
})
