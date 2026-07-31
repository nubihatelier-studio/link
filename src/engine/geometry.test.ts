import { describe, expect, it } from 'vitest'
import {
  beadCenterX,
  beadCount,
  BRICK_ROW_COMPACTION,
  cellAtPosition,
  cellAtPositionWithFringe,
  cellPosition,
  fringeAnchorX,
  gridBoundsUnits,
  gridFromPhysicalSizeMm,
  loopAnchorX,
  physicalSizeMm,
  rowPitch,
} from './geometry'
import { createShapedRowShape } from './shape'
import { isPaintableCell } from './fringe'
import { loopHeightUnits } from './loop'
import { getBeadType } from '@/data/beadTypes'
import { CALIBRATION_SAMPLE, weaveThreadFactor } from './calibration'

// Real catalog entries (src/data/beadTypes.ts) — physicalSizeMm keys its
// thread/tension calibration off the bead's `id`, so these must be the actual
// defs, not loose numbers.
const DELICA = getBeadType('miyuki-delica-11')
const ROCALLA = getBeadType('rocalla-11')
const DELICA_W = DELICA.widthMm // 1.6 — the bead's diameter / long side
const DELICA_H = DELICA.heightMm // 1.3 — its short side

/**
 * The whole point of the calibration work: a bracelet the weaver actually
 * wove and measured with a ruler. Any change to the axis mapping, the row
 * pitch or the thread factor has to keep landing on these numbers.
 */
describe('physicalSizeMm — calibrated against the real measured piece (Tarea 2)', () => {
  const { technique, beadTypeId, cols, rows, measuredWidthMm, measuredHeightMm } = CALIBRATION_SAMPLE
  const bead = getBeadType(beadTypeId)
  const TOLERANCE = 0.03

  it(`${'peyote'} · Delica 11/0 · 6 × 60 lands within ±3% of the measured 8.0 × 102 mm`, () => {
    const size = physicalSizeMm(technique, cols, rows, bead)
    const widthError = Math.abs(size.widthMm - measuredWidthMm) / measuredWidthMm
    const heightError = Math.abs(size.heightMm - measuredHeightMm) / measuredHeightMm
    expect(widthError, `ancho ${size.widthMm.toFixed(2)}mm vs ${measuredWidthMm}mm`).toBeLessThanOrEqual(TOLERANCE)
    expect(heightError, `largo ${size.heightMm.toFixed(2)}mm vs ${measuredHeightMm}mm`).toBeLessThanOrEqual(TOLERANCE)
  })

  it('the length is calibrated exactly, not just within tolerance — that is what the factor is for', () => {
    expect(physicalSizeMm(technique, cols, rows, bead).heightMm).toBeCloseTo(measuredHeightMm, 6)
  })

  it('the width is left uncorrected on purpose: bare beads, 2.5% under, inside measuring error', () => {
    // No width factor exists — across a row beads sit hole-to-hole, touching.
    expect(physicalSizeMm(technique, cols, rows, bead).widthMm).toBeCloseTo(cols * bead.heightMm, 6)
  })
})

