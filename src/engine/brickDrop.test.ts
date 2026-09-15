import { describe, expect, it } from 'vitest'
import {
  cellPosition,
  dropOf,
  effectiveStaggerPhase,
  flipStagger,
  isShiftedRow,
  phaseOf,
  staggerOf,
  withStagger,
  type StaggerPhase,
} from './geometry'
import { createShapedRowShape, detectPreset, preferredRowsFor, recenterRowShape, type BodyShapePreset } from './shape'
import { buildWeaveOrder, directionAtStep } from './weaveOrder'
import { buildWordChart, stitchLetters, wordChartRuns } from './wordChart'
import { assignLettersAcross } from './letters'
import { mirrorGeometry } from './pair'
import type { PatternConfig } from './types'

const two = staggerOf(0, 2)
const three = staggerOf(0, 3)

describe('brick 2-drop / 3-drop — geometría', () => {
  it('1-drop sigue siendo un número, igual que los patrones de antes', () => {
    expect(staggerOf(1, 1)).toBe(1)
    expect(effectiveStaggerPhase({ technique: 'brick', cols: 5, staggerPhase: 1 })).toBe(1)
    expect(effectiveStaggerPhase({ technique: 'brick', cols: 5, brickDrop: 2 })).toEqual({ phase: 0, drop: 2 })
    // Peyote no tiene drop aunque la config traiga uno.
    expect(effectiveStaggerPhase({ technique: 'peyote', cols: 6, brickDrop: 3 })).toBe(1)
  })

  it('las filas se corren de a pilas: 2-drop = 0,0,½,½,0,0…; 3-drop = 0,0,0,½,½,½', () => {
    expect([0, 1, 2, 3, 4, 5].map((r) => isShiftedRow(r, two))).toEqual([false, false, true, true, false, false])
    expect([0, 1, 2, 3, 4, 5].map((r) => isShiftedRow(r, three))).toEqual([false, false, false, true, true, true])
    expect(cellPosition('brick', 2, 0, undefined, two).x).toBe(0.5)
    expect(cellPosition('brick', 1, 0, undefined, two).x).toBe(0)
  })

  it('invertir la fase conserva el drop, y la config guarda drop solo si no es 1', () => {
    expect(flipStagger(two)).toEqual({ phase: 1, drop: 2 })
    expect(dropOf(flipStagger(three))).toBe(3)
    const config: PatternConfig = { technique: 'brick', cols: 4, rows: 4, beadTypeId: 'x' }
    expect(withStagger(config, { phase: 1, drop: 3 })).toEqual({
      technique: 'brick',
      cols: 4,
      rows: 4,
      beadTypeId: 'x',
      staggerPhase: 1,
      brickDrop: 3,
    })
    expect(withStagger({ ...config, brickDrop: 2 }, 0)).not.toHaveProperty('brickDrop')
  })

  it('el reflejo del par invierte la fase y mantiene el drop', () => {
    const mirrored = mirrorGeometry({ technique: 'brick', cols: 4, rows: 4, staggerPhase: two })
    expect(mirrored.staggerPhase).toEqual({ phase: 1, drop: 2 })
  })
})

describe('brick 2-drop / 3-drop — forma', () => {
  function physicalCenter(offset: number, length: number, row: number, stagger: StaggerPhase) {
    return offset + (isShiftedRow(row, stagger) ? 0.5 : 0) + length / 2
  }

  it('preferredRowsFor cuenta pilas enteras (impares en triángulo y rombo)', () => {
    expect(preferredRowsFor('triangle', 7, 2)).toBe(10) // 4 pilas → 5
    expect(preferredRowsFor('rhombus', 9, 3)).toBe(9) // 3 pilas, ya impar
    expect(preferredRowsFor('rectangle', 7, 3)).toBe(9)
    expect(preferredRowsFor('triangle', 7)).toBe(7) // 1-drop, igual que antes
  })

  for (const drop of [2, 3] as const) {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as BodyShapePreset[]) {
      for (const cols of [5, 8, 11]) {
        it(`${drop}-drop ${preset} ${cols} columnas: pilas del mismo ancho, punta de 2, ±1 por pila, centrado y dentro de la grilla`, () => {
          const stagger = staggerOf(0, drop)
          const rows = preferredRowsFor(preset, cols * drop, drop)
          const shape = createShapedRowShape(preset, cols, rows, stagger)
          expect(shape).toHaveLength(rows)
          for (let r = 0; r < rows; r++) {
            const top = Math.floor(r / drop) * drop
            expect(shape[r]).toEqual(shape[top])
            expect(shape[r].length).toBeGreaterThanOrEqual(2)
            expect(shape[r].offset).toBeGreaterThanOrEqual(0)
            expect(shape[r].offset + shape[r].length).toBeLessThanOrEqual(cols)
            expect(Math.abs(physicalCenter(shape[r].offset, shape[r].length, r, stagger) - cols / 2)).toBeLessThanOrEqual(0.5 + 1e-9)
            if (r >= drop) expect(Math.abs(shape[r].length - shape[r - drop].length)).toBeLessThanOrEqual(1)
          }
          expect(detectPreset(shape, cols, drop)).toBe(preset)
        })
      }
    }
  }

  it('un triángulo 2-drop con pilas que crecen de a 1 no se desvía nada del centro', () => {
    const shape = createShapedRowShape('triangle', 7, 10, two)
    expect(shape.map((r) => r.length)).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 7, 7])
    shape.forEach((r, i) => expect(physicalCenter(r.offset, r.length, i, two)).toBe(3.5))
    // Recentrar con la misma fase no cambia nada.
    expect(recenterRowShape(shape, 7, two)).toEqual(shape)
  })
})

