import { describe, expect, it } from 'vitest'
import { resizePiece, type ResizablePiece } from './resize'
import { cellPosition, isShiftedRow } from './geometry'
import { createShapedRowShape } from './shape'

const A = '#111111'
const B = '#222222'

function loom(cells: Record<string, string>, cols = 4, rows = 3): ResizablePiece {
  return { technique: 'loom', cols, rows, cells, staggerPhase: 0 }
}

describe('cambiar tamaño — columnas', () => {
  it('agregar a la derecha deja el diseño donde estaba', () => {
    const r = resizePiece(loom({ '0,0': A, '0,3': B }), { cols: 6, rows: 3, colSide: 'right', rowSide: 'bottom' })
    expect(r.cols).toBe(6)
    expect(r.cells).toEqual({ '0,0': A, '0,3': B })
    expect(r.lost).toBe(0)
  })

  it('agregar a la izquierda corre el diseño hacia la derecha', () => {
    const r = resizePiece(loom({ '0,0': A, '0,3': B }), { cols: 6, rows: 3, colSide: 'left', rowSide: 'bottom' })
    expect(r.cells).toEqual({ '0,2': A, '0,5': B })
  })

  it('a los dos lados reparte parejo (la que sobra, a la derecha)', () => {
    const r = resizePiece(loom({ '0,0': A }), { cols: 7, rows: 3, colSide: 'both', rowSide: 'bottom' })
    expect(r.cells).toEqual({ '0,1': A })
  })

  it('achicar cuenta las mostacillas pintadas que quedan fuera', () => {
    const r = resizePiece(loom({ '0,0': A, '0,3': B, '1,3': B }), { cols: 3, rows: 3, colSide: 'right', rowSide: 'bottom' })
    expect(r.cells).toEqual({ '0,0': A })
    expect(r.lost).toBe(2)
  })

  it('achicar por la izquierda saca las de la izquierda', () => {
    const r = resizePiece(loom({ '0,0': A, '0,3': B }), { cols: 3, rows: 3, colSide: 'left', rowSide: 'bottom' })
    expect(r.cells).toEqual({ '0,2': B })
    expect(r.lost).toBe(1)
  })
})

describe('cambiar tamaño — filas', () => {
  it('agregar abajo no mueve nada', () => {
    const r = resizePiece(loom({ '2,1': A }), { cols: 4, rows: 5, colSide: 'right', rowSide: 'bottom' })
    expect(r.cells).toEqual({ '2,1': A })
  })

  it('agregar arriba baja el diseño', () => {
    const r = resizePiece(loom({ '0,1': A }), { cols: 4, rows: 5, colSide: 'right', rowSide: 'top' })
    expect(r.cells).toEqual({ '2,1': A })
  })

  it('quitar arriba pierde lo de las primeras filas', () => {
    const r = resizePiece(loom({ '0,1': A, '2,1': B }), { cols: 4, rows: 2, colSide: 'right', rowSide: 'top' })
    expect(r.cells).toEqual({ '1,1': B })
    expect(r.lost).toBe(1)
  })
})

describe('cambiar tamaño — flecos', () => {
  const withFringe: ResizablePiece = {
    technique: 'brick',
    cols: 3,
    rows: 2,
    staggerPhase: 0,
    fringe: { lengths: [2, 0, 1], turnBeads: [true, false, false] },
    cells: { '0,0': A, '2,0': B, '3,0': B, '2,2': A }, // cuerpo 2 filas; fleco desde la fila 2
  }

  it('cada hebra sigue bajo su columna, colgando de la nueva última fila', () => {
    const r = resizePiece(withFringe, { cols: 5, rows: 4, colSide: 'left', rowSide: 'bottom' })
    expect(r.fringe.lengths).toEqual([0, 0, 2, 0, 1])
    expect(r.fringe.turnBeads).toEqual([false, false, true, false, false])
    // El fleco de la columna 0 pasó a la 2, y cuelga desde la fila 4.
    expect(r.cells).toEqual({ '0,2': A, '4,2': B, '5,2': B, '4,4': A })
    expect(r.lost).toBe(0)
  })

  it('una hebra que queda fuera se pierde y se cuenta', () => {
    const r = resizePiece(withFringe, { cols: 2, rows: 2, colSide: 'right', rowSide: 'bottom' })
    expect(r.fringe.lengths).toEqual([2, 0])
    expect(r.lost).toBe(1) // la mostacilla del fleco de la columna 2
  })
})

