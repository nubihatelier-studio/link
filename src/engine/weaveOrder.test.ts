import { describe, expect, it } from 'vitest'
import type { FringeData } from './types'
import { rowPitch } from './geometry'
import { createShapedRowShape } from './shape'
import {
  WEAVE_ORDER_VERSION,
  beadsThrough,
  buildWeaveOrder,
  directionAtStep,
  firstIndexOfNextUnit,
  firstIndexOfUnit,
  isFringeStep,
  jumpTargetToIndex,
  peyoteThreadPath,
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

describe('buildWeaveOrder — brick (de arriba hacia abajo, serpentina)', () => {
  it('empieza en la primera fila (la de arriba) y baja, alternando la dirección', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    expect(order).toEqual([
      // fila 0 (la primera, fila base) — ltr
      { cells: [{ row: 0, col: 0 }], unit: 0, direction: 'ltr', grouped: false, isBaseRow: true },
      { cells: [{ row: 0, col: 1 }], unit: 0, direction: 'ltr', grouped: false, isBaseRow: true },
      { cells: [{ row: 0, col: 2 }], unit: 0, direction: 'ltr', grouped: false, isBaseRow: true },
      // fila 1 — rtl (serpentina)
      { cells: [{ row: 1, col: 2 }], unit: 1, direction: 'rtl', grouped: false },
      { cells: [{ row: 1, col: 1 }], unit: 1, direction: 'rtl', grouped: false },
      { cells: [{ row: 1, col: 0 }], unit: 1, direction: 'rtl', grouped: false },
      // fila 2 (la última) — ltr de nuevo
      { cells: [{ row: 2, col: 0 }], unit: 2, direction: 'ltr', grouped: false },
      { cells: [{ row: 2, col: 1 }], unit: 2, direction: 'ltr', grouped: false },
      { cells: [{ row: 2, col: 2 }], unit: 2, direction: 'ltr', grouped: false },
    ])
  })

  it('un cuerpo de una sola fila es a la vez la fila base y la última', () => {
    const order = buildWeaveOrder('brick', 2, 1)
    expect(order.every((s) => s.isBaseRow)).toBe(true)
  })

  it('a shaped row is still walked start-to-end within its own offset/length span, direction unaffected', () => {
    // Un triángulo de 5 columnas y 3 filas: la fila 0 tiene 1 columna centrada, la 1 tiene 3 y la 2 (la última, la más ancha) tiene 5.
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ]
    const order = buildWeaveOrder('brick', 5, 3, undefined, rowShape)
    expect(order.map((s) => s.cells[0])).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ])
    expect(order).toHaveLength(1 + 3 + 5)
  })
})

