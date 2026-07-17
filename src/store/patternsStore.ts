import { create } from 'zustand'
import type { ColorMap, FringeData, PatternConfig, PatternDoc } from '@/engine/types'
import { getStorageAdapter } from '@/storage'
import { migrateFromLocalStorage, type MigrationResult } from '@/storage/migration'
import { requestPersistentStorageOnce } from '@/storage/persistence'

function makeId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface PatternsState {
  patterns: Record<string, PatternDoc>
  order: string[]
  /** False until `hydrate()` has loaded patterns from the storage adapter. */
  hydrated: boolean
  /** Set instead of `hydrated: true` if opening storage itself failed (no IndexedDB, quota/permissions denied, etc.) — App.tsx shows a dedicated screen instead of hanging on the loading spinner forever. */
  hydrationError: string | null
  migrationResult: MigrationResult | null
  hydrate: () => Promise<void>
  /** Re-lists patterns from the storage adapter without re-running migration — use after an import. */
  refresh: () => Promise<void>

  createPattern: (config: PatternConfig, name?: string, fringe?: FringeData) => string
  createPatternWithCells: (config: PatternConfig, cells: ColorMap, name?: string) => string
  renamePattern: (id: string, name: string) => void
  deletePattern: (id: string) => void
  duplicatePattern: (id: string) => string | null
  setCells: (id: string, cells: ColorMap) => void
  setCell: (id: string, key: string, hex: string | null) => void
  setFringe: (id: string, fringe: FringeData) => void
  getPattern: (id: string) => PatternDoc | undefined
}

/**
 * Fire-and-forget write-through to the storage adapter. Every mutating
 * action below updates in-memory state synchronously first (so callers like
 * `createPattern` can keep returning an id immediately and `navigate()` to
 * it without awaiting anything), then persists just that one record in the
 * background — not the whole collection, unlike the old localStorage blob.
 */
function persistPattern(doc: PatternDoc) {
  getStorageAdapter()
    .then((adapter) => adapter.savePattern(doc))
    .catch((err) => console.error('No se pudo guardar el patrón', err))
  // Fire-and-forget, and a no-op after the very first real save ever (see
  // the one-time flag inside) — this is the earliest point a save is real
  // enough to be worth protecting from the browser's storage eviction.
  requestPersistentStorageOnce()
}

function persistDelete(id: string) {
  getStorageAdapter()
    .then((adapter) => adapter.deletePattern(id))
    .catch((err) => console.error('No se pudo eliminar el patrón', err))
}

export const usePatternsStore = create<PatternsState>()((set, get) => ({
  patterns: {},
  order: [],
  hydrated: false,
  hydrationError: null,
  migrationResult: null,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const adapter = await getStorageAdapter()
      const migrationResult = await migrateFromLocalStorage(adapter)
      const docs = await adapter.listPatterns()
      const patterns: Record<string, PatternDoc> = {}
      for (const doc of docs) patterns[doc.id] = doc
      const order = docs.sort((a, b) => b.updatedAt - a.updatedAt).map((d) => d.id)
      set({ patterns, order, hydrated: true, migrationResult })
    } catch (err) {
      console.error('No se pudo abrir el almacenamiento local', err)
      set({ hydrationError: (err as Error).message || 'unknown' })
    }
  },

  refresh: async () => {
    const adapter = await getStorageAdapter()
    const docs = await adapter.listPatterns()
    const patterns: Record<string, PatternDoc> = {}
    for (const doc of docs) patterns[doc.id] = doc
    const order = docs.sort((a, b) => b.updatedAt - a.updatedAt).map((d) => d.id)
    set({ patterns, order })
  },

  createPattern: (config, name, fringe) => {
    const id = makeId()
    const doc: PatternDoc = {
      id,
      name: name ?? `Patrón ${get().order.length + 1}`,
      config,
      cells: {},
      ...(fringe ? { fringe } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ patterns: { ...s.patterns, [id]: doc }, order: [id, ...s.order] }))
    persistPattern(doc)
    return id
  },

  createPatternWithCells: (config, cells, name) => {
    const id = makeId()
    const doc: PatternDoc = {
      id,
      name: name ?? `Patrón ${get().order.length + 1}`,
      config,
      cells,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ patterns: { ...s.patterns, [id]: doc }, order: [id, ...s.order] }))
    persistPattern(doc)
    return id
  },

  renamePattern: (id, name) => {
    let updated: PatternDoc | undefined
    set((s) => {
      const doc = s.patterns[id]
      if (!doc) return s
      updated = { ...doc, name, updatedAt: Date.now() }
      return { patterns: { ...s.patterns, [id]: updated } }
    })
    if (updated) persistPattern(updated)
  },

  deletePattern: (id) => {
    set((s) => {
      const next = { ...s.patterns }
      delete next[id]
      return { patterns: next, order: s.order.filter((x) => x !== id) }
    })
    persistDelete(id)
  },

  duplicatePattern: (id) => {
    const src = get().patterns[id]
    if (!src) return null
    const newId = makeId()
    const doc: PatternDoc = {
      ...src,
      id: newId,
      name: `${src.name} (copia)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ patterns: { ...s.patterns, [newId]: doc }, order: [newId, ...s.order] }))
    persistPattern(doc)
    return newId
  },

  setCells: (id, cells) => {
    let updated: PatternDoc | undefined
    set((s) => {
      const doc = s.patterns[id]
      if (!doc) return s
      updated = { ...doc, cells, updatedAt: Date.now() }
      return { patterns: { ...s.patterns, [id]: updated } }
    })
    if (updated) persistPattern(updated)
  },

  setCell: (id, key, hex) => {
    let updated: PatternDoc | undefined
    set((s) => {
      const doc = s.patterns[id]
      if (!doc) return s
      const cells = { ...doc.cells }
      if (hex) cells[key] = hex
      else delete cells[key]
      updated = { ...doc, cells, updatedAt: Date.now() }
      return { patterns: { ...s.patterns, [id]: updated } }
    })
    if (updated) persistPattern(updated)
  },

  setFringe: (id, fringe) => {
    let updated: PatternDoc | undefined
    set((s) => {
      const doc = s.patterns[id]
      if (!doc) return s
      updated = { ...doc, fringe, updatedAt: Date.now() }
      return { patterns: { ...s.patterns, [id]: updated } }
    })
    if (updated) persistPattern(updated)
  },

  getPattern: (id) => get().patterns[id],
}))
