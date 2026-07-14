import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WeaveProgress {
  /** index into the technique's traversal order (see engine/weaveOrder.ts); -1 = not started */
  currentIndex: number
  updatedAt: number
}

interface WeaveState {
  progress: Record<string, WeaveProgress>
  getIndex: (patternId: string) => number
  setIndex: (patternId: string, index: number) => void
  reset: (patternId: string) => void
}

/**
 * Per-pattern weaving progress, persisted so closing the app and coming back
 * resumes exactly where the user left off. Kept separate from patternsStore
 * because progress is a very different write pattern (one counter, ticked
 * constantly) than pattern content (sparse cell edits).
 */
export const useWeaveStore = create<WeaveState>()(
  persist(
    (set, get) => ({
      progress: {},

      getIndex: (patternId) => get().progress[patternId]?.currentIndex ?? -1,

      setIndex: (patternId, index) =>
        set((s) => ({
          progress: { ...s.progress, [patternId]: { currentIndex: index, updatedAt: Date.now() } },
        })),

      reset: (patternId) =>
        set((s) => ({
          progress: { ...s.progress, [patternId]: { currentIndex: -1, updatedAt: Date.now() } },
        })),
    }),
    { name: 'nubih-weave-progress' },
  ),
)

/**
 * Próximo hito (fuera de alcance de esta iteración): un statsStore que agregue
 * cuentas tejidas / tiempo / rachas entre patrones para el dashboard de
 * estadísticas. La forma de WeaveProgress ya guarda lo necesario (índice y
 * timestamp por patrón) para poder derivarlo sin cambiar este store.
 */
