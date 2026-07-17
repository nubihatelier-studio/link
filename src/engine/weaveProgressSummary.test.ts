import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { pickMostRecentInProgress, summarizeWeaveProgress } from './weaveProgressSummary'

describe('summarizeWeaveProgress', () => {
  it('returns null when weaving has not started (currentIndex < 0)', () => {
    expect(summarizeWeaveProgress({ technique: 'loom', cols: 3, rows: 2, beadTypeId: 'x' }, -1)).toBeNull()
  })

  it('loom: unit is row, counts by row index', () => {
    const config = { technique: 'loom' as const, cols: 3, rows: 2, beadTypeId: 'x' }
    expect(summarizeWeaveProgress(config, 0)).toEqual({
      unit: 'row',
      unitIndex: 0,
      unitCount: 2,
      percent: 17,
      isFringe: false,
    })
    // Last cell (row 1, col 2) — final index of 6 total.
    expect(summarizeWeaveProgress(config, 5)).toEqual({
      unit: 'row',
      unitIndex: 1,
      unitCount: 2,
      percent: 100,
      isFringe: false,
    })
  })

  it('peyote: unit is column, follows the boustrophedon traversal order', () => {
    const config = { technique: 'peyote' as const, cols: 2, rows: 3, beadTypeId: 'x' }
    // order: (0,0) (1,0) (2,0) (2,1) (1,1) (0,1) — index 3 is (2,1), column 1.
    expect(summarizeWeaveProgress(config, 3)).toEqual({
      unit: 'column',
      unitIndex: 1,
      unitCount: 2,
      percent: 67,
      isFringe: false,
    })
  })

  it('clamps an out-of-range index to the last cell instead of throwing', () => {
    const config = { technique: 'loom' as const, cols: 3, rows: 2, beadTypeId: 'x' }
    expect(summarizeWeaveProgress(config, 999)).toEqual({
      unit: 'row',
      unitIndex: 1,
      unitCount: 2,
      percent: 100,
      isFringe: false,
    })
  })

  describe('with a fringe', () => {
    it('folds the fringe beads into the total so percent reflects the whole piece', () => {
      const config = { technique: 'brick' as const, cols: 2, rows: 2, beadTypeId: 'x' }
      const fringe: FringeData = { lengths: [2, 0], turnBeads: [false, false] }
      // body has 4 beads, +2 fringe beads = 6 total. Finishing just the body is index 3 of 6, not 4 — 67%, not 100%.
      expect(summarizeWeaveProgress(config, 3, fringe)?.percent).toBe(67)
      expect(summarizeWeaveProgress(config, 3)?.percent).toBe(100) // no fringe arg: unaffected, as before
    })

    it('marks isFringe once currentIndex lands past the body, pinning unitIndex to the last body unit', () => {
      const config = { technique: 'brick' as const, cols: 2, rows: 2, beadTypeId: 'x' }
      const fringe: FringeData = { lengths: [2, 0], turnBeads: [false, false] }
      const summary = summarizeWeaveProgress(config, 4, fringe) // index 4 = first fringe bead
      expect(summary).toEqual({ unit: 'row', unitIndex: 1, unitCount: 2, percent: 83, isFringe: true })
    })
  })
})

describe('pickMostRecentInProgress', () => {
  it('returns null when there is no progress at all', () => {
    expect(pickMostRecentInProgress({})).toBeNull()
  })

  it('ignores patterns that have not been started', () => {
    expect(pickMostRecentInProgress({ p1: { currentIndex: -1, updatedAt: 100 } })).toBeNull()
  })

  it('picks the pattern with the most recent updatedAt among in-progress ones', () => {
    const progress = {
      p1: { currentIndex: 5, updatedAt: 100 },
      p2: { currentIndex: 2, updatedAt: 300 },
      p3: { currentIndex: -1, updatedAt: 500 }, // not started — ignored despite being "most recent"
    }
    expect(pickMostRecentInProgress(progress)).toBe('p2')
  })
})
