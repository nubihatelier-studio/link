import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { rowPitch } from './geometry'
import {
  buildWeaveOrder,
  directionAtStep,
  firstIndexOfNextFringeColumn,
  firstIndexOfUnit,
  isFringeStep,
  jumpTargetToIndex,
  unitIndexOf,
  weaveUnit,
} from './weaveOrder'

describe('buildWeaveOrder', () => {
  it('loom: row-major, left to right, same direction every row', () => {
    const order = buildWeaveOrder('loom', 3, 2)
    expect(order).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
  })

  it('brick: row-major, left to right, same direction every row', () => {
    const order = buildWeaveOrder('brick', 3, 2)
    expect(order).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
  })

  it('peyote: column-major, alternating top-to-bottom / bottom-to-top per column (boustrophedon)', () => {
    const order = buildWeaveOrder('peyote', 2, 3)
    expect(order).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 1, col: 1 },
      { row: 0, col: 1 },
    ])
  })

  it('visits every cell exactly once for all three techniques', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const cols = 5
      const rows = 7
      const order = buildWeaveOrder(technique, cols, rows)
      expect(order).toHaveLength(cols * rows)
      const seen = new Set(order.map((c) => `${c.row},${c.col}`))
      expect(seen.size).toBe(cols * rows)
    }
  })
})

describe('weaveUnit / unitIndexOf — the QA regression (6x50 peyote showing "Fila 3" after 3 beads)', () => {
  it('peyote progress is counted by column, not grid row', () => {
    expect(weaveUnit('peyote')).toBe('column')

    const order = buildWeaveOrder('peyote', 6, 50)
    // Pressing "Siguiente" 3 times moves currentIndex from -1 to 2 (0-indexed).
    const afterThreePresses = order[2]
    expect(afterThreePresses).toEqual({ row: 2, col: 0 })
    // The bug: labeling this with the grid row claimed "Fila 3" on a 6-wide
    // pattern. The fix: label with the actual weave unit (column here) —
    // three beads into a 50-tall first thread is still "Columna 1".
    expect(unitIndexOf('peyote', afterThreePresses)).toBe(0)

    // Only once the thread reaches the top of the pattern does it move on.
    const firstOfSecondColumn = order[50]
    expect(unitIndexOf('peyote', firstOfSecondColumn)).toBe(1)
  })

  it('loom and brick progress is counted by grid row, matching how they are actually worked', () => {
    expect(weaveUnit('loom')).toBe('row')
    expect(weaveUnit('brick')).toBe('row')

    const order = buildWeaveOrder('loom', 6, 50)
    const afterThreePresses = order[2]
    expect(unitIndexOf('loom', afterThreePresses)).toBe(0) // 3 beads into a 6-wide row: still row 1
    const firstOfSecondRow = order[6]
    expect(unitIndexOf('loom', firstOfSecondRow)).toBe(1)
  })
})

