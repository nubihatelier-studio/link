import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { rowPitch } from './geometry'
import { createShapedRowShape } from './shape'
import {
  WEAVE_ORDER_VERSION,
  beadsThrough,
  buildWeaveOrder,
  directionAtStep,
  firstIndexOfNextBodyRow,
  firstIndexOfNextFringeColumn,
  firstIndexOfUnit,
  isFringeStep,
  jumpTargetToIndex,
  peyoteThreadThroughCells,
  totalBeadCount,
} from './weaveOrder'

describe('buildWeaveOrder — loom (unchanged)', () => {
  it('row-major, left to right, same direction every row — one bead per step', () => {
    const order = buildWeaveOrder('loom', 3, 2)
    expect(order).toEqual([
      { cells: [{ row: 0, col: 0 }], unit: 0, direction: 'ltr', grouped: false },
      { cells: [{ row: 0, col: 1 }], unit: 0, direction: 'ltr', grouped: false },
      { cells: [{ row: 0, col: 2 }], unit: 0, direction: 'ltr', grouped: false },
      { cells: [{ row: 1, col: 0 }], unit: 1, direction: 'ltr', grouped: false },
      { cells: [{ row: 1, col: 1 }], unit: 1, direction: 'ltr', grouped: false },
      { cells: [{ row: 1, col: 2 }], unit: 1, direction: 'ltr', grouped: false },
    ])
  })

  it('visits every cell exactly once', () => {
    const order = buildWeaveOrder('loom', 5, 7)
    expect(totalBeadCount(order)).toBe(35)
    const seen = new Set(order.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`))
    expect(seen.size).toBe(35)
  })
})

describe('buildWeaveOrder — brick (Tarea 2: fila más ancha primero, serpentina)', () => {
  it('starts at the widest row (rows - 1) and decreases toward the tip (row 0), alternating direction', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    expect(order).toEqual([
      // row 2 (widest, base row) — ltr
      { cells: [{ row: 2, col: 0 }], unit: 2, direction: 'ltr', grouped: false, isBaseRow: true },
      { cells: [{ row: 2, col: 1 }], unit: 2, direction: 'ltr', grouped: false, isBaseRow: true },
      { cells: [{ row: 2, col: 2 }], unit: 2, direction: 'ltr', grouped: false, isBaseRow: true },
      // row 1 — rtl (serpentine)
      { cells: [{ row: 1, col: 2 }], unit: 1, direction: 'rtl', grouped: false },
      { cells: [{ row: 1, col: 1 }], unit: 1, direction: 'rtl', grouped: false },
      { cells: [{ row: 1, col: 0 }], unit: 1, direction: 'rtl', grouped: false },
      // row 0 (the tip) — ltr again
      { cells: [{ row: 0, col: 0 }], unit: 0, direction: 'ltr', grouped: false },
      { cells: [{ row: 0, col: 1 }], unit: 0, direction: 'ltr', grouped: false },
      { cells: [{ row: 0, col: 2 }], unit: 0, direction: 'ltr', grouped: false },
    ])
  })

  it('a single-row body is both the base row and the tip', () => {
    const order = buildWeaveOrder('brick', 2, 1)
    expect(order.every((s) => s.isBaseRow)).toBe(true)
  })

  it('a shaped row is still walked start-to-end within its own offset/length span, direction unaffected', () => {
    // A 5-col, 3-row triangle: row 0 has 1 col centered, row 1 has 3, row 2 (the last, widest) has 5.
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ]
    const order = buildWeaveOrder('brick', 5, 3, undefined, rowShape)
    expect(order.map((s) => s.cells[0])).toEqual([
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 1, col: 3 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 0, col: 2 },
    ])
    expect(order).toHaveLength(5 + 3 + 1)
  })
})

describe('buildWeaveOrder — brick fringe (Tarea 2.3: un fleco completo a la vez, orden por dirección natural del hilo)', () => {
  it('appends fringe only after the whole body, one column completed top to bottom before the next', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [true, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // body: row1 (ltr) then row0 (rtl) = 6 steps, then fringe.
    expect(order).toHaveLength(6 + 2 + 0 + 1)
    const fringeSteps = order.slice(6)
    // Body's last row (row 0) went 'rtl' (row1 is base/ltr, row0 is rtl) — ends at the left edge,
    // so fringe picks up ascending from column 0.
    expect(fringeSteps).toEqual([
      { cells: [{ row: 2, col: 0 }], unit: 0, direction: 'ltr', grouped: false, isFringe: true },
      { cells: [{ row: 3, col: 0 }], unit: 0, direction: 'ltr', grouped: false, isFringe: true, isTurnBead: true },
      { cells: [{ row: 2, col: 2 }], unit: 2, direction: 'ltr', grouped: false, isFringe: true },
    ])
  })

  it('when the last body row goes left-to-right, fringe columns are visited descending (nearest to where the thread ended)', () => {
    // 2 rows: row 1 (base, ltr), row 0 (tip, rtl) -- for an EVEN row count the tip is rtl.
    // Use a single row so the base row (ltr) is also the tip, ending at the right edge.
    const fringe: FringeData = { lengths: [1, 1, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 1, fringe)
    const fringeSteps = order.filter(isFringeStep)
    expect(fringeSteps.map((s) => s.unit)).toEqual([2, 1, 0])
  })

  it('a column with no fringe (length 0) contributes no steps', () => {
    const fringe: FringeData = { lengths: [0, 0], turnBeads: [false, false] }
    const order = buildWeaveOrder('loom', 2, 2, fringe)
    expect(totalBeadCount(order)).toBe(4)
  })

  it('isFringeStep discriminates body cells from fringe beads', () => {
    const fringe: FringeData = { lengths: [1], turnBeads: [false] }
    const order = buildWeaveOrder('loom', 1, 2, fringe)
    expect(order.map(isFringeStep)).toEqual([false, false, true])
  })

  it('a fringe strand is only appended under a column outside the last row\'s own span, even if fringe.lengths says otherwise', () => {
    const narrowLastRow = [
      { offset: 0, length: 5 },
      { offset: 0, length: 5 },
      { offset: 2, length: 1 }, // last row (index 2) tapers to a single center column
    ]
    const fringe: FringeData = { lengths: [3, 3, 3, 3, 3], turnBeads: [false, false, false, false, false] }
    const order = buildWeaveOrder('brick', 5, 3, fringe, narrowLastRow)
    const fringeSteps = order.filter(isFringeStep)
    expect(fringeSteps).toHaveLength(3) // only column 2's fringe, not all 5 columns'
    expect(fringeSteps.every((s) => s.unit === 2)).toBe(true)
  })
})

/** Las pasadas reales de un recorrido de peyote (sin la primera pasada agrupada), con sus celdas en orden. */
function passesOf(order: ReturnType<typeof buildWeaveOrder>) {
  const byUnit = new Map<number, { unit: number; direction: string; cells: { row: number; col: number }[] }>()
  for (const step of order) {
    if (step.grouped || step.isFringe || step.isLoop) continue
    const entry = byUnit.get(step.unit) ?? { unit: step.unit, direction: step.direction, cells: [] }
    entry.cells.push(...step.cells)
    byUnit.set(step.unit, entry)
  }
  return [...byUnit.values()].sort((a, b) => a.unit - b.unit)
}

describe('buildWeaveOrder — peyote (pasadas reales, no el zigzag dibujado)', () => {
  it('rows 1 and 2 (index 0 and 1) are one grouped step, alternating between the two rows across the width', () => {
    const order = buildWeaveOrder('peyote', 3, 2)
    expect(order).toHaveLength(1)
    expect(order[0].grouped).toBe(true)
    expect(order[0].cells).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
    ])
  })

  it('desde la fila 3, cada pasada toma las posiciones alternadas de la fila, no la fila entera', () => {
    const order = buildWeaveOrder('peyote', 3, 4)
    // order[0] = la primera pasada (filas 0-1, ltr, "turno 0").
    // Fila 2 se parte en dos pasadas: columnas pares (0, 2) y luego la impar (1).
    const pass1 = order.filter((s) => !s.grouped && s.unit === 1)
    expect(pass1.map((s) => s.cells[0])).toEqual([{ row: 2, col: 2 }, { row: 2, col: 0 }])
    expect(pass1.every((s) => s.direction === 'rtl')).toBe(true)

    const pass2 = order.filter((s) => !s.grouped && s.unit === 2)
    expect(pass2.map((s) => s.cells[0])).toEqual([{ row: 2, col: 1 }])
    expect(pass2.every((s) => s.direction === 'ltr')).toBe(true)

    // Y recién entonces la fila 3, otra vez partida en pares e impares.
    const pass3 = order.filter((s) => !s.grouped && s.unit === 3)
    expect(pass3.map((s) => s.cells[0])).toEqual([{ row: 3, col: 2 }, { row: 3, col: 0 }])
    const pass4 = order.filter((s) => !s.grouped && s.unit === 4)
    expect(pass4.map((s) => s.cells[0])).toEqual([{ row: 3, col: 1 }])
  })

  it('visits every cell exactly once', () => {
    const order = buildWeaveOrder('peyote', 6, 5)
    expect(totalBeadCount(order)).toBe(30)
    const seen = new Set(order.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`))
    expect(seen.size).toBe(30)
  })

  it('a single-row pattern has no foundation pass to pair with — degrades to a plain row', () => {
    const order = buildWeaveOrder('peyote', 4, 1)
    expect(order.every((s) => !s.grouped)).toBe(true)
    expect(totalBeadCount(order)).toBe(4)
  })

  it('ignores rowShape (not shape-capable)', () => {
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ]
    expect(buildWeaveOrder('peyote', 5, 3, undefined, rowShape)).toEqual(buildWeaveOrder('peyote', 5, 3))
  })
})