describe('buildWeaveOrder — brick fringe (Tarea 2.3: un fleco completo a la vez, orden por dirección natural del hilo)', () => {
  it('appends fringe only after the whole body, one column completed top to bottom before the next', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [true, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // cuerpo: fila 0 (ltr) y después fila 1 (rtl) = 6 pasos, y recién ahí el fleco.
    expect(order).toHaveLength(6 + 2 + 0 + 1)
    const fringeSteps = order.slice(6)
    // La última fila del cuerpo (la 1) fue 'rtl' — termina en el borde izquierdo,
    // así que los flecos se toman de izquierda a derecha, desde la columna 0.
    expect(fringeSteps).toEqual([
      { cells: [{ row: 2, col: 0 }], unit: 0, direction: 'ltr', grouped: false, isFringe: true },
      { cells: [{ row: 3, col: 0 }], unit: 0, direction: 'ltr', grouped: false, isFringe: true, isTurnBead: true },
      { cells: [{ row: 2, col: 2 }], unit: 2, direction: 'ltr', grouped: false, isFringe: true },
    ])
  })

  it('when the last body row goes left-to-right, fringe columns are visited descending (nearest to where the thread ended)', () => {
    // Con una sola fila, la fila base (ltr) es también la última: termina en el borde derecho.
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
  it('el recorrido de un peyote de 6 de ancho es exactamente el que marcó la tejedora, paso por paso', () => {
    const order = buildWeaveOrder('peyote', 6, 4)
    const steps = order.slice(0, 18).map((st) => st.cells.map((c) => `${c.row},${c.col}`).join(' '))
    expect(steps).toEqual([
      // 1–6: la base, de a una, de izquierda a derecha (el zigzag: 1 baja, 2 alta, 3 baja…)
      '0,0', '0,1', '0,2', '0,3', '0,4', '0,5',
      // 7–9: vuelta de derecha a izquierda por las columnas altas (6, 4, 2)
      '1,5', '1,3', '1,1',
      // 10–12: ida por las bajas (1, 3, 5)
      '1,0', '1,2', '1,4',
      // 13–15: vuelta por 6, 4, 2 · 16–18: ida por 1, 3, 5
      '2,5', '2,3', '2,1',
      '2,0', '2,2', '2,4',
    ])
    // Cada paso es una sola mostacilla, también en la base.
    expect(order.every((st) => st.cells.length === 1 && !st.grouped)).toBe(true)
  })

  it('la base es la primera pasada (0) y va de izquierda a derecha', () => {
    const base = buildWeaveOrder('peyote', 6, 4).filter((st) => st.unit === 0)
    expect(base).toHaveLength(6)
    expect(base.every((st) => st.cells[0].row === 0 && st.direction === 'ltr')).toBe(true)
  })

  it('las columnas altas son siempre las de la última mostacilla de la base: en ancho impar, las pares', () => {
    // 3 de ancho: la base termina en la columna 2 (índice par), que es la que sube.
    const order = buildWeaveOrder('peyote', 3, 3)
    const pass1 = order.filter((st) => st.unit === 1).map((st) => st.cells[0])
    expect(pass1).toEqual([{ row: 1, col: 2 }, { row: 1, col: 0 }])
    const pass2 = order.filter((st) => st.unit === 2).map((st) => st.cells[0])
    expect(pass2).toEqual([{ row: 1, col: 1 }])
  })

  it('visits every cell exactly once', () => {
    const order = buildWeaveOrder('peyote', 6, 5)
    expect(totalBeadCount(order)).toBe(30)
    const seen = new Set(order.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`))
    expect(seen.size).toBe(30)
  })

  it('un patrón de una sola fila es sólo su base, de a una', () => {
    const order = buildWeaveOrder('peyote', 4, 1)
    expect(order).toHaveLength(4)
    expect(order.every((st) => st.unit === 0 && !st.grouped)).toBe(true)
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

describe('directionAtStep al pasar de la base a la primera pasada (peyote)', () => {
  it('de la última mostacilla de la base a la primera de la pasada: misma columna, una mostacilla más abajo', () => {
    const order = buildWeaveOrder('peyote', 3, 3)
    // 3 de ancho: base (0,0) (0,1) (0,2), y la pasada 1 empieza en (1,2), justo debajo.
    const direction = directionAtStep('peyote', order, 2)
    expect(direction?.dx).toBe(0)
    expect(direction?.dy).toBeCloseTo(rowPitch('peyote'), 10)
  })
})

describe('firstIndexOfUnit', () => {
  it('finds the first traversal index for a given row', () => {
    const order = buildWeaveOrder('loom', 4, 4)
    expect(firstIndexOfUnit(order, 0)).toBe(0)
    expect(firstIndexOfUnit(order, 2)).toBe(8)
    expect(firstIndexOfUnit(order, 99)).toBe(-1)
  })

  it('en brick las filas se recorren de arriba hacia abajo', () => {
    const order = buildWeaveOrder('brick', 4, 4)
    expect(firstIndexOfUnit(order, 0)).toBe(0) // la fila 0 (la de arriba) se teje primero
    expect(firstIndexOfUnit(order, 3)).toBe(12) // la fila 3 (la de abajo) se teje al final
  })
})

describe('firstIndexOfNextUnit — a dónde salta "marcar hecha"', () => {
  it('sigue el orden real de tejido: en ladrillo las filas van de la más ancha a la punta', () => {
    const order = buildWeaveOrder('brick', 3, 3)
    expect(firstIndexOfNextUnit(order, 1)).toBe(3)
    expect(firstIndexOfNextUnit(order, 4)).toBe(6)
  })

  it('en telar y peyote las filas corren al revés, y funciona igual', () => {
    expect(firstIndexOfNextUnit(buildWeaveOrder('loom', 3, 3), 1)).toBe(3)
    // Cerrar la base del peyote lleva a la primera mostacilla de la pasada 1.
    expect(firstIndexOfNextUnit(buildWeaveOrder('peyote', 3, 4), 0)).toBe(3)
  })

  it('al cerrar la última fila del cuerpo pasa al primer fleco, no al final del aro', () => {
    const fringe: FringeData = { lengths: [1, 1, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 1, fringe)
    const next = firstIndexOfNextUnit(order, 0)
    expect(order[next].isFringe).toBe(true)
    expect(next).toBeLessThan(order.length - 1) // quedan flecos por tejer
  })

  it('de un fleco pasa al fleco siguiente', () => {
    const fringe: FringeData = { lengths: [2, 0, 1], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 2, fringe)
    // El cuerpo termina en el borde izquierdo: los flecos van columna 0 (2 mostacillas) y columna 2 (1).
    expect(firstIndexOfNextUnit(order, 6)).toBe(8)
  })

  it('del último fleco pasa a la argolla, sin darla por tejida', () => {
    const fringe: FringeData = { lengths: [1, 0, 0], turnBeads: [false, false, false] }
    const order = buildWeaveOrder('brick', 3, 1, fringe, undefined, 4)
    const last = order.length - 1
    expect(order[last].isLoop).toBe(true)
    expect(firstIndexOfNextUnit(order, last - 1)).toBe(last)
  })

  it('devuelve -1 al final del orden', () => {
    expect(firstIndexOfNextUnit(buildWeaveOrder('loom', 2, 1), 1)).toBe(-1)
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

  it('en peyote "Ir a" apunta a pasadas: la 0 es la base, la 1 empieza después de ella', () => {
    const peyoteOrder = buildWeaveOrder('peyote', 4, 4)
    expect(jumpTargetToIndex(peyoteOrder, { kind: 'body', index: 0 })).toBe(0)
    expect(jumpTargetToIndex(peyoteOrder, { kind: 'body', index: 1 })).toBe(4)
  })
})

describe('totalBeadCount / beadsThrough — counting with grouped steps (Tarea 4)', () => {
  it('a grouped step (a woven loop\'s ring) counts as all of its beads at once', () => {
    const order = buildWeaveOrder('loom', 2, 1, undefined, undefined, 8)
    expect(totalBeadCount(order)).toBe(2 + 8)
    expect(beadsThrough(order, 1)).toBe(2)
    expect(beadsThrough(order, 2)).toBe(10) // the ring's 8 beads land in one step
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
  it('(a) brick, cuerpo triangular de 5 columnas: el recorrido empieza en la fila de arriba y termina en la de abajo, con direcciones alternadas', () => {
    const rowShape = createShapedRowShape('triangle', 5, 5) // anchos 1,2,3,4,5 — la fila 0 es la angosta, la 4 la más ancha.
    const order = buildWeaveOrder('brick', 5, 5, undefined, rowShape)
    // El primer paso es de la fila 0, marcada como fila base.
    expect(order[0].unit).toBe(0)
    expect(order[0].isBaseRow).toBe(true)
    // El último paso es de la fila 4, la de abajo.
    expect(order[order.length - 1].unit).toBe(4)
    // La dirección de cada fila alterna en el orden en que se tejen.
    const directionsByRow: Record<number, string> = {}
    for (const step of order) directionsByRow[step.unit] = step.direction
    expect(directionsByRow[0]).toBe('ltr')
    expect(directionsByRow[1]).toBe('rtl')
    expect(directionsByRow[2]).toBe('ltr')
    expect(directionsByRow[3]).toBe('rtl')
    expect(directionsByRow[4]).toBe('ltr')
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

  it('(c) peyote de 8 de ancho: la base de a una, y cada pasada siguiente son las posiciones alternadas', () => {
    const order = buildWeaveOrder('peyote', 8, 5)

    // La base: las 8 mostacillas de la fila 1, de a una.
    const base = order.filter((st) => st.unit === 0)
    expect(base).toHaveLength(8)
    expect(base.every((st) => st.cells[0].row === 0 && st.cells.length === 1)).toBe(true)

    const passes = passesOf(order).filter((p) => p.unit > 0)
    expect(passes).toHaveLength(8) // 4 filas × 2 pasadas
    for (const pass of passes) expect(pass.cells).toHaveLength(4)

    // La segunda fila: primero las altas (las de la última mostacilla de la base, impares), después las bajas.
    expect(passes[0].cells.map((c) => c.col)).toEqual([7, 5, 3, 1])
    expect(passes[1].cells.map((c) => c.col)).toEqual([0, 2, 4, 6])
    expect(passes[0].cells.every((c) => c.row === 1)).toBe(true)
    expect(passes[2].cells.every((c) => c.row === 2)).toBe(true)

    expect(passes.map((p) => p.direction)).toEqual(['rtl', 'ltr', 'rtl', 'ltr', 'rtl', 'ltr', 'rtl', 'ltr'])
    expect(passes.map((p) => p.unit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('(c bis) las mostacillas por las que pasa la aguja son las de la pasada anterior, y no son pasos', () => {
    const order = buildWeaveOrder('peyote', 8, 5)
    const sorted = (cells: { row: number; col: number }[]) => [...cells].sort((a, b) => a.row - b.row || a.col - b.col)

    // La pasada 1 (altas de la segunda fila) pasa por las bajas de la base.
    const firstPassStart = order.findIndex((st) => st.unit === 1)
    expect(sorted(peyoteThreadThroughCells(order, firstPassStart, 8))).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 2 },
      { row: 0, col: 4 },
      { row: 0, col: 6 },
    ])

    // La pasada 2 (bajas de la segunda fila) pasa por las altas de esa misma fila.
    const secondPassStart = order.findIndex((st) => st.unit === 2)
    expect(sorted(peyoteThreadThroughCells(order, secondPassStart, 8))).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 1, col: 5 },
      { row: 1, col: 7 },
    ])

    // Ninguna es un paso de la pasada actual.
    const current = order.filter((st) => st.unit === 1).flatMap((st) => st.cells)
    for (const c of peyoteThreadThroughCells(order, firstPassStart, 8)) expect(current).not.toContainEqual(c)

    // La base no pasa por nada.
    expect(peyoteThreadThroughCells(order, 0, 8)).toEqual([])
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

  it('la argolla nunca se confunde con una pasada de peyote al saltar', () => {
    const order = buildWeaveOrder('peyote', 6, 6, undefined, undefined, 8)
    expect(order[jumpTargetToIndex(order, { kind: 'body', index: 0 })].isLoop).toBeUndefined()
  })
})

describe('peyoteThreadPath — el recorrido del hilo', () => {
  const at = (stops: ReturnType<typeof peyoteThreadPath>) => stops.map((s) => `${s.kind === 'through' ? '·' : ''}${s.cell.row},${s.cell.col}`)

  it('la base va derecho de izquierda a derecha, por las 6 mostacillas', () => {
    const order = buildWeaveOrder('peyote', 6, 4)
    expect(at(peyoteThreadPath(order, 5, 6))).toEqual(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5'])
  })

  it('en cada pasada el hilo alterna: mostacilla nueva, y la de la pasada anterior que queda al lado', () => {
    const order = buildWeaveOrder('peyote', 6, 4)
    const stops = peyoteThreadPath(order, 11, 6) // base + pasada 1 + pasada 2
    expect(at(stops).slice(6)).toEqual([
      // pasada 1, de derecha a izquierda: nueva bajo la 6, por la 5 de la base, nueva bajo la 4…
      '1,5', '·0,4', '1,3', '·0,2', '1,1', '·0,0',
      // pasada 2, de izquierda a derecha: nueva bajo la 1, por la alta de la columna 2…
      '1,0', '·1,1', '1,2', '·1,3', '1,4', '·1,5',
    ])
  })

  it('al terminar una pasada da la vuelta por fuera del borde, del lado donde terminó', () => {
    const order = buildWeaveOrder('peyote', 6, 4)
    const stops = peyoteThreadPath(order, 11, 6)
    const turns = stops.filter((s) => s.turnBefore)
    expect(turns.map((s) => [s.pass, s.turnSide])).toEqual([
      [1, 'right'], // la base terminó a la derecha
      [2, 'left'], // la pasada 1 terminó a la izquierda
    ])
  })

  it('cada vuelta baja exactamente a la mostacilla de abajo: el hilo no cruza el tejido', () => {
    const order = buildWeaveOrder('peyote', 6, 6)
    const stops = peyoteThreadPath(order, order.length - 1, 6)
    for (let i = 1; i < stops.length; i++) {
      if (!stops[i].turnBefore) continue
      expect(stops[i].cell.col).toBe(stops[i - 1].cell.col)
    }
  })
})

describe('buildWeaveOrder — el aro triangular', () => {
  it('devuelve un orden vacío en vez de tirar un error: la biblioteca le pregunta el avance a todos', () => {
    expect(buildWeaveOrder('triangle', 10, 10)).toEqual([])
  })
})
