import { describe, expect, it } from 'vitest'
import { computeGradientCells } from './gradient'

const RED = '#ff0000'
const BLUE = '#0000ff'
const GREEN = '#00ff00'
const WHITE = '#ffffff'
const BLACK = '#000000'
const GRAY = '#808080'

describe('computeGradientCells', () => {
  it('vertical: interpolates from start at the top row to end at the bottom row (loom, no dither)', () => {
    const cells = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]
    const result = computeGradientCells(cells, 'loom', 20, RED, BLUE, 'vertical', [RED, BLUE], 0)
    expect(result['0,0']).toBe(RED)
    expect(result['2,0']).toBe(BLUE)
  })

  it('a 3-color palette produces a visible middle band, not just the two endpoints', () => {
    const cells = Array.from({ length: 9 }, (_, row) => ({ row, col: 0 }))
    const result = computeGradientCells(cells, 'loom', 20, WHITE, BLACK, 'vertical', [WHITE, GRAY, BLACK], 0)
    expect(result['0,0']).toBe(WHITE)
    expect(result['8,0']).toBe(BLACK)
    expect(result['4,0']).toBe(GRAY) // dead center should snap to the palette's middle color
  })

  it('diagonalDR: increases with both row and column (down-right)', () => {
    const cells = [
      { row: 0, col: 0 },
      { row: 0, col: 4 },
      { row: 4, col: 0 },
      { row: 4, col: 4 },
    ]
    const result = computeGradientCells(cells, 'loom', 20, RED, BLUE, 'diagonalDR', [RED, BLUE], 0)
    expect(result['0,0']).toBe(RED) // top-left: smallest x+y
    expect(result['4,4']).toBe(BLUE) // bottom-right: largest x+y
  })

  it('diagonalDL: increases with row, decreases with column (down-left)', () => {
    const cells = [
      { row: 0, col: 4 },
      { row: 4, col: 0 },
    ]
    const result = computeGradientCells(cells, 'loom', 20, RED, BLUE, 'diagonalDL', [RED, BLUE], 0)
    expect(result['0,4']).toBe(RED) // top-right: smallest (y - x)
    expect(result['4,0']).toBe(BLUE) // bottom-left: largest (y - x)
  })

  it('stays continuous across the body/fringe boundary (brick), matching the P1 pitch fix', () => {
    // A fringe cell directly below the body should land further along the
    // gradient than the body's own last row — no snapping back to 0.
    const bodyRows = 8
    const cells = [
      { row: bodyRows - 1, col: 0 },
      { row: bodyRows, col: 0 }, // first fringe bead of the same column
      { row: bodyRows + 5, col: 0 },
    ]
    const result = computeGradientCells(cells, 'brick', bodyRows, RED, BLUE, 'vertical', [RED, GREEN, BLUE], 0)
    // Monotonic progression toward BLUE as depth increases — no reversal at the seam.
    expect(result[`${bodyRows - 1},0`]).toBe(RED)
    expect(result[`${bodyRows + 5},0`]).toBe(BLUE)
  })

  it('dithering perturbs some cells near a color-band boundary compared to no dithering', () => {
    const cells = Array.from({ length: 20 }, (_, row) => ({ row, col: 0 }))
    const flat = computeGradientCells(cells, 'loom', 20, RED, BLUE, 'vertical', [RED, GREEN, BLUE], 0)
    const dithered = computeGradientCells(cells, 'loom', 20, RED, BLUE, 'vertical', [RED, GREEN, BLUE], 0.4)
    const differsSomewhere = cells.some((c) => flat[`${c.row},0`] !== dithered[`${c.row},0`])
    expect(differsSomewhere).toBe(true)
  })

  it('returns an empty map for an empty cell list', () => {
    expect(computeGradientCells([], 'loom', 20, RED, BLUE, 'vertical', [RED, BLUE])).toEqual({})
  })

  it('handles a single cell without dividing by zero', () => {
    const result = computeGradientCells([{ row: 3, col: 3 }], 'loom', 20, RED, BLUE, 'vertical', [RED, BLUE], 0)
    expect(result['3,3']).toBe(RED) // t = 0 when span collapses to a single point
  })
})