describe('brick 2-drop / 3-drop — orden de tejido por puntada', () => {
  it('cada paso es una pila de arriba abajo, en serpentina por fila de puntadas', () => {
    const order = buildWeaveOrder('brick', 3, 4, undefined, undefined, 0, two)
    expect(order.map((s) => s.cells)).toEqual([
      [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      [{ row: 0, col: 1 }, { row: 1, col: 1 }],
      [{ row: 0, col: 2 }, { row: 1, col: 2 }],
      [{ row: 2, col: 2 }, { row: 3, col: 2 }],
      [{ row: 2, col: 1 }, { row: 3, col: 1 }],
      [{ row: 2, col: 0 }, { row: 3, col: 0 }],
    ])
    expect(order.map((s) => s.unit)).toEqual([0, 0, 0, 1, 1, 1])
    expect(order.map((s) => s.direction)).toEqual(['ltr', 'ltr', 'ltr', 'rtl', 'rtl', 'rtl'])
    expect(order.filter((s) => s.isBaseRow)).toHaveLength(3)
  })

  it('una última pila incompleta teje puntadas más cortas, sin perder mostacillas', () => {
    const order = buildWeaveOrder('brick', 2, 4, undefined, undefined, 0, three)
    expect(order.map((s) => s.cells.length)).toEqual([3, 3, 1, 1])
  })

  it('la flecha va de puntada a puntada por la fila, no en diagonal', () => {
    const order = buildWeaveOrder('brick', 3, 4, undefined, undefined, 0, two)
    expect(directionAtStep('brick', order, 0, 4, two)).toEqual({ dx: 1, dy: 0 })
  })

  it('con 1-drop el orden es el mismo de siempre', () => {
    expect(buildWeaveOrder('brick', 3, 2, undefined, undefined, 0, 0)).toEqual(buildWeaveOrder('brick', 3, 2))
  })
})

describe('brick 2-drop — secuencia escrita y letras', () => {
  const cells = {
    '0,0': '#aa0000', '1,0': '#00aa00',
    '0,1': '#aa0000', '1,1': '#00aa00',
    '0,2': '#aa0000', '1,2': '#aa0000',
  }
  const letter = (hex: string) => ({ '#aa0000': 'A', '#00aa00': 'B' })[hex] ?? '?'

  it('"2A+B, 1A+A": la cuenta es de puntadas y cada puntada nombra su pila', () => {
    const lines = buildWordChart('brick', 3, 2, cells, letter, undefined, undefined, undefined, two)
    expect(lines).toEqual([{ unitIndex: 0, text: '2A+B, 1A+A', isBaseRow: true }])
    const { runs } = wordChartRuns(lines[0].text)
    expect(runs.map((r) => stitchLetters(r.letter))).toEqual([['A', 'B'], ['A', 'A']])
  })

  it('las letras siguen el orden por puntada', () => {
    const entries = assignLettersAcross([{ technique: 'brick', cols: 3, rows: 2, cells: { '0,1': '#aa0000', '1,0': '#00aa00' }, staggerPhase: two }])
    // La pila de la columna 0 se teje primero, así que su mostacilla de abajo (B) llega antes que la columna 1.
    expect(entries.map((e) => [e.hex, e.letter])).toEqual([['#00aa00', 'A'], ['#aa0000', 'B']])
    expect(phaseOf(two)).toBe(0)
  })
})
