import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WeavePrefsState {
  /**
   * Advance to the next bead by tapping anywhere on the pattern, instead of
   * having to land the tap on the next bead itself. Off means only a tap near
   * that bead counts, which is the precise-but-fussy option.
   */
  tapAnywhereToAdvance: boolean
  setTapAnywhereToAdvance: (value: boolean) => void
}

export const useWeavePrefsStore = create<WeavePrefsState>()(
  persist(
    (set) => ({
      tapAnywhereToAdvance: true,
      setTapAnywhereToAdvance: (value) => set({ tapAnywhereToAdvance: value }),
    }),
    { name: 'nubih-weave-prefs' },
  ),
)