describe('buildWeaveOrder with a fringe', () => {
  it('leaves the body-only call (no fringe arg) byte-identical to before', () => {
    expect(buildWeaveOrder('brick', 3, 2)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
  })

  it('appends fringe beads after the whole body, column by column, nearest-to-body first, turn bead last', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [true, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // 2 rows x 3 cols body = 6 steps, then column 0 (2 beads), column 1 (none), column 2 (1 bead).
    expect(order).toHaveLength(6 + 2 + 0 + 1)
    expect(order.slice(6)).toEqual([
      { row: 2, col: 0, isFringe: true, isTurnBead: false },
      { row: 3, col: 0, isFringe: true, isTurnBead: true },
      { row: 2, col: 2, isFringe: true, isTurnBead: false },
    ])
  })

  it('a column with no fringe (length 0) contributes no steps', () => {
    const fringe: FringeData = { lengths: [0, 0], turnBeads: [false, false] }
    const order = buildWeaveOrder('loom', 2, 2, fringe)
    expect(order).toHaveLength(4)
  })

  it('isFringeStep discriminates body cells from fringe beads', () => {
    const fringe: FringeData = { lengths: [1], turnBeads: [false] }
    const order = buildWeaveOrder('loom', 1, 2, fringe)
    expect(order.map(isFringeStep)).toEqual([false, false, true])
  })
})

describe('buildWeaveOrder with a shaped (rowShape) body', () => {
  // A 5-col, 3-row triangle: row 0 has 1 col centered, row 1 has 3, row 2 (the last, full-width) has 5.
  const rowShape = [
    { offset: 2, length: 1 },
    { offset: 1, length: 3 },
    { offset: 0, length: 5 },
  ]

  it('each row is still walked left to right, just narrowed to its own offset/length', () => {
    const order = buildWeaveOrder('brick', 5, 3, undefined, rowShape)
    expect(order).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ])
  })

  it('visits exactly the cells the shape says exist — 1 + 3 + 5, not 5 x 3', () => {
    const order = buildWeaveOrder('brick', 5, 3, undefined, rowShape)
    expect(order).toHaveLength(1 + 3 + 5)
  })

  it('an omitted rowShape (undefined) is byte-identical to the old full-rectangle traversal', () => {
    expect(buildWeaveOrder('brick', 5, 3)).toEqual(buildWeaveOrder('brick', 5, 3, undefined, undefined))
  })

  it('a fringe strand is only appended under a column the LAST row (the shape\'s own span) reaches', () => {
    const fringe: FringeData = { lengths: [3, 3, 3, 3, 3], turnBeads: [false, false, false, false, false] }
    // Last row here is full width (offset 0, length 5), so fringe applies to every column, same as no shape.
    const order = buildWeaveOrder('brick', 5, 3, fringe, rowShape)
    expect(order).toHaveLength(1 + 3 + 5 + 3 * 5)
  })

  it('fringe under a column outside the last row\'s span is dropped even if fringe.lengths says otherwise', () => {
    const narrowLastRow = [
      { offset: 0, length: 5 },
      { offset: 0, length: 5 },
      { offset: 2, length: 1 }, // last row tapers to a single center column
    ]
    const fringe: FringeData = { lengths: [3, 3, 3, 3, 3], turnBeads: [false, false, false, false, false] }
    const order = buildWeaveOrder('brick', 5, 3, fringe, narrowLastRow)
    const fringeSteps = order.filter(isFringeStep)
    expect(fringeSteps).toHaveLength(3) // only column 2's fringe, not all 5 columns'
    expect(fringeSteps.every((s) => s.col === 2)).toBe(true)
  })

  it('peyote ignores rowShape (not shape-capable) — same output with or without one', () => {
    expect(buildWeaveOrder('peyote', 5, 3, undefined, rowShape)).toEqual(buildWeaveOrder('peyote', 5, 3))
  })
})

describe('directionAtStep with a fringe', () => {
  it('points straight down between two beads of the same fringe column, at the same pitch as between body rows (no kink at the boundary)', () => {
    const fringe: FringeData = { lengths: [3], turnBeads: [false] }
    const order = buildWeaveOrder('brick', 1, 2, fringe)
    // order: [body 0,0], [body 1,0], [fringe depth0], [fringe depth1], [fringe depth2]
    const direction = directionAtStep('brick', order, 2, 2)
    expect(direction?.dx).toBe(0)
    expect(direction?.dy).toBeCloseTo(rowPitch('brick'), 10)
  })

  it('matches the plain (no bodyRows) call when both steps are in the body', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    expect(directionAtStep('brick', order, 1, 3)).toEqual(directionAtStep('brick', order, 1))
  })
})

describe('directionAtStep with staggerPhase (Corrección 3, Ronda I)', () => {
  it('defaults to phase 0, matching the pre-Ronda-I behavior exactly when omitted', () => {
    const order = buildWeaveOrder('brick', 4, 3)
    expect(directionAtStep('brick', order, 1, 3)).toEqual(directionAtStep('brick', order, 1, 3, 0))
  })

  it('shifts the horizontal component of a row-to-row step by exactly half a bead when staggerPhase flips — the "next bead" arrow must read the same physical stagger the canvas actually drew', () => {
    const order = buildWeaveOrder('brick', 4, 3)
    // Step from row 0's last cell to row 1's first cell — which row lands on
    // the "odd" (staggered) parity depends on staggerPhase, so the dx
    // differs by exactly the 0.5-bead stagger between the two phases.
    const dxPhase0 = directionAtStep('brick', order, 3, 3, 0)!.dx
    const dxPhase1 = directionAtStep('brick', order, 3, 3, 1)!.dx
    expect(Math.abs(dxPhase1 - dxPhase0)).toBeCloseTo(1, 10)
  })
})