describe('physicalSizeMm', () => {
  it('loom: rows/cols multiplied straight by bead size (width→horizontal, height→vertical — unaffected by the peyote fix)', () => {
    const size = physicalSizeMm('loom', 6, 16, DELICA)
    expect(size.widthMm).toBeCloseTo(9.6, 4)
    expect(size.heightMm).toBeCloseTo(20.8, 4)
  })

  it('peyote: axes are swapped vs. loom — a column uses the bead\'s short side, a row uses its diameter (Corrección 1)', () => {
    const size = physicalSizeMm('peyote', 6, 16, DELICA)
    // Width uses the SHORT side (DELICA_H, 1.3mm) per column, not the diameter.
    expect(size.widthMm).toBeCloseTo(6 * DELICA_H, 4)
    // Height uses the diameter (DELICA_W, 1.6mm) per row, with NO extra
    // compaction — PEYOTE_ROW_COMPACTION stays a render-only concern now
    // (see `physicalRowPitch`'s doc comment) — times the measured
    // thread/tension correction for this exact bead (Tarea 2).
    expect(size.heightMm).toBeCloseTo(16 * DELICA_W * weaveThreadFactor('peyote', DELICA.id), 4)
  })

  it('brick: unaffected by the peyote fix — same axis mapping and compaction as before', () => {
    const brick = physicalSizeMm('brick', 6, 16, DELICA)
    expect(brick.widthMm).toBeCloseTo(6 * DELICA_W, 4)
    expect(brick.heightMm).toBeCloseTo(16 * BRICK_ROW_COMPACTION * DELICA_H, 4)
  })

  it('a single row/column reduces to exactly one bead pitch on the relevant axis, for every technique', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const size = physicalSizeMm(technique, 1, 1, DELICA)
      const expectedWidth = technique === 'peyote' ? DELICA_H : DELICA_W
      const bareHeight =
        technique === 'peyote' ? DELICA_W : technique === 'brick' ? BRICK_ROW_COMPACTION * DELICA_H : DELICA_H
      const expectedHeight = bareHeight * weaveThreadFactor(technique, DELICA.id)
      expect(size.widthMm).toBeCloseTo(expectedWidth, 4)
      expect(size.heightMm).toBeCloseTo(expectedHeight, 4)
    }
  })

  it('width scales linearly with cols, height linearly with rows — no cross terms', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const a = physicalSizeMm(technique, 6, 16, DELICA)
      const doubleCols = physicalSizeMm(technique, 12, 16, DELICA)
      const doubleRows = physicalSizeMm(technique, 6, 32, DELICA)
      expect(doubleCols.widthMm).toBeCloseTo(a.widthMm * 2, 4)
      expect(doubleCols.heightMm).toBeCloseTo(a.heightMm, 4)
      expect(doubleRows.heightMm).toBeCloseTo(a.heightMm * 2, 4)
      expect(doubleRows.widthMm).toBeCloseTo(a.widthMm, 4)
    }
  })

  it('a woven loop adds its own height on top of body+fringe (Tarea 3)', () => {
    const withoutLoop = physicalSizeMm('brick', 6, 16, DELICA)
    const withLoop = physicalSizeMm('brick', 6, 16, DELICA, 0, 8)
    const verticalMm = DELICA_H // brick's vertical axis
    expect(withLoop.heightMm).toBeCloseTo(withoutLoop.heightMm + loopHeightUnits(8) * verticalMm, 6)
    expect(withLoop.widthMm).toBeCloseTo(withoutLoop.widthMm, 6) // loop never affects width
  })

  it('a loop with 0 beads (metal loop, or none at all) adds nothing', () => {
    const withoutLoop = physicalSizeMm('brick', 6, 16, DELICA)
    const withZeroLoop = physicalSizeMm('brick', 6, 16, DELICA, 0, 0)
    expect(withZeroLoop).toEqual(withoutLoop)
  })
})

describe('loopAnchorX', () => {
  it('for a plain rectangle (no rowShape), anchors at the horizontal center of the whole row', () => {
    // 6 columns 0..5, center of column indices 0 and 5's cell spans.
    const x = loopAnchorX('loom', 6, undefined)
    expect(x).toBeCloseTo((beadCenterX('loom', 0, 0) + beadCenterX('loom', 0, 5) + 1) / 2, 10)
  })

  it('for a shaped top row (e.g. a triangle\'s narrow tip), anchors at that row\'s own center, not the full grid width', () => {
    // A 7-wide triangle's row 0 is a single bead — created via the real shape generator.
    const rowShape = createShapedRowShape('triangle', 7, 7)
    expect(rowShape[0]).toEqual({ offset: 3, length: 1 })
    const x = loopAnchorX('brick', 7, rowShape)
    expect(x).toBeCloseTo(beadCenterX('brick', 0, 3) + 0.5, 10)
  })
})

