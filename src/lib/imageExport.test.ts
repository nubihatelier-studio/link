import { describe, expect, it } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import type { ColorMap, FringeData } from '@/engine/types'
import { computeExportCellPx, renderPatternCanvas } from './imageExport'

const bead = getBeadType('miyuki-delica-11')

describe('computeExportCellPx', () => {
  it('sizes the cell so the longer side lands near the target', () => {
    // 10 units wide, 20 tall -> longer side is 20 -> cellPx = 400/20 = 20.
    expect(computeExportCellPx(10, 20, 400)).toBeCloseTo(20, 5)
  })

  it('clamps to the minimum for a huge pattern', () => {
    expect(computeExportCellPx(500, 500, 400)).toBe(10)
  })

  it('clamps to the maximum for a tiny pattern', () => {
    expect(computeExportCellPx(2, 2, 400)).toBe(64)
  })

  it('never divides by zero for a degenerate (0-unit) bounds', () => {
    expect(Number.isFinite(computeExportCellPx(0, 0, 400))).toBe(true)
  })
})

describe('renderPatternCanvas', () => {
  // jsdom has no real canvas 2D context (getContext('2d') returns null), so only the
  // sizing math is verifiable here — actual pixel output is checked by hand in-browser,
  // same convention as CanvasGrid/WeaveCanvas/PatternThumb (none of which have unit tests).
  function fillCells(cols: number, rows: number): ColorMap {
    const cells: ColorMap = {}
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[`${r},${c}`] = '#c9a227'
    return cells
  }

  it('does not throw and returns a canvas sized from the body bounds', () => {
    const canvas = renderPatternCanvas(
      { name: 'x', technique: 'loom', cols: 6, rows: 6, cells: fillCells(6, 6), beadType: bead },
      '#ffffff',
      400,
    )
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  it('grows the canvas height when a fringe is given', () => {
    const cells = fillCells(6, 6)
    const withoutFringe = renderPatternCanvas({ name: 'x', technique: 'brick', cols: 6, rows: 6, cells, beadType: bead }, '#fff', 400)
    const fringe: FringeData = { lengths: [8, 8, 8, 8, 8, 8], turnBeads: [true, true, true, true, true, true] }
    const withFringe = renderPatternCanvas(
      { name: 'x', technique: 'brick', cols: 6, rows: 6, cells, fringe, beadType: bead },
      '#fff',
      400,
    )
    expect(withFringe.height).toBeGreaterThan(withoutFringe.height)
  })

  it('does not throw for an empty (uncolored) pattern', () => {
    expect(() =>
      renderPatternCanvas({ name: 'x', technique: 'peyote', cols: 4, rows: 4, cells: {}, beadType: bead }, '#fff', 400),
    ).not.toThrow()
  })
})
