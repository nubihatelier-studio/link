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

describe('patternsStore — plantillas', () => {
  const FLOWER: PatternDoc = {
    ...PATTERN,
    id: 'p_flower',
    name: 'Flower Ring',
    cells: { '0,0': '#e58fb0' },
    palette: ['#e58fb0', null, null, null, null, null],
    updatedAt: 5,
  }

  beforeEach(() => {
    adapterError = null
    fakeAdapter = createFakeAdapter([PATTERN, FLOWER])
    vi.resetModules()
  })

  async function store() {
    const { usePatternsStore } = await import('./patternsStore')
    await usePatternsStore.getState().hydrate()
    return usePatternsStore
  }

  it('guardar como plantilla la deja en plantillas y no en la biblioteca, y se guarda en el dispositivo', async () => {
    const s = await store()
    const result = s.getState().saveTemplate(FLOWER.id, 'Flower Ring')!
    expect(s.getState().templates[result.id]).toMatchObject({ name: 'Flower Ring', isTemplate: true, cells: FLOWER.cells })
    expect(s.getState().order).not.toContain(result.id)
    expect(s.getState().patterns[result.id]).toBeUndefined()
    await new Promise((r) => setTimeout(r, 0))
    expect((await fakeAdapter!.getPattern(result.id))?.isTemplate).toBe(true)
  })

  it('al abrir la app, las plantillas guardadas vuelven como plantillas, fuera de la biblioteca', async () => {
    fakeAdapter = createFakeAdapter([PATTERN, { ...FLOWER, id: 't_1', isTemplate: true }])
    const s = await store()
    expect(Object.keys(s.getState().templates)).toEqual(['t_1'])
    expect(s.getState().order).toEqual([PATTERN.id])
  })

  it('reemplazar una plantilla conserva su id y devuelve la anterior para deshacer', async () => {
    const s = await store()
    const first = s.getState().saveTemplate(FLOWER.id, 'Flower Ring')!
    const second = s.getState().saveTemplate(PATTERN.id, 'Flower Ring', first.id)!
    expect(second.id).toBe(first.id)
    expect(second.replaced?.cells).toEqual(FLOWER.cells)
    expect(s.getState().templates[first.id].cells).toEqual(PATTERN.cells)
    expect(Object.keys(s.getState().templates)).toHaveLength(1)
  })

  it('crear desde la plantilla agrega un patrón nuevo a la biblioteca, igual o sólo con la forma', async () => {
    const s = await store()
    const { id } = s.getState().saveTemplate(FLOWER.id, 'Flower Ring')!

    const full = s.getState().createFromTemplate(id, 'full')!
    expect(s.getState().order[0]).toBe(full)
    expect(s.getState().patterns[full]).toMatchObject({ name: 'Flower Ring 2', cells: FLOWER.cells, palette: FLOWER.palette })
    expect(s.getState().patterns[full].isTemplate).toBeUndefined()

    const shape = s.getState().createFromTemplate(id, 'shape')!
    expect(s.getState().patterns[shape]).toMatchObject({ name: 'Flower Ring 3', cells: {}, config: FLOWER.config })
    expect(s.getState().patterns[shape].palette).toBeUndefined()
  })

  it('eliminar y deshacer devuelve la plantilla', async () => {
    const s = await store()
    const { id } = s.getState().saveTemplate(FLOWER.id, 'Flower Ring')!
    const removed = s.getState().deleteTemplate(id)!
    expect(s.getState().templates[id]).toBeUndefined()
    s.getState().restoreTemplate(removed)
    expect(s.getState().templates[id].name).toBe('Flower Ring')
  })
})

describe('patternsStore — crear desde una plantilla Nubih', () => {
  beforeEach(() => {
    adapterError = null
    fakeAdapter = createFakeAdapter([])
    vi.resetModules()
  })

  it('crea un patrón en la biblioteca desde una plantilla que viene con la app', async () => {
    const { usePatternsStore } = await import('./patternsStore')
    const { NUBIH_TEMPLATES } = await import('@/data/nubihTemplates')
    const id = usePatternsStore.getState().createFromTemplate(NUBIH_TEMPLATES[0], 'full')!
    const doc = usePatternsStore.getState().patterns[id]
    expect(doc.name).toBe('Flower Ring 39 x 10')
    expect(doc.cells).toEqual(NUBIH_TEMPLATES[0].cells)
    expect(usePatternsStore.getState().order).toContain(id)
  })
})