describe('gridFromPhysicalSizeMm — inverse of physicalSizeMm', () => {
  it('round-trips a finished size back to the same cols/rows for every technique AND bead type', () => {
    for (const bead of [DELICA, ROCALLA]) {
      for (const technique of ['loom', 'peyote', 'brick'] as const) {
        const cols = 20
        const rows = 40
        const target = physicalSizeMm(technique, cols, rows, bead)
        const back = gridFromPhysicalSizeMm(technique, target.widthMm, target.heightMm, bead)
        expect(back.cols, `${technique} · ${bead.id} cols`).toBe(cols)
        expect(back.rows, `${technique} · ${bead.id} rows`).toBe(rows)
      }
    }
  })

  it('asking for the reference bracelet\'s real length gives back its real row count (Tarea 2)', () => {
    const { technique, beadTypeId, cols, rows, measuredWidthMm, measuredHeightMm } = CALIBRATION_SAMPLE
    const bead = getBeadType(beadTypeId)
    const back = gridFromPhysicalSizeMm(technique, measuredWidthMm, measuredHeightMm, bead)
    expect(back.rows).toBe(rows)
    expect(back.cols).toBe(cols)
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

describe('cellPosition/cellAtPosition/beadCenterX/fringeAnchorX/cellAtPositionWithFringe — staggerPhase (Ronda I)', () => {
  it('defaults to phase 0 everywhere, reproducing the exact pre-Ronda-I behavior when the argument is omitted (legacy-pattern migration guarantee)', () => {
    expect(cellPosition('brick', 3, 2)).toEqual(cellPosition('brick', 3, 2, undefined, 0))
    expect(beadCenterX('brick', 3, 2)).toBe(beadCenterX('brick', 3, 2, 0))
    expect(fringeAnchorX('brick', 2, 5)).toBe(fringeAnchorX('brick', 2, 5, 0))
    expect(cellAtPosition('brick', 2.4, 3.1)).toEqual(cellAtPosition('brick', 2.4, 3.1, 0))
    expect(cellAtPositionWithFringe('brick', 5, 2.4, 3.1)).toEqual(cellAtPositionWithFringe('brick', 5, 2.4, 3.1, 0))
  })

  it('phase 1 shifts brick\'s stagger check by one — a row that was flush (even) at phase 0 is staggered (odd) at phase 1, and vice versa', () => {
    // row 0 is even (flush) at phase 0, odd (staggered +0.5) at phase 1.
    expect(cellPosition('brick', 0, 4).x).toBe(4)
    expect(cellPosition('brick', 0, 4, undefined, 1).x).toBe(4.5)
    // row 1 is odd (staggered) at phase 0, even (flush) at phase 1.
    expect(cellPosition('brick', 1, 4).x).toBe(4.5)
    expect(cellPosition('brick', 1, 4, undefined, 1).x).toBe(4)
  })

  it('loom and peyote never gain a phase-dependent x — only brick has a row-parity stagger', () => {
    expect(cellPosition('loom', 1, 4, undefined, 1)).toEqual(cellPosition('loom', 1, 4, undefined, 0))
    expect(cellPosition('peyote', 1, 4, undefined, 1)).toEqual(cellPosition('peyote', 1, 4, undefined, 0))
  })

  it('cellAtPosition (the inverse) resolves the same physical point back to the same cell under a non-default phase, for every technique', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          const pos = cellPosition(technique, row, col, undefined, 1)
          const hit = cellAtPosition(technique, pos.x + 0.4, pos.y + 0.4, 1)
          expect(hit).toEqual({ row, col })
        }
      }
    }
  })

  it('fringeAnchorX/cellAtPositionWithFringe read the same phase as cellPosition, so a fringe column\'s hang point and its hit-test agree under phase 1', () => {
    const bodyRows = 6
    const anchor = fringeAnchorX('brick', 2, bodyRows, 1)
    expect(anchor).toBe(beadCenterX('brick', bodyRows - 1, 2, 1))
    const fringePos = cellPosition('brick', bodyRows, 2, bodyRows, 1)
    const hit = cellAtPositionWithFringe('brick', bodyRows, fringePos.x + 0.4, fringePos.y + 0.1, 1)
    expect(hit).toEqual({ row: bodyRows, col: 2 })
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

  it('physicalSizeMm folds maxFringeBeads into the total height at the same per-row step as the body', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const plain = physicalSizeMm(technique, 6, 16, DELICA)
      const withFringe = physicalSizeMm(technique, 6, 16, DELICA, 5)
      expect(withFringe.widthMm).toBeCloseTo(plain.widthMm, 10)
      // Derive the per-row step from the body itself (16 rows vs 17 rows)
      // rather than restating the formula — that way this stays honest about
      // "the same step" even if the pitch or the thread factor changes, and
      // it can't accidentally assert against `rowPitch` (the RENDER pitch),
      // which is a different constant that only coincides for brick.
      const oneMoreRow = physicalSizeMm(technique, 6, 17, DELICA)
      const bodyRowMm = oneMoreRow.heightMm - plain.heightMm
      expect(withFringe.heightMm).toBeCloseTo(plain.heightMm + 5 * bodyRowMm, 10)
    }
  })

  it('defaults to no fringe when maxFringeBeads is omitted', () => {
    expect(physicalSizeMm('loom', 6, 16, DELICA)).toEqual(
      physicalSizeMm('loom', 6, 16, DELICA, 0),
    )
  })
})

