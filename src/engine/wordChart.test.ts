import { describe, expect, it } from 'vitest'
import type { ColorMap, FringeData } from './types'
import { buildWordChart, formatWordChartLineForDisplay } from './wordChart'

const A = 'A'
const B = 'B'
function letterForHex(hex: string): string {
  return hex === '#111111' ? A : B
}

describe('buildWordChart', () => {
  it('loom/brick: one line per row, run-length encoded left to right', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#111111',
      '0,2': '#111111',
      '0,3': '#222222',
      '1,0': '#222222',
      '1,1': '#111111',
    }
    const lines = buildWordChart('loom', 4, 2, cells, letterForHex)
    expect(lines).toEqual([
      { unitIndex: 0, text: '3A, 1B' },
      { unitIndex: 1, text: `1B, 1A, 2${'–'}` },
    ])
  })

  it('peyote: one line per column, following the boustrophedon (zigzag) thread direction', () => {
    // 2 cols x 3 rows. Column 0 reads top->bottom, column 1 bottom->top (see buildWeaveOrder).
    const cells: ColorMap = {
      '0,0': '#111111',
      '1,0': '#111111',
      '2,0': '#222222',
      '0,1': '#222222', // read last in col 1 (bottom-to-top)
      '1,1': '#222222',
      '2,1': '#111111', // read first in col 1
    }
    const lines = buildWordChart('peyote', 2, 3, cells, letterForHex)
    expect(lines).toEqual([
      { unitIndex: 0, text: '2A, 1B' },
      { unitIndex: 1, text: '1A, 2B' },
    ])
  })

  it('collapses uncolored cells into the empty-slot token instead of dropping them', () => {
    const lines = buildWordChart('loom', 3, 1, {}, letterForHex)
    expect(lines).toEqual([{ unitIndex: 0, text: '3–' }])
  })

  it('returns one line per unit even for a 1xN or Nx1 grid', () => {
    const lines = buildWordChart('loom', 1, 4, { '0,0': '#111111', '2,0': '#222222' }, letterForHex)
    expect(lines).toHaveLength(4)
    expect(lines.map((l) => l.unitIndex)).toEqual([0, 1, 2, 3])
  })
})

describe('buildWordChart with a fringe', () => {
  it('leaves body lines untouched when no fringe is given', () => {
    const cells: ColorMap = { '0,0': '#111111', '0,1': '#111111' }
    expect(buildWordChart('brick', 2, 1, cells, letterForHex)).toEqual([{ unitIndex: 0, text: '2A' }])
  })

  it('appends one fringe line per column with a fringe, after every body line', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#111111',
      // column 0 fringe: depth 0 and 1, hanging below row 1 (rows=1)
      '1,0': '#111111',
      '2,0': '#222222',
    }
    const fringe: FringeData = { lengths: [2, 0], turnBeads: [true, false] }
    const lines = buildWordChart('brick', 2, 1, cells, letterForHex, fringe)
    expect(lines).toEqual([
      { unitIndex: 0, text: '2A' },
      { unitIndex: 0, text: '1A, 1B, giro', isFringe: true },
    ])
  })

  it('skips columns with no fringe (length 0) entirely', () => {
    const fringe: FringeData = { lengths: [0, 3], turnBeads: [false, false] }
    const cells: ColorMap = { '1,1': '#111111', '2,1': '#111111', '3,1': '#222222' }
    const lines = buildWordChart('loom', 2, 1, cells, letterForHex, fringe)
    expect(lines.filter((l) => l.isFringe)).toEqual([{ unitIndex: 1, text: '2A, 1B', isFringe: true }])
  })

  it('collapses uncolored fringe beads into the empty-slot token', () => {
    const fringe: FringeData = { lengths: [1], turnBeads: [false] }
    const lines = buildWordChart('loom', 1, 1, {}, letterForHex, fringe)
    expect(lines).toEqual([
      { unitIndex: 0, text: `1${'–'}` },
      { unitIndex: 0, text: `1${'–'}`, isFringe: true },
    ])
  })

  it('omits the ", giro" suffix when the column has no turn bead', () => {
    const fringe: FringeData = { lengths: [2], turnBeads: [false] }
    const cells: ColorMap = { '1,0': '#111111', '2,0': '#111111' }
    const lines = buildWordChart('loom', 1, 1, cells, letterForHex, fringe)
    expect(lines.find((l) => l.isFringe)?.text).toBe('2A')
  })
})

describe('buildWordChart with a shaped (rowShape) body', () => {
  it('a narrower row produces a shorter line, not a padded/dropped one', () => {
    // 3-col, 2-row triangle: row 0 has 1 col (centered), row 1 is full width.
    const rowShape = [
      { offset: 1, length: 1 },
      { offset: 0, length: 3 },
    ]
    const cells: ColorMap = { '0,1': '#111111', '1,0': '#111111', '1,1': '#222222', '1,2': '#111111' }
    const lines = buildWordChart('brick', 3, 2, cells, letterForHex, undefined, rowShape)
    expect(lines).toEqual([
      { unitIndex: 0, text: '1A' },
      { unitIndex: 1, text: '1A, 1B, 1A' },
    ])
  })

  it('fringe still only appends under the columns the last (shaped) row reaches', () => {
    const rowShape = [
      { offset: 0, length: 3 },
      { offset: 1, length: 1 }, // last row tapers to the single center column
    ]
    const fringe: FringeData = { lengths: [2, 2, 2], turnBeads: [false, false, false] }
    const cells: ColorMap = { '2,1': '#111111', '3,1': '#222222' }
    const lines = buildWordChart('brick', 3, 2, cells, letterForHex, fringe, rowShape)
    const fringeLines = lines.filter((l) => l.isFringe)
    expect(fringeLines).toEqual([{ unitIndex: 1, text: '1A, 1B', isFringe: true }])
  })

  it('an omitted rowShape leaves output byte-identical to before', () => {
    const cells: ColorMap = { '0,0': '#111111', '0,1': '#222222' }
    expect(buildWordChart('loom', 2, 1, cells, letterForHex)).toEqual(
      buildWordChart('loom', 2, 1, cells, letterForHex, undefined, undefined),
    )
  })
})

describe('formatWordChartLineForDisplay', () => {
  it('inserts a multiplication sign between the run count and its letter(s)', () => {
    expect(formatWordChartLineForDisplay('3A, 2B, 1A')).toBe('3×A, 2×B, 1×A')
  })

  it('handles multi-letter tokens (palette index 26+) and the empty-slot token', () => {
    expect(formatWordChartLineForDisplay('12AB, 3–')).toBe('12×AB, 3×–')
  })

  it('passes through an empty string untouched', () => {
    expect(formatWordChartLineForDisplay('')).toBe('')
  })
})
