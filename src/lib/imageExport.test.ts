import { describe, expect, it } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import type { ColorMap, FringeData } from '@/engine/types'
import {
  composeInstagramCard,
  computeExportCellPx,
  INSTAGRAM_CARD_HEIGHT,
  INSTAGRAM_CARD_WIDTH,
  renderPatternCanvas,
} from './imageExport'

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

  it('does not throw with a shaped (rowShape) body, with or without a fringe under its narrow last row', () => {
    // Triangle: row 0 has 1 col (centered), row 1 (last) is full width.
    const rowShape = [
      { offset: 1, length: 1 },
      { offset: 0, length: 3 },
    ]
    const cells = fillCells(3, 2)
    expect(() =>
      renderPatternCanvas({ name: 'x', technique: 'brick', cols: 3, rows: 2, cells, rowShape, beadType: bead }, '#fff', 400),
    ).not.toThrow()

    const fringe: FringeData = { lengths: [2, 2, 2], turnBeads: [true, true, true] }
    expect(() =>
      renderPatternCanvas(
        { name: 'x', technique: 'brick', cols: 3, rows: 2, cells, rowShape, fringe, beadType: bead },
        '#fff',
        400,
      ),
    ).not.toThrow()
  })
})

describe('composeInstagramCard', () => {
  // jsdom neither loads nor errors real <img> fetches, so the logo-load branch
  // times out (LOGO_LOAD_TIMEOUT_MS) and is caught — same "no real canvas /
  // network" limitation as renderPatternCanvas above; only shape is checked here.
  it('always returns a fixed-size 4:5 card, with or without a fringe', async () => {
    const cells: ColorMap = { '0,0': '#c9a227', '1,1': '#2f5b66' }
    const card = await composeInstagramCard({ name: 'Pulsera', technique: 'brick', cols: 10, rows: 10, cells, beadType: bead })
    expect(card.width).toBe(INSTAGRAM_CARD_WIDTH)
    expect(card.height).toBe(INSTAGRAM_CARD_HEIGHT)

    const fringe: FringeData = { lengths: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], turnBeads: [] }
    const cardWithFringe = await composeInstagramCard({
      name: 'Aro con flecos',
      technique: 'brick',
      cols: 10,
      rows: 10,
      cells,
      fringe,
      beadType: bead,
    })
    expect(cardWithFringe.width).toBe(INSTAGRAM_CARD_WIDTH)
    expect(cardWithFringe.height).toBe(INSTAGRAM_CARD_HEIGHT)
  }, 10000)

  it('does not throw for an empty (uncolored) pattern', async () => {
    await expect(
      composeInstagramCard({ name: 'Vacío', technique: 'loom', cols: 8, rows: 8, cells: {}, beadType: bead }),
    ).resolves.toBeInstanceOf(HTMLCanvasElement)
  }, 10000)
})
