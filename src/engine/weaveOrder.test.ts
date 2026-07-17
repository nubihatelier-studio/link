import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { buildWeaveOrder, firstIndexOfUnit, isFringeStep, unitIndexOf, weaveUnit } from './weaveOrder'

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
