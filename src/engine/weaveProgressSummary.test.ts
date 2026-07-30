import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { pickMostRecentInProgress, summarizeWeaveProgress } from './weaveProgressSummary'

describe('summarizeWeaveProgress', () => {
  it('returns null when weaving has not started (currentIndex < 0)', () => {
    expect(summarizeWeaveProgress({ technique: 'loom', cols: 3, rows: 2, beadTypeId: 'x' }, -1)).toBeNull()
  })

  it('loom: counts by row index', () => {
    const config = { technique: 'loom' as const, cols: 3, rows: 2, beadTypeId: 'x' }
    expect(summarizeWeaveProgress(config, 0)).toEqual({
      unitIndex: 0,
      unitCount: 2,
      percent: 17,
      isFringe: false,
      grouped: false,
    })
    // Last cell (row 1, col 2) — final index of 6 total.
    expect(summarizeWeaveProgress(config, 5)).toEqual({
      unitIndex: 1,
      unitCount: 2,
      percent: 100,
      isFringe: false,
      grouped: false,
    })
  })

  it('peyote: the foundation pass (rows 1-2) is one grouped step, counted as row 2', () => {
    const config = { technique: 'peyote' as const, cols: 2, rows: 3, beadTypeId: 'x' }
    // order[0] = foundation pass (4 beads, unit 1), order[1..2] = row 2 (index 2, "fila 3").
    expect(summarizeWeaveProgress(config, 0)).toEqual({
      unitIndex: 1,
      unitCount: 3,
      percent: 67, // 4 of 6 total beads strung
      isFringe: false,
      grouped: true,
    })
    expect(summarizeWeaveProgress(config, 2)).toEqual({
      unitIndex: 2,
      unitCount: 3,
      percent: 100,
      isFringe: false,
      grouped: false,
    })
  })

  it('clamps an out-of-range index to the last cell instead of throwing', () => {
    const config = { technique: 'loom' as const, cols: 3, rows: 2, beadTypeId: 'x' }
    expect(summarizeWeaveProgress(config, 999)).toEqual({
      unitIndex: 1,
      unitCount: 2,
      percent: 100,
      isFringe: false,
      grouped: false,
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
      expect(summary).toEqual({ unitIndex: 1, unitCount: 2, percent: 83, isFringe: true, grouped: false })
    })
  })

  describe('with a shaped (rowShape) body', () => {
    it('a narrower shape means fewer total beads, so percent reflects the real (smaller) total', () => {
      // 2-col, 2-row triangle: row 0 has 1 col, row 1 has 2 — 3 beads total, not 4.
      const config = { technique: 'brick' as const, cols: 2, rows: 2, beadTypeId: 'x' }
      const rowShape = [
        { offset: 0, length: 1 },
        { offset: 0, length: 2 },
      ]
      // Finishing bead index 2 (the last of 3) is 100% for the shaped body, not 75% as a full rectangle would read.
      expect(summarizeWeaveProgress(config, 2, undefined, rowShape)?.percent).toBe(100)
      expect(summarizeWeaveProgress(config, 2)?.percent).toBe(75) // no rowShape arg: unaffected, as before
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
