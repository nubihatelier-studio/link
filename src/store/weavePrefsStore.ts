import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WeavePrefsState {
  /** "Columna/fila protagonista" view — a big current-unit + word-chart reading view instead of the full grid, for hands-busy weaving. */
  handsBusyMode: boolean
  /** Advance to the next bead by tapping anywhere on the pattern area, not just the Siguiente button. */
  tapAnywhereToAdvance: boolean
  setHandsBusyMode: (value: boolean) => void
  setTapAnywhereToAdvance: (value: boolean) => void
}

export const useWeavePrefsStore = create<WeavePrefsState>()(
  persist(
    (set) => ({
      handsBusyMode: false,
      tapAnywhereToAdvance: true,
      setHandsBusyMode: (value) => set({ handsBusyMode: value }),
      setTapAnywhereToAdvance: (value) => set({ tapAnywhereToAdvance: value }),
    }),
    { name: 'nubih-weave-prefs' },
  ),
)
