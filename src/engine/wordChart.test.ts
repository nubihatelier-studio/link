import { describe, expect, it } from 'vitest'
import type { ColorMap } from './types'
import { buildWordChart } from './wordChart'

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
