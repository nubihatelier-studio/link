import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ColorMap, PatternConfig, PatternDoc } from '@/engine/types'

function makeId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface PatternsState {
  patterns: Record<string, PatternDoc>
  order: string[]
  createPattern: (config: PatternConfig, name?: string) => string
  createPatternWithCells: (config: PatternConfig, cells: ColorMap, name?: string) => string
  renamePattern: (id: string, name: string) => void
  deletePattern: (id: string) => void
  duplicatePattern: (id: string) => string | null
  setCells: (id: string, cells: ColorMap) => void
  setCell: (id: string, key: string, hex: string | null) => void
  getPattern: (id: string) => PatternDoc | undefined
}

export const usePatternsStore = create<PatternsState>()(
  persist(
    (set, get) => ({
      patterns: {},
      order: [],

      createPattern: (config, name) => {
        const id = makeId()
        const doc: PatternDoc = {
          id,
          name: name ?? `Patrón ${get().order.length + 1}`,
          config,
          cells: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ patterns: { ...s.patterns, [id]: doc }, order: [id, ...s.order] }))
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
        return id
      },

      renamePattern: (id, name) => {
        set((s) => {
          const doc = s.patterns[id]
          if (!doc) return s
          return { patterns: { ...s.patterns, [id]: { ...doc, name, updatedAt: Date.now() } } }
        })
      },

      deletePattern: (id) => {
        set((s) => {
          const next = { ...s.patterns }
          delete next[id]
          return { patterns: next, order: s.order.filter((x) => x !== id) }
        })
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
        return newId
      },

      setCells: (id, cells) => {
        set((s) => {
          const doc = s.patterns[id]
          if (!doc) return s
          return { patterns: { ...s.patterns, [id]: { ...doc, cells, updatedAt: Date.now() } } }
        })
      },

      setCell: (id, key, hex) => {
        set((s) => {
          const doc = s.patterns[id]
          if (!doc) return s
          const cells = { ...doc.cells }
          if (hex) cells[key] = hex
          else delete cells[key]
          return { patterns: { ...s.patterns, [id]: { ...doc, cells, updatedAt: Date.now() } } }
        })
      },

      getPattern: (id) => get().patterns[id],
    }),
    { name: 'nubih-patterns' },
  ),
)
