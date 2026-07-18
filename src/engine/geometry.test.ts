import { describe, expect, it } from 'vitest'
import {
  beadCount,
  cellAtPosition,
  cellAtPositionWithFringe,
  cellPosition,
  gridBoundsUnits,
  gridFromPhysicalSizeMm,
  physicalSizeMm,
  rowPitch,
} from './geometry'

// Miyuki Delica 11/0, the catalog default (src/data/beadTypes.ts).
const DELICA_W = 1.6
const DELICA_H = 1.3

describe('physicalSizeMm', () => {
  it('loom: a strict rectangle, rows/cols multiplied straight by bead size', () => {
    const size = physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H)
    expect(size.widthMm).toBeCloseTo(9.6, 4)
    expect(size.heightMm).toBeCloseTo(20.8, 4)
  })

  it('peyote: 16 rows of Delica comes out to ~16.4mm tall (the QA reference value)', () => {
    const size = physicalSizeMm('peyote', 6, 16, DELICA_W, DELICA_H)
    expect(size.heightMm).toBeCloseTo(16.4, 1)
  })

  it('brick: compaction is looser than peyote, so it lands taller than peyote for the same row count', () => {
    const peyote = physicalSizeMm('peyote', 6, 16, DELICA_W, DELICA_H)
    const brick = physicalSizeMm('brick', 6, 16, DELICA_W, DELICA_H)
    expect(brick.heightMm).toBeGreaterThan(peyote.heightMm)
    expect(brick.heightMm).toBeLessThan(physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H).heightMm)
  })

  it('a single row/column reduces to exactly one bead pitch, for every technique', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const size = physicalSizeMm(technique, 1, 1, DELICA_W, DELICA_H)
      expect(size.widthMm).toBeCloseTo(technique === 'brick' ? DELICA_W * 1.5 : DELICA_W, 4)
      expect(size.heightMm).toBeCloseTo(technique === 'peyote' ? DELICA_H * 1.375 : DELICA_H, 4)
    }
  })
})

describe('gridFromPhysicalSizeMm — inverse of physicalSizeMm', () => {
  it('round-trips a finished size back to (roughly) the same cols/rows for every technique', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const cols = 20
      const rows = 40
      const target = physicalSizeMm(technique, cols, rows, DELICA_W, DELICA_H)
      const back = gridFromPhysicalSizeMm(technique, target.widthMm, target.heightMm, DELICA_W, DELICA_H)
      expect(back.cols).toBe(cols)
      expect(back.rows).toBe(rows)
    }
  })
})

describe('gridBoundsUnits / beadCount', () => {
  it('loom bounds match cols x rows exactly (no offsets)', () => {
    expect(gridBoundsUnits('loom', 10, 20)).toEqual({ width: 10, height: 20 })
  })

  it('brick adds half a bead of width for the staggered row offset', () => {
    expect(gridBoundsUnits('brick', 10, 20).width).toBe(10.5)
  })

  it('bead count is cols x rows regardless of technique (±1 edge simplification is documented, not modeled)', () => {
    expect(beadCount('loom', 10, 20)).toBe(200)
    expect(beadCount('peyote', 10, 20)).toBe(200)
    expect(beadCount('brick', 10, 20)).toBe(200)
  })

  it('with a rowShape, sums each row\'s own length instead of assuming full width', () => {
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ]
    expect(beadCount('brick', 5, 3, rowShape)).toBe(1 + 3 + 5)
  })

  it('a rowShape entry missing for a row falls back to cols (defensive)', () => {
    expect(beadCount('brick', 5, 2, [{ offset: 2, length: 1 }])).toBe(1 + 5)
  })
})

describe('cellPosition / cellAtPosition — inverse hit-testing', () => {
  it('recovers the same cell for every technique across a small grid', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          const pos = cellPosition(technique, row, col)
          // Sample the middle of the cell's unit-square footprint, not its exact corner.
          const hit = cellAtPosition(technique, pos.x + 0.4, pos.y + 0.4)
          expect(hit).toEqual({ row, col })
        }
      }
    }
  })
})