describe('cambiar tamaño — brick con forma', () => {
  it('un rectángulo sigue siendo rectángulo del nuevo tamaño', () => {
    const r = resizePiece({ technique: 'brick', cols: 4, rows: 3, cells: {}, staggerPhase: 0 }, { cols: 6, rows: 4, colSide: 'both', rowSide: 'bottom' })
    expect(r.rowShape.every((row) => row.offset === 0 && row.length === 6)).toBe(true)
    expect(r.rowShape).toHaveLength(4)
  })

  it('un triángulo conserva el ancho de cada fila y se corre con las columnas', () => {
    const shape = createShapedRowShape('triangle', 5, 5)
    const r = resizePiece({ technique: 'brick', cols: 5, rows: 5, cells: {}, rowShape: shape, staggerPhase: 0 }, { cols: 7, rows: 5, colSide: 'both', rowSide: 'bottom' })
    expect(r.rowShape.map((row) => row.length)).toEqual(shape.map((row) => row.length))
    expect(r.rowShape.map((row) => row.offset)).toEqual(shape.map((row) => row.offset + 1))
  })

  it('las filas nuevas copian el ancho de su vecina', () => {
    const shape = createShapedRowShape('triangle', 5, 5)
    const r = resizePiece({ technique: 'brick', cols: 5, rows: 5, cells: {}, rowShape: shape, staggerPhase: 0 }, { cols: 5, rows: 7, colSide: 'right', rowSide: 'bottom' })
    expect(r.rowShape[5].length).toBe(shape[4].length)
    expect(r.rowShape[6].length).toBe(shape[4].length)
  })

  it('agregar una fila arriba invierte el desfase, así cada fila vieja queda donde estaba', () => {
    const before = { technique: 'brick' as const, cols: 4, rows: 3, cells: { '1,1': A }, staggerPhase: 0 as const }
    const r = resizePiece(before, { cols: 4, rows: 4, colSide: 'right', rowSide: 'top' })
    expect(r.staggerPhase).toBe(1)
    const antes = cellPosition('brick', 1, 1, undefined, 0).x
    const despues = cellPosition('brick', 2, 1, undefined, r.staggerPhase).x
    expect(despues).toBe(antes)
  })

  it('en 2-drop, agregar una pila arriba (2 filas) también la respeta', () => {
    const stagger = { phase: 0 as const, drop: 2 as const }
    const r = resizePiece({ technique: 'brick', cols: 4, rows: 4, cells: {}, staggerPhase: stagger }, { cols: 4, rows: 6, colSide: 'right', rowSide: 'top' })
    expect(isShiftedRow(2, r.staggerPhase)).toBe(isShiftedRow(0, stagger))
  })
})

describe('cambiar tamaño — peyote', () => {
  it('qué columnas van arriba se recalcula con la cantidad nueva', () => {
    const r = resizePiece({ technique: 'peyote', cols: 6, rows: 4, cells: {}, staggerPhase: 1 }, { cols: 7, rows: 4, colSide: 'right', rowSide: 'bottom' })
    expect(r.staggerPhase).toBe(0)
  })

  it('una columna agregada a la izquierda deja cada mostacilla a la misma altura', () => {
    const before = { technique: 'peyote' as const, cols: 6, rows: 4, cells: { '1,2': A }, staggerPhase: 1 as const }
    const r = resizePiece(before, { cols: 7, rows: 4, colSide: 'left', rowSide: 'bottom' })
    const antes = cellPosition('peyote', 1, 2, undefined, 1).y
    const despues = cellPosition('peyote', 1, 3, undefined, r.staggerPhase).y
    expect(despues).toBe(antes)
  })
})

describe('cambiar tamaño — par de aros separado', () => {
  it('el aro derecho se mueve como espejo: lo agregado a la izquierda de uno va a la derecha del otro', () => {
    const r = resizePiece(
      { ...loom({ '0,0': A }), pair: { mode: 'independent', rightCells: { '0,0': B } } },
      { cols: 6, rows: 3, colSide: 'left', rowSide: 'bottom' },
    )
    expect(r.cells).toEqual({ '0,2': A })
    expect(r.pair).toEqual({ mode: 'independent', rightCells: { '0,0': B } })
  })

  it('un par en espejo no tiene nada propio que mover', () => {
    const r = resizePiece({ ...loom({ '0,0': A }), pair: { mode: 'mirror' } }, { cols: 6, rows: 3, colSide: 'left', rowSide: 'bottom' })
    expect(r.pair).toEqual({ mode: 'mirror' })
  })
})
