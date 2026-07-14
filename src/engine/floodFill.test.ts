import { describe, expect, it } from 'vitest'
import type { ColorMap } from './types'
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
})
