import { describe, expect, it } from 'vitest'
import {
  beadCount,
  cellAtPosition,
  cellPosition,
  gridBoundsUnits,
  gridFromPhysicalSizeMm,
  physicalSizeMm,
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

  it('hangs straight down (x fixed, y +1 per row) below the last body row, no compaction/offset', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const bodyRows = 16
      const lastBodyRow = cellPosition(technique, bodyRows - 1, 3)
      const fringe0 = cellPosition(technique, bodyRows, 3, bodyRows)
      const fringe1 = cellPosition(technique, bodyRows + 1, 3, bodyRows)
      expect(fringe0.x).toBe(lastBodyRow.x)
      expect(fringe0.y).toBeCloseTo(lastBodyRow.y + 1, 10)
      expect(fringe1.x).toBe(lastBodyRow.x)
      expect(fringe1.y).toBeCloseTo(lastBodyRow.y + 2, 10)
    }
  })

  it('loom fringe formula is identical to its plain unbounded formula (pitch is already 1, no offset)', () => {
    expect(cellPosition('loom', 20, 3, 16)).toEqual({ x: 3, y: 20 })
  })
})

describe('gridBoundsUnits / physicalSizeMm with a fringe', () => {
  it('extends the height by exactly maxFringeBeads whole units, width untouched', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const plain = gridBoundsUnits(technique, 6, 16)
      const withFringe = gridBoundsUnits(technique, 6, 16, 5)
      expect(withFringe.width).toBe(plain.width)
      expect(withFringe.height).toBeCloseTo(plain.height + 5, 10)
    }
  })

  it('the first fringe bead picks up exactly where the body bounds end (no gap, no overlap)', () => {
    const bodyRows = 16
    const bounds = gridBoundsUnits('brick', 6, bodyRows)
    const firstFringePos = cellPosition('brick', bodyRows, 0, bodyRows)
    expect(firstFringePos.y).toBeCloseTo(bounds.height, 10)
  })

  it('physicalSizeMm folds maxFringeBeads into the total height, in mm', () => {
    const plain = physicalSizeMm('brick', 6, 16, DELICA_W, DELICA_H)
    const withFringe = physicalSizeMm('brick', 6, 16, DELICA_W, DELICA_H, 5)
    expect(withFringe.widthMm).toBeCloseTo(plain.widthMm, 10)
    expect(withFringe.heightMm).toBeCloseTo(plain.heightMm + 5 * DELICA_H, 10)
  })

  it('defaults to no fringe when maxFringeBeads is omitted', () => {
    expect(physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H)).toEqual(
      physicalSizeMm('loom', 6, 16, DELICA_W, DELICA_H, 0),
    )
  })
})