describe('directionAtStep with a fringe', () => {
  it('points straight down between two beads of the same fringe column, at the same pitch as between body rows (no kink at the boundary)', () => {
    const fringe: FringeData = { lengths: [3], turnBeads: [false] }
    const order = buildWeaveOrder('brick', 1, 2, fringe)
    // order: [body row1], [body row0], [fringe depth0], [fringe depth1], [fringe depth2]
    const direction = directionAtStep('brick', order, 2, 2)
    expect(direction?.dx).toBe(0)
    expect(direction?.dy).toBeCloseTo(rowPitch('brick'), 10)
  })

  it('matches the plain (no bodyRows) call when both steps are in the body', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    expect(directionAtStep('brick', order, 1, 3)).toEqual(directionAtStep('brick', order, 1))
  })
})

describe('directionAtStep with staggerPhase (Ronda I)', () => {
  it('defaults to phase 0, matching the pre-Ronda-I behavior exactly when omitted', () => {
    const order = buildWeaveOrder('brick', 4, 3)
    expect(directionAtStep('brick', order, 1, 3)).toEqual(directionAtStep('brick', order, 1, 3, 0))
  })
})

describe('directionAtStep with a grouped step (peyote foundation pass)', () => {
  it('uses the last cell of the current step and the first cell of the next — works whether either side is grouped', () => {
    const order = buildWeaveOrder('peyote', 3, 3)
    // order[0] = foundation, 6 cells, last cell {row:1,col:2}. order[1] = first cell of row 2, direction rtl -> {row:2,col:2}.
    // Same column on both ends (dx=0), one row pitch apart vertically.
    const direction = directionAtStep('peyote', order, 0)
    expect(direction?.dx).toBe(0)
    expect(direction?.dy).toBeCloseTo(rowPitch('peyote'), 10)
  })
})

