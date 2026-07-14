import { create } from 'zustand'
import { getStorageAdapter } from '@/storage'
import { migrateFromLocalStorage } from '@/storage/migration'

interface WeaveProgress {
  /** index into the technique's traversal order (see engine/weaveOrder.ts); -1 = not started */
  currentIndex: number
  updatedAt: number
}

interface WeaveState {
  progress: Record<string, WeaveProgress>
  /** Which pattern ids have been fetched from storage at least once (avoids re-fetching on every render). */
  loaded: Record<string, boolean>
  /** Lazily pulls one pattern's progress from storage into the in-memory cache — call when entering Weave Mode. */
  loadProgress: (patternId: string) => Promise<void>
  getIndex: (patternId: string) => number
  setIndex: (patternId: string, index: number) => void
  reset: (patternId: string) => void
}

function persistProgress(patternId: string, p: WeaveProgress) {
  getStorageAdapter()
    .then((adapter) => adapter.setWeaveProgress({ patternId, ...p }))
    .catch((err) => console.error('No se pudo guardar el progreso de tejido', err))
}

/**
 * Per-pattern weaving progress, persisted so closing the app and coming back
 * resumes exactly where the user left off. Kept separate from patternsStore
 * because progress is a very different write pattern (one counter, ticked
 * constantly) than pattern content (sparse cell edits) — and, unlike
 * patterns, it's loaded lazily per pattern instead of all at once, since
 * there's no "list of all progress" view anywhere in the app.
 */
export const useWeaveStore = create<WeaveState>()((set, get) => ({
  progress: {},
  loaded: {},

  loadProgress: async (patternId) => {
    if (get().loaded[patternId]) return
    const adapter = await getStorageAdapter()
    await migrateFromLocalStorage(adapter)
    const record = await adapter.getWeaveProgress(patternId)
    set((s) => ({
      loaded: { ...s.loaded, [patternId]: true },
      progress: record
        ? { ...s.progress, [patternId]: { currentIndex: record.currentIndex, updatedAt: record.updatedAt } }
        : s.progress,
    }))
  },

  getIndex: (patternId) => get().progress[patternId]?.currentIndex ?? -1,

  setIndex: (patternId, index) => {
    const p: WeaveProgress = { currentIndex: index, updatedAt: Date.now() }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },

  reset: (patternId) => {
    const p: WeaveProgress = { currentIndex: -1, updatedAt: Date.now() }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },
}))

/**
 * Próximo hito (fuera de alcance de esta iteración): un statsStore que agregue
 * cuentas tejidas / tiempo / rachas entre patrones para el dashboard de
 * estadísticas. La forma de WeaveProgress ya guarda lo necesario (índice y
 * timestamp por patrón) para poder derivarlo sin cambiar este store.
 */
