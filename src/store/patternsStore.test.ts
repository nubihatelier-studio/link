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

describe('patternsStore.setNote', () => {
  beforeEach(() => {
    adapterError = null
    fakeAdapter = createFakeAdapter([PATTERN])
    vi.resetModules()
  })

  it('updates the pattern\'s note and bumps updatedAt', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    usePatternsStore.getState().setNote(PATTERN.id, 'Para el cumpleaños de mamá')
    const doc = usePatternsStore.getState().patterns[PATTERN.id]
    expect(doc?.note).toBe('Para el cumpleaños de mamá')
    expect(doc?.updatedAt).toBeGreaterThan(PATTERN.updatedAt)
  })

  it('is a no-op for an unknown pattern id', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    usePatternsStore.getState().setNote('nope', 'x')
    expect(usePatternsStore.getState().patterns['nope']).toBeUndefined()
  })
})

describe('patternsStore.hydrate — first-launch onboarding', () => {
  beforeEach(() => {
    adapterError = null
    fakeAdapter = createFakeAdapter([]) // no patterns at all — a genuinely fresh device
    localStorage.clear()
    vi.resetModules()
  })

  it('seeds a sample pattern and flags justOnboarded when the device has never seen onboarding', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    const state = usePatternsStore.getState()
    expect(state.order).toHaveLength(1)
    expect(state.justOnboarded).toBe(true)
    expect(localStorage.getItem('nubih-onboarding-seen')).toBe('1')
  })

  it('does not seed a sample pattern once onboarding has already been seen', async () => {
    localStorage.setItem('nubih-onboarding-seen', '1')
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    const state = usePatternsStore.getState()
    expect(state.order).toHaveLength(0)
    expect(state.justOnboarded).toBe(false)
  })

  it('dismissOnboarding clears the justOnboarded flag', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    expect(usePatternsStore.getState().justOnboarded).toBe(true)
    usePatternsStore.getState().dismissOnboarding()
    expect(usePatternsStore.getState().justOnboarded).toBe(false)
  })
})