describe('firstIndexOfNextFringeColumn', () => {
  it('finds the index right after the current column\'s fringe run ends', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // Body (row1 ltr, row0 rtl) ends at the left edge (row0 rtl) -> fringe ascends: col0 (2 beads), col2 (1 bead).
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
  it('finds the first traversal index for a given row', () => {
    const order = buildWeaveOrder('loom', 4, 4)
    expect(firstIndexOfUnit(order, 0)).toBe(0)
    expect(firstIndexOfUnit(order, 2)).toBe(8)
    expect(firstIndexOfUnit(order, 99)).toBe(-1)
  })

  it('works on brick\'s reversed order too', () => {
    const order = buildWeaveOrder('brick', 4, 4)
    expect(firstIndexOfUnit(order, 3)).toBe(0) // row 3 (widest) is walked first
    expect(firstIndexOfUnit(order, 0)).toBe(12) // row 0 (tip) is walked last
  })
})

describe('firstIndexOfNextBodyRow — direction-agnostic "mark row done" (Tarea 4)', () => {
  it('finds the next row in WALK order for brick (decreasing row index)', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    // Currently on row 2 (index 0-2) -> next body row is row 1, starting at index 3.
    expect(firstIndexOfNextBodyRow(order, 1)).toBe(3)
    // Currently on row 1 (index 3-5) -> next body row is row 0, starting at index 6.
    expect(firstIndexOfNextBodyRow(order, 4)).toBe(6)
  })

  it('finds the next row in walk order for loom/peyote (increasing row index)', () => {
    const order = buildWeaveOrder('loom', 3, 3)
    expect(firstIndexOfNextBodyRow(order, 1)).toBe(3)
  })

  it('jumping from the foundation pass lands on the first step of row 3 (index 2)', () => {
    const order = buildWeaveOrder('peyote', 3, 4)
    expect(firstIndexOfNextBodyRow(order, 0)).toBe(1)
  })

  it('returns -1 once the fringe section is reached (no more body rows) — matches the pre-existing fallback behavior', () => {
    const fringe: FringeData = { lengths: [1, 1, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 1, fringe)
    expect(firstIndexOfNextBodyRow(order, 0)).toBe(-1)
  })

  it('returns -1 at the very end of the order', () => {
    const order = buildWeaveOrder('loom', 2, 1)
    expect(firstIndexOfNextBodyRow(order, 1)).toBe(-1)
  })
})

describe('jumpTargetToIndex — mapeo del selector "Ir a" a índice de paso', () => {
  const fringe: FringeData = {
    lengths: [1, 2, 4, 5, 5, 4, 2, 1],
    turnBeads: [true, true, true, true, true, true, true, true],
  }
  const order = buildWeaveOrder('brick', 8, 6, fringe)

  it('kind "body" delegates to firstIndexOfUnit', () => {
    expect(jumpTargetToIndex(order, { kind: 'body', index: 5 })).toBe(firstIndexOfUnit(order, 5))
    expect(jumpTargetToIndex(order, { kind: 'body', index: 3 })).toBe(firstIndexOfUnit(order, 3))
  })

  it('kind "fringe" delegates to a search by fringe column', () => {
    expect(order[jumpTargetToIndex(order, { kind: 'fringe', index: 0 })]).toMatchObject({ unit: 0, isFringe: true })
  })

  it('"Fleco · Columna 5" (1-based, index 4) lands on the first bead of that column', () => {
    const target = jumpTargetToIndex(order, { kind: 'fringe', index: 4 })
    expect(order[target]).toMatchObject({ unit: 4, isFringe: true })
    expect(order.slice(0, target).some((step) => isFringeStep(step) && step.unit === 4)).toBe(false)
  })

  it('returns -1 for a fringe column with no beads (never offered by the selector, but stays a safe no-op)', () => {
    const noFringe: FringeData = { lengths: [0, 0], turnBeads: [false, false] }
    const bodyOnlyOrder = buildWeaveOrder('brick', 2, 2, noFringe)
    expect(jumpTargetToIndex(bodyOnlyOrder, { kind: 'fringe', index: 0 })).toBe(-1)
  })

  it('kind "foundation" (peyote) lands on index 0, the grouped step', () => {
    const peyoteOrder = buildWeaveOrder('peyote', 4, 4)
    expect(jumpTargetToIndex(peyoteOrder, { kind: 'foundation', index: 0 })).toBe(0)
  })
})

describe('totalBeadCount / beadsThrough — counting with grouped steps (Tarea 4)', () => {
  it('a grouped step (peyote foundation) counts as all of its beads at once', () => {
    const order = buildWeaveOrder('peyote', 4, 5)
    // foundation = 8 cells (rows 0-1, 4 cols), then rows 2-4 = 3*4 = 12 single-bead steps.
    expect(totalBeadCount(order)).toBe(8 + 12)
    expect(beadsThrough(order, 0)).toBe(8) // completing just the foundation step already counts 8 beads
    expect(beadsThrough(order, 1)).toBe(9) // + 1 bead from the first step of row 2
  })

  it('beadsThrough(-1) is 0 (nothing woven yet)', () => {
    const order = buildWeaveOrder('loom', 3, 3)
    expect(beadsThrough(order, -1)).toBe(0)
  })

  it('totalBeadCount matches cols*rows for an unshaped body regardless of technique', () => {
    for (const technique of ['loom', 'brick', 'peyote'] as const) {
      expect(totalBeadCount(buildWeaveOrder(technique, 5, 7))).toBe(35)
    }
  })
})

describe('WEAVE_ORDER_VERSION', () => {
  it('loom stays at version 1 forever (its order has never changed) — brick and peyote were bumped', () => {
    expect(WEAVE_ORDER_VERSION.loom).toBe(1)
    expect(WEAVE_ORDER_VERSION.brick).toBeGreaterThan(1)
    expect(WEAVE_ORDER_VERSION.peyote).toBeGreaterThan(1)
  })
})

describe('Tests exigidos — verificación literal de la tarea', () => {
  it('(a) brick, cuerpo triangular de 5 columnas: el recorrido empieza en la fila más ancha y termina en la punta, con direcciones alternadas', () => {
    const rowShape = createShapedRowShape('triangle', 5, 5) // widths 1,2,3,4,5 — row 4 is the widest/base, row 0 the tip.
    const order = buildWeaveOrder('brick', 5, 5, undefined, rowShape)
    // First step belongs to row 4 (the widest) and is flagged as the base row.
    expect(order[0].unit).toBe(4)
    expect(order[0].isBaseRow).toBe(true)
    // Last step belongs to row 0 (the tip).
    expect(order[order.length - 1].unit).toBe(0)
    // Each row's own direction alternates in walk order.
    const directionsByRow: Record<number, string> = {}
    for (const step of order) directionsByRow[step.unit] = step.direction
    expect(directionsByRow[4]).toBe('ltr')
    expect(directionsByRow[3]).toBe('rtl')
    expect(directionsByRow[2]).toBe('ltr')
    expect(directionsByRow[1]).toBe('rtl')
    expect(directionsByRow[0]).toBe('ltr')
  })

  it('(b) "Aro con flecos" de 6 columnas con largos 2,3,4,4,3,2: tras el cuerpo, cada fleco se completa entero (con su giro) antes del siguiente', () => {
    const fringe: FringeData = { lengths: [2, 3, 4, 4, 3, 2], turnBeads: [true, true, true, true, true, true] }
    const order = buildWeaveOrder('brick', 6, 3, fringe)
    const fringeSteps = order.filter(isFringeStep)
    expect(fringeSteps).toHaveLength(2 + 3 + 4 + 4 + 3 + 2)

    // Group the fringe steps into runs by column, in the order they actually appear.
    const runs: number[][] = []
    for (const step of fringeSteps) {
      const last = runs[runs.length - 1]
      if (last && order[order.indexOf(step) - 1]?.unit === step.unit) last.push(step.unit)
      else runs.push([step.unit])
    }
    // Every run is a single column, never interleaved sideways with another column.
    for (const run of runs) expect(new Set(run).size).toBe(1)
    // Each run's last step is the turn bead (every column has one here).
    let cursor = 0
    for (const run of runs) {
      cursor += run.length
      expect(fringeSteps[cursor - 1].isTurnBead).toBe(true)
    }
  })

  it('(c) peyote de 8 de ancho: la primera pasada agrupa filas 1 y 2, y cada pasada siguiente son las posiciones alternadas', () => {
    const order = buildWeaveOrder('peyote', 8, 5)

    // La primera pasada: filas 1 y 2 ensartadas juntas, como estaba.
    expect(order[0].grouped).toBe(true)
    expect(order[0].unit).toBe(0)
    expect(order[0].cells).toHaveLength(16) // 8 columnas x 2 filas
    expect(new Set(order[0].cells.map((c) => c.row))).toEqual(new Set([0, 1]))

    const passes = passesOf(order)
    // 3 filas de grilla después de la primera pasada, 2 pasadas por fila.
    expect(passes).toHaveLength(6)

    // Cada pasada son 4 mostacillas: las posiciones alternadas de su fila.
    for (const pass of passes) expect(pass.cells).toHaveLength(8 / 2)

    // Fila 3 (índice 2): primero las columnas pares, después las impares.
    expect(passes[0].cells.map((c) => c.col).sort((a, b) => a - b)).toEqual([0, 2, 4, 6])
    expect(passes[1].cells.map((c) => c.col).sort((a, b) => a - b)).toEqual([1, 3, 5, 7])
    expect(passes[0].cells.every((c) => c.row === 2)).toBe(true)
    expect(passes[1].cells.every((c) => c.row === 2)).toBe(true)

    // Fila 4 (índice 3) sigue igual, y así.
    expect(passes[2].cells.map((c) => c.col).sort((a, b) => a - b)).toEqual([0, 2, 4, 6])
    expect(passes[2].cells.every((c) => c.row === 3)).toBe(true)

    // Las direcciones alternan, empezando en rtl (la primera pasada fue ltr).
    expect(passes.map((p) => p.direction)).toEqual(['rtl', 'ltr', 'rtl', 'ltr', 'rtl', 'ltr'])

    // Las pasadas se numeran corridas desde la primera pasada, que es la 0.
    expect(passes.map((p) => p.unit)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('(c bis) las mostacillas por las que pasa la aguja son las de la pasada anterior, y no son pasos', () => {
    const order = buildWeaveOrder('peyote', 8, 5)
    const sorted = (cells: { row: number; col: number }[]) =>
      [...cells].sort((a, b) => a.row - b.row || a.col - b.col)

    // La pasada 2 (columnas impares de la fila 3) enhebra por las pares de esa
    // misma fila, que son las de la pasada 1.
    const secondPassStart = order.findIndex((s) => !s.grouped && s.unit === 2)
    expect(sorted(peyoteThreadThroughCells(order, secondPassStart))).toEqual([
      { row: 2, col: 0 },
      { row: 2, col: 2 },
      { row: 2, col: 4 },
      { row: 2, col: 6 },
    ])

    // La primera pasada real enhebra por las impares de la fila 2 — que están
    // dentro de la primera pasada agrupada, no en una pasada propia.
    const firstPassStart = order.findIndex((s) => !s.grouped && s.unit === 1)
    expect(sorted(peyoteThreadThroughCells(order, firstPassStart))).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 1, col: 5 },
      { row: 1, col: 7 },
    ])

    // Ninguna de esas celdas es un paso de la pasada actual: se pasa por ellas,
    // no se ensartan.
    const currentPassCells = order.filter((s) => !s.grouped && s.unit === 1).flatMap((s) => s.cells)
    for (const c of peyoteThreadThroughCells(order, firstPassStart)) {
      expect(currentPassCells).not.toContainEqual(c)
    }

    // La primera pasada agrupada no enhebra por ninguna anterior.
    expect(peyoteThreadThroughCells(order, 0)).toEqual([])
  })

  it('(d) loom: el recorrido no cambia (test de no regresión)', () => {
    const order = buildWeaveOrder('loom', 6, 4)
    expect(order.every((s) => s.direction === 'ltr' && !s.grouped && !s.isFringe)).toBe(true)
    expect(order.map((s) => s.cells[0])).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 1, col: 5 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
      { row: 3, col: 0 },
      { row: 3, col: 1 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 3, col: 5 },
    ])
  })

  it('(e) la suma de mostacillas del recorrido es igual al total del patrón en las cuatro configuraciones', () => {
    const brickRowShape = createShapedRowShape('triangle', 5, 5)
    const brickTotal = brickRowShape.reduce((sum, r) => sum + r.length, 0)
    expect(totalBeadCount(buildWeaveOrder('brick', 5, 5, undefined, brickRowShape))).toBe(brickTotal)

    const fringe: FringeData = { lengths: [2, 3, 4, 4, 3, 2], turnBeads: [true, true, true, true, true, true] }
    const fringeTotal = fringe.lengths.reduce((a, b) => a + b, 0)
    expect(totalBeadCount(buildWeaveOrder('brick', 6, 3, fringe))).toBe(6 * 3 + fringeTotal)

    expect(totalBeadCount(buildWeaveOrder('peyote', 8, 5))).toBe(8 * 5)

    expect(totalBeadCount(buildWeaveOrder('loom', 6, 4))).toBe(6 * 4)
  })
})