describe('cellPosition with a fringe zone', () => {
  it('matches the plain body formula when bodyRows is omitted or the row is still in the body', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      expect(cellPosition(technique, 3, 2, 16)).toEqual(cellPosition(technique, 3, 2))
    }
  })

  it('continues straight down (x fixed, y +pitch per row) below the last body row — same pitch as the body, no row-parity offset', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const bodyRows = 16
      const pitch = rowPitch(technique)
      const lastBodyRow = cellPosition(technique, bodyRows - 1, 3)
      const fringe0 = cellPosition(technique, bodyRows, 3, bodyRows)
      const fringe1 = cellPosition(technique, bodyRows + 1, 3, bodyRows)
      expect(fringe0.x).toBe(lastBodyRow.x)
      expect(fringe0.y).toBeCloseTo(lastBodyRow.y + pitch, 10)
      expect(fringe1.x).toBe(lastBodyRow.x)
      expect(fringe1.y).toBeCloseTo(lastBodyRow.y + 2 * pitch, 10)
    }
  })

  it('loom fringe formula is identical to its plain unbounded formula (pitch is already 1, no offset)', () => {
    expect(cellPosition('loom', 20, 3, 16)).toEqual({ x: 3, y: 20 })
  })
})

describe('cellAtPositionWithFringe', () => {
  it('matches plain cellAtPosition above the body/fringe boundary, for every technique', () => {
    for (const technique of ['loom', 'brick'] as const) {
      const bodyRows = 16
      for (let row = 0; row < bodyRows; row++) {
        for (let col = 0; col < 4; col++) {
          const pos = cellPosition(technique, row, col)
          const hit = cellAtPositionWithFringe(technique, bodyRows, pos.x + 0.4, pos.y + 0.4)
          expect(hit).toEqual({ row, col })
        }
      }
    }
  })

  it('recovers the right (row, col) for a click landing in the fringe zone', () => {
    for (const technique of ['loom', 'brick'] as const) {
      const bodyRows = 16
      for (let col = 0; col < 4; col++) {
        for (let depth = 0; depth < 5; depth++) {
          const row = bodyRows + depth
          const pos = cellPosition(technique, row, col, bodyRows)
          const hit = cellAtPositionWithFringe(technique, bodyRows, pos.x + 0.4, pos.y + 0.4)
          expect(hit).toEqual({ row, col })
        }
      }
    }
  })
})

describe('gridBoundsUnits / physicalSizeMm with a fringe', () => {
  it('extends the height by maxFringeBeads rows at the technique\'s own row pitch (same vertical step as the body)', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const plain = gridBoundsUnits(technique, 6, 16)
      const withFringe = gridBoundsUnits(technique, 6, 16, 5)
      expect(withFringe.width).toBe(plain.width)
      expect(withFringe.height).toBeCloseTo(plain.height + 5 * rowPitch(technique), 10)
    }
  })

  it('fringe rows interlock with the body\'s last row exactly like consecutive body rows interlock with each other', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const bodyRows = 16
      const pitch = rowPitch(technique)
      const lastBodyRow = cellPosition(technique, bodyRows - 1, 0)
      const secondToLastBodyRow = cellPosition(technique, bodyRows - 2, 0)
      const firstFringe = cellPosition(technique, bodyRows, 0, bodyRows)
      // The step from the last body row to the first fringe row is identical
      // to the step between any two consecutive body rows — no kink at the
      // boundary.
      expect(firstFringe.y - lastBodyRow.y).toBeCloseTo(lastBodyRow.y - secondToLastBodyRow.y, 10)
      expect(firstFringe.y - lastBodyRow.y).toBeCloseTo(pitch, 10)
    }
  })

  it('physicalSizeMm folds maxFringeBeads into the total height, in mm, at the technique\'s row pitch', () => {
    const plain = physicalSizeMm('brick', 6, 16, DELICA_W, DELICA_H)
    const withFringe = physicalSizeMm('brick', 6, 16, DELICA_W, DELICA_H, 5)
    expect(withFringe.widthMm).toBeCloseTo(plain.widthMm, 10)
    expect(withFringe.heightMm).toBeCloseTo(plain.heightMm + 5 * rowPitch('brick') * DELICA_H, 10)
  })

  it('defaults to no fringe when maxFringeBeads is omitted', () => {
    expect(physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H)).toEqual(
      physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H, 0),
    )
  })
})