describe('fringeAnchorX — single source of truth for where a column\'s fringe hangs from', () => {
  it('brick 8x6 (QA regression case, "Aro de muestra"): matches beadCenterX at the last row for all 8 columns', () => {
    const bodyRows = 6
    const lastRow = bodyRows - 1 // row 5 — odd, so brick's row offset applies
    for (let col = 0; col < 8; col++) {
      expect(fringeAnchorX('brick', col, bodyRows)).toBe(beadCenterX('brick', lastRow, col))
    }
  })

  it('brick: every column follows the exact same additive offset — no column can drift on its own', () => {
    const bodyRows = 6
    const anchors = Array.from({ length: 8 }, (_, col) => fringeAnchorX('brick', col, bodyRows))
    // col + offset: consecutive columns must differ by exactly 1, and the very
    // first column's fractional part IS the shared offset every other column
    // must also carry — this is what the "one strip anchored at x=56, the
    // rest at x=88" regression would have violated.
    const offset = anchors[0] - 0
    for (let col = 0; col < 8; col++) {
      expect(anchors[col]).toBeCloseTo(col + offset, 10)
    }
  })

  it('brick: an odd last row (row index 5) carries the classic 0.5 stagger', () => {
    expect(fringeAnchorX('brick', 0, 6)).toBeCloseTo(0.5, 10)
    expect(fringeAnchorX('brick', 3, 6)).toBeCloseTo(3.5, 10)
  })

  it('brick: an even last row carries no stagger', () => {
    expect(fringeAnchorX('brick', 0, 5)).toBeCloseTo(0, 10) // last row index 4, even
  })

  it('loom: no offset regardless of bodyRows parity', () => {
    expect(fringeAnchorX('loom', 3, 6)).toBe(3)
    expect(fringeAnchorX('loom', 3, 5)).toBe(3)
  })

  it('cellPosition\'s fringe branch uses fringeAnchorX for every depth — the anchor never drifts as a strand hangs lower', () => {
    const bodyRows = 6
    for (let col = 0; col < 8; col++) {
      const anchor = fringeAnchorX('brick', col, bodyRows)
      for (let depth = 0; depth < 5; depth++) {
        expect(cellPosition('brick', bodyRows + depth, col, bodyRows).x).toBe(anchor)
      }
    }
  })

  it('cellAtPositionWithFringe inverts a fringe click back to the exact column cellPosition drew it at', () => {
    const bodyRows = 6
    for (let col = 0; col < 8; col++) {
      for (let depth = 0; depth < 3; depth++) {
        const row = bodyRows + depth
        const pos = cellPosition('brick', row, col, bodyRows)
        const hit = cellAtPositionWithFringe('brick', bodyRows, pos.x + 0.4, pos.y + 0.4)
        expect(hit).toEqual({ row, col })
      }
    }
  })

  it('shaped body (rhombus): the fringe anchor is still the column\'s own coordinate in the last row — shape only gates existence, never the coordinate formula', () => {
    // 12x10 rhombus tapers its last row down to a single column (the point) —
    // this is exactly the "Aro con flecos" template's body.
    const cols = 12
    const bodyRows = 10
    const rowShape = createShapedRowShape('rhombus', cols, bodyRows)
    const lastRow = rowShape[bodyRows - 1]
    expect(lastRow).toEqual({ offset: 5, length: 1 }) // the rhombus's narrow point: only column 5

    // The anchor formula doesn't need to know about rowShape at all — a
    // column's coordinate is the same whether or not that row is shaped.
    expect(fringeAnchorX('brick', 5, bodyRows)).toBe(beadCenterX('brick', bodyRows - 1, 5))

    // isPaintableCell (the actual existence gate) confirms only column 5 can
    // carry a fringe here — every other column has no bead in the last row
    // to hang from, shaped or not.
    const fringe = { lengths: Array.from({ length: cols }, () => 3), turnBeads: Array.from({ length: cols }, () => false) }
    for (let col = 0; col < cols; col++) {
      const hasFringe = isPaintableCell(bodyRows, col, cols, bodyRows, fringe, rowShape)
      expect(hasFringe).toBe(col === lastRow.offset)
    }

    // For the one column that does have fringe, its anchor and the actual
    // fringe cell's rendered x agree exactly — no seam at the rhombus's point.
    const anchor = fringeAnchorX('brick', lastRow.offset, bodyRows)
    const firstFringeCell = cellPosition('brick', bodyRows, lastRow.offset, bodyRows)
    expect(firstFringeCell.x).toBe(anchor)
  })
})