describe('buildWeaveOrder — woven loop (Tarea 3): worked last, as its own grouped step', () => {
  it('no loop step at all when loopBeadCount is 0 (metal loop, or none) — same order as without the param', () => {
    const withoutParam = buildWeaveOrder('brick', 5, 5)
    const withZero = buildWeaveOrder('brick', 5, 5, undefined, undefined, 0)
    expect(withZero).toEqual(withoutParam)
    expect(withZero.some((s) => s.isLoop)).toBe(false)
  })

  it('appends exactly one grouped step after everything else, for every technique', () => {
    for (const technique of ['loom', 'peyote', 'brick'] as const) {
      const order = buildWeaveOrder(technique, 6, 6, undefined, undefined, 8)
      const last = order[order.length - 1]
      expect(last.isLoop).toBe(true)
      expect(last.grouped).toBe(true)
      expect(last.cells).toHaveLength(8)
      expect(order.filter((s) => s.isLoop)).toHaveLength(1)
    }
  })

  it('comes after the fringe, not before it', () => {
    const fringe: FringeData = { lengths: [2, 2, 2], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 3, fringe, undefined, 5)
    const loopIndex = order.findIndex((s) => s.isLoop)
    const lastFringeIndex = order.findLastIndex((s) => isFringeStep(s))
    expect(loopIndex).toBeGreaterThan(lastFringeIndex)
    expect(loopIndex).toBe(order.length - 1)
  })

  it('adds exactly its own bead count to the pattern-wide total', () => {
    const without = totalBeadCount(buildWeaveOrder('loom', 6, 4))
    const withLoop = totalBeadCount(buildWeaveOrder('loom', 6, 4, undefined, undefined, 8))
    expect(withLoop).toBe(without + 8)
  })

  it('jumpTargetToIndex("foundation") still finds peyote\'s real foundation pass, not the loop, when both exist', () => {
    const order = buildWeaveOrder('peyote', 6, 6, undefined, undefined, 8)
    const foundationIndex = jumpTargetToIndex(order, { kind: 'foundation', index: 0 })
    expect(order[foundationIndex].isLoop).toBeUndefined()
    expect(order[foundationIndex].grouped).toBe(true)
  })
})
