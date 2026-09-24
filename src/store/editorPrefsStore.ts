import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LETTER_VISIBILITY_ORDER, type LetterVisibility } from '@/lib/letterVisibility'

/**
 * Editor view preferences that outlive a single pattern — how the canvas is
 * read, not what the pattern *is*. Kept out of `editorStore` (which is one
 * pattern's working state, reset on every load) and persisted, so a choice
 * made once doesn't have to be made again on the next pattern.
 */
/** Which panel the desktop sidebar is showing — see `EditorPanelTabs`. */
export type EditorPanelTab = 'colors' | 'shape' | 'fringe' | 'loop'

interface EditorPrefsState {
  /** See `lib/letterVisibility.ts` — 'auto' follows the cell size, the others override it. */
  letterVisibility: LetterVisibility
  setLetterVisibility: (value: LetterVisibility) => void
  /** Advances auto → always → never → auto, for the toolbar's single-button control. */
  cycleLetterVisibility: () => void
  /**
   * The sidebar's open tab. Persisted like everything else here: someone
   * shaping a piece stays on Forma from one pattern to the next instead of
   * re-opening it every time. A pattern that has no such tab (a loom piece
   * has no Forma) falls back to Colores without touching this — the choice
   * is still there for the next pattern that can honour it.
   */
  panelTab: EditorPanelTab
  setPanelTab: (tab: EditorPanelTab) => void
  /**
   * Hacia qué lado se da la vuelta al tejer un peyote triangular. Es una maña
   * de la mano, no algo del patrón —lo dijo la tejedora: "probablemente sea
   * una decisión personal"—, así que vive acá y no en el patrón: se elige una
   * vez y vale para todos.
   */
  triangleWeaveClockwise: boolean
  setTriangleWeaveClockwise: (clockwise: boolean) => void
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      letterVisibility: 'auto',
      setLetterVisibility: (value) => set({ letterVisibility: value }),
      panelTab: 'colors',
      setPanelTab: (panelTab) => set({ panelTab }),
      triangleWeaveClockwise: true,
      setTriangleWeaveClockwise: (triangleWeaveClockwise) => set({ triangleWeaveClockwise }),
      cycleLetterVisibility: () =>
        set((s) => {
          const next = LETTER_VISIBILITY_ORDER.indexOf(s.letterVisibility) + 1
          return { letterVisibility: LETTER_VISIBILITY_ORDER[next % LETTER_VISIBILITY_ORDER.length] }
        }),
    }),
    { name: 'nubih-editor-prefs' },
  ),
)
