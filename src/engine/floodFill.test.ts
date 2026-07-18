import { describe, expect, it } from 'vitest'
import type { ColorMap, FringeData } from './types'
import { floodFillCells } from './floodFill'

describe('floodFillCells', () => {
  it('fills a contiguous same-color region and stops at a different color', () => {
    // 3x3: a 2x2 block of A in the top-left, B elsewhere.
    const cells: ColorMap = {
      '0,0': '#A',
      '0,1': '#A',
      '1,0': '#A',
      '1,1': '#A',
      '0,2': '#B',
      '1,2': '#B',
      '2,0': '#B',
      '2,1': '#B',
      '2,2': '#B',
    }
    const next = floodFillCells(cells, 3, 3, 0, 0, '#C')
    expect(next).toEqual({
      '0,0': '#C',
      '0,1': '#C',
      '1,0': '#C',
      '1,1': '#C',
      '0,2': '#B',
      '1,2': '#B',
      '2,0': '#B',
      '2,1': '#B',
      '2,2': '#B',
    })
  })

  it('fills an uncolored (empty) region when starting from an empty cell', () => {
    const cells: ColorMap = { '0,0': '#A' }
    // 2x2 grid, (0,0) is colored, the other 3 cells are empty and contiguous.
    const next = floodFillCells(cells, 2, 2, 1, 1, '#C')
    expect(next).toEqual({ '0,0': '#A', '0,1': '#C', '1,0': '#C', '1,1': '#C' })
  })

  it('erasing (newHex null) removes the filled region instead of leaving a hex', () => {
    const cells: ColorMap = { '0,0': '#A', '0,1': '#A', '1,0': '#B' }
    const next = floodFillCells(cells, 2, 2, 0, 0, null)
    expect(next).toEqual({ '1,0': '#B' })
  })

  it('is a no-op when the target already matches the fill color', () => {
    const cells: ColorMap = { '0,0': '#A' }
    expect(floodFillCells(cells, 2, 2, 0, 0, '#A')).toBe(cells)
  })

  it('does not leak across a diagonal-only gap (4-connected, not 8-connected)', () => {
    // A checkerboard: (0,0) and (1,1) are A, but not orthogonally connected.
    const cells: ColorMap = { '0,0': '#A', '1,1': '#A', '0,1': '#B', '1,0': '#B' }
    const next = floodFillCells(cells, 2, 2, 0, 0, '#C')
    expect(next).toEqual({ '0,0': '#C', '1,1': '#A', '0,1': '#B', '1,0': '#B' })
  })

  it('ignores an out-of-bounds start cell', () => {
    const cells: ColorMap = { '0,0': '#A' }
    expect(floodFillCells(cells, 2, 2, 5, 5, '#C')).toBe(cells)
  })

  describe('with a fringe', () => {
    it('spreads into a column\'s fringe zone, stopping at that column\'s fringe length', () => {
      // 1 col x 2 rows body, fringe of length 3 below it — all one color.
      const cells: ColorMap = { '0,0': '#A', '1,0': '#A', '2,0': '#A', '3,0': '#A', '4,0': '#A' }
      const fringe: FringeData = { lengths: [3], turnBeads: [false] }
      const next = floodFillCells(cells, 1, 2, 0, 0, '#C', fringe)
      expect(next).toEqual({ '0,0': '#C', '1,0': '#C', '2,0': '#C', '3,0': '#C', '4,0': '#C' })
    })

    it('does not leak past a column\'s fringe length even if that cell has the same color', () => {
      // Depth 3 (row 5) is beyond col 0's fringe length of 3 (rows 2-4) — should be untouched.
      const cells: ColorMap = { '0,0': '#A', '2,0': '#A', '3,0': '#A', '4,0': '#A', '5,0': '#A' }
      const fringe: FringeData = { lengths: [3], turnBeads: [false] }
      const next = floodFillCells(cells, 1, 2, 0, 0, '#C', fringe)
      expect(next['5,0']).toBe('#A')
    })

    it('spreads sideways between two columns\' fringes at the same depth', () => {
      const cells: ColorMap = { '2,0': '#A', '2,1': '#A' }
      const fringe: FringeData = { lengths: [1, 1], turnBeads: [false, false] }
      const next = floodFillCells(cells, 2, 2, 2, 0, '#C', fringe)
      expect(next).toEqual({ '2,0': '#C', '2,1': '#C' })
    })

    it('ignores an out-of-bounds start cell that would only be valid without a fringe', () => {
      const cells: ColorMap = {}
      const fringe: FringeData = { lengths: [0], turnBeads: [false] }
      expect(floodFillCells(cells, 1, 2, 2, 0, '#C', fringe)).toBe(cells)
    })
  })

  describe('with a shaped (rowShape) body', () => {
    it('does not spread into a column outside the row\'s own span', () => {
      // 5-col, 1-row triangle point: only column 2 exists in row 0.
      const cells: ColorMap = { '0,2': '#A' }
      const rowShape = [{ offset: 2, length: 1 }]
      // Starting fill at (0,2) with no neighbors inside the shape — result is just that one cell recolored.
      const next = floodFillCells(cells, 5, 1, 0, 2, '#C', undefined, rowShape)
      expect(next).toEqual({ '0,2': '#C' })
    })

    it('ignores a start cell outside the row\'s shape even though it\'s inside cols', () => {
      const cells: ColorMap = {}
      const rowShape = [{ offset: 2, length: 1 }]
      expect(floodFillCells(cells, 5, 1, 0, 0, '#C', undefined, rowShape)).toBe(cells)
    })

    it('fills across a wider row without leaking into a narrower neighboring row', () => {
      // Row 0 is narrow (col 2 only), row 1 is full width — a fill starting in row 1 must not
      // spread up into row 0's out-of-shape columns even though they're vertically adjacent.
      const cells: ColorMap = { '1,0': '#A', '1,1': '#A', '1,2': '#A' }
      const rowShape = [
        { offset: 2, length: 1 },
        { offset: 0, length: 3 },
      ]
      const next = floodFillCells(cells, 3, 2, 1, 0, '#C', undefined, rowShape)
      expect(next).toEqual({ '1,0': '#C', '1,1': '#C', '1,2': '#C' })
    })
  })
})