describe('firstIndexOfNextFringeColumn', () => {
  it('finds the first fringe step of the next column that actually has a fringe', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // col 0's fringe starts at index 6, col 2's (col 1 has none) starts at index 8.
    expect(firstIndexOfNextFringeColumn(order, 0)).toBe(8)
  })

  it('returns -1 past the last fringe column', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    expect(firstIndexOfNextFringeColumn(order, 2)).toBe(-1)
  })

  it('returns -1 when there is no fringe at all', () => {
    const order = buildWeaveOrder('brick', 3, 2)
    expect(firstIndexOfNextFringeColumn(order, 0)).toBe(-1)
  })
})

describe('firstIndexOfUnit', () => {
  it('finds the first traversal index for a given row (loom/brick)', () => {
    const order = buildWeaveOrder('loom', 4, 4)
    expect(firstIndexOfUnit('loom', order, 0)).toBe(0)
    expect(firstIndexOfUnit('loom', order, 2)).toBe(8)
    expect(firstIndexOfUnit('loom', order, 99)).toBe(-1)
  })

  it('finds the first traversal index for a given column (peyote)', () => {
    const order = buildWeaveOrder('peyote', 4, 4)
    expect(firstIndexOfUnit('peyote', order, 0)).toBe(0)
    expect(firstIndexOfUnit('peyote', order, 1)).toBe(4)
    expect(firstIndexOfUnit('peyote', order, 2)).toBe(8)
  })
})

describe('jumpTargetToIndex — mapeo del selector "Ir a" a índice de bead', () => {
  // The QA repro pattern: 8x6 brick with fringe lengths 1,2,4,5,5,4,2,1 (72 beads total).
  const fringe: FringeData = {
    lengths: [1, 2, 4, 5, 5, 4, 2, 1],
    turnBeads: [true, true, true, true, true, true, true, true],
  }
  const order = buildWeaveOrder('brick', 8, 6, fringe)

  it('kind "body" delegates to firstIndexOfUnit', () => {
    expect(jumpTargetToIndex('brick', order, { kind: 'body', index: 0 })).toBe(firstIndexOfUnit('brick', order, 0))
    expect(jumpTargetToIndex('brick', order, { kind: 'body', index: 3 })).toBe(firstIndexOfUnit('brick', order, 3))
  })

  it('kind "fringe" delegates to firstIndexOfNextFringeColumn (target column minus one)', () => {
    // Body is 8x6 = 48 steps (indices 0-47). Fringe then walks column by column:
    // col 0 (len 1) -> index 48, col 1 (len 2) -> 49-50, col 2 (len 4) -> 51-54, ...
    expect(jumpTargetToIndex('brick', order, { kind: 'fringe', index: 0 })).toBe(48)
    expect(jumpTargetToIndex('brick', order, { kind: 'fringe', index: 4 })).toBe(
      firstIndexOfNextFringeColumn(order, 3),
    )
  })

  it('"Fleco · Columna 5" (1-based, index 4) lands on the first bead of that column', () => {
    const target = jumpTargetToIndex('brick', order, { kind: 'fringe', index: 4 })
    expect(order[target]).toMatchObject({ col: 4, isFringe: true })
    // No earlier step in the order belongs to column 4's fringe.
    expect(order.slice(0, target).some((step) => isFringeStep(step) && step.col === 4)).toBe(false)
  })

  it('returns -1 for a fringe column with no beads (never offered by the selector, but stays a safe no-op)', () => {
    const noFringe: FringeData = { lengths: [0, 0], turnBeads: [false, false] }
    const bodyOnlyOrder = buildWeaveOrder('brick', 2, 2, noFringe)
    expect(jumpTargetToIndex('brick', bodyOnlyOrder, { kind: 'fringe', index: 0 })).toBe(-1)
  })
})
