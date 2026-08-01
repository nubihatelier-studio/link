import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LETTER_VISIBILITY_ORDER, type LetterVisibility } from '@/lib/letterVisibility'

/**
 * Editor view preferences that outlive a single pattern — how the canvas is
 * read, not what the pattern *is*. Kept out of `editorStore` (which is one
 * pattern's working state, reset on every load) and persisted, so a choice
 * made once doesn't have to be made again on the next pattern.
 */
interface EditorPrefsState {
  /** See `lib/letterVisibility.ts` — 'auto' follows the cell size, the others override it. */
  letterVisibility: LetterVisibility
  setLetterVisibility: (value: LetterVisibility) => void
  /** Advances auto → always → never → auto, for the toolbar's single-button control. */
  cycleLetterVisibility: () => void
}

export const useEditorPrefsStore = create<EditorPrefsState>()(
  persist(
    (set) => ({
      letterVisibility: 'auto',
      setLetterVisibility: (value) => set({ letterVisibility: value }),
      cycleLetterVisibility: () =>
        set((s) => {
          const next = LETTER_VISIBILITY_ORDER.indexOf(s.letterVisibility) + 1
          return { letterVisibility: LETTER_VISIBILITY_ORDER[next % LETTER_VISIBILITY_ORDER.length] }
        }),
    }),
    { name: 'nubih-editor-prefs' },
  ),
)
