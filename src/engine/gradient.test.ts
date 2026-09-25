import { describe, expect, it } from 'vitest'
import { computeGradientCells, computeGradientFromTargets } from './gradient'
import { triangleBeadCount, triangleBeadPlacement, triangleBeads, triangleKey } from './trianglePeyote'

const RED = '#ff0000'
const BLUE = '#0000ff'
const GREEN = '#00ff00'
const BLACK = '#000000'
const NAVY = '#1f2f6b'
const PURPLE = '#4a2a6b'
const TURQUOISE = '#3ab0c8'
const PINK = '#d77aa8'

const column = (n: number) => Array.from({ length: n }, (_, row) => ({ row, col: 0 }))

describe('computeGradientCells', () => {
  it('vertical: el primer color arriba y el último abajo (loom, sin salpicado)', () => {
    const result = computeGradientCells(column(3), 'loom', 20, [RED, BLUE], 'vertical', 0)
    expect(result['0,0']).toBe(RED)
    expect(result['2,0']).toBe(BLUE)
  })

  it('usa todos los colores elegidos, aunque no queden "entre" el primero y el último', () => {
    // El caso reportado: de negro a azul marino con ocho colores salían tres.
    const stops = [BLACK, NAVY, PURPLE, TURQUOISE, PINK, RED, GREEN, BLUE]
    const result = computeGradientCells(column(80), 'loom', 80, stops, 'vertical', 0.6)
    expect(new Set(Object.values(result))).toEqual(new Set(stops))
  })

  it('respeta el orden elegido: cada color ocupa su franja, de arriba hacia abajo', () => {
    const stops = [PINK, BLACK, TURQUOISE]
    const result = computeGradientCells(column(30), 'loom', 30, stops, 'vertical', 0)
    expect(result['0,0']).toBe(PINK)
    expect(result['15,0']).toBe(BLACK)
    expect(result['29,0']).toBe(TURQUOISE)
    // Sin salpicado, las franjas son parejas: diez mostacillas cada una.
    for (const hex of stops) expect(Object.values(result).filter((h) => h === hex)).toHaveLength(10)
  })

  it('diagonalDR: avanza con la fila y la columna (abajo a la derecha)', () => {
    const cells = [
      { row: 0, col: 0 },
      { row: 0, col: 4 },
      { row: 4, col: 0 },
      { row: 4, col: 4 },
    ]
    const result = computeGradientCells(cells, 'loom', 20, [RED, BLUE], 'diagonalDR', 0)
    expect(result['0,0']).toBe(RED)
    expect(result['4,4']).toBe(BLUE)
  })

  it('diagonalDL: avanza con la fila y retrocede con la columna (abajo a la izquierda)', () => {
    const cells = [
      { row: 0, col: 4 },
      { row: 4, col: 0 },
    ]
    const result = computeGradientCells(cells, 'loom', 20, [RED, BLUE], 'diagonalDL', 0)
    expect(result['0,4']).toBe(RED)
    expect(result['4,0']).toBe(BLUE)
  })

  it('sigue sin salto del cuerpo al fleco (brick)', () => {
    const bodyRows = 8
    const cells = [
      { row: bodyRows - 1, col: 0 },
      { row: bodyRows, col: 0 },
      { row: bodyRows + 5, col: 0 },
    ]
    const result = computeGradientCells(cells, 'brick', bodyRows, [RED, GREEN, BLUE], 'vertical', 0)
    expect(result[`${bodyRows - 1},0`]).toBe(RED)
    expect(result[`${bodyRows + 5},0`]).toBe(BLUE)
  })

  it('el salpicado mezcla algunas mostacillas en la unión de dos franjas', () => {
    const flat = computeGradientCells(column(20), 'loom', 20, [RED, GREEN, BLUE], 'vertical', 0)
    const dithered = computeGradientCells(column(20), 'loom', 20, [RED, GREEN, BLUE], 'vertical', 0.6)
    expect(column(20).some((c) => flat[`${c.row},0`] !== dithered[`${c.row},0`])).toBe(true)
  })

  it('devuelve un mapa vacío sin celdas o sin colores', () => {
    expect(computeGradientCells([], 'loom', 20, [RED, BLUE], 'vertical')).toEqual({})
    expect(computeGradientCells(column(3), 'loom', 20, [], 'vertical')).toEqual({})
  })

  it('una sola celda no divide por cero', () => {
    const result = computeGradientCells([{ row: 3, col: 3 }], 'loom', 20, [RED, BLUE], 'vertical', 0)
    expect(result['3,3']).toBe(RED)
  })
})

describe('El degradado del peyote triangular', () => {
  const AZUL = '#2f6fd0'
  const DORADO = '#e2b93b'
  const ROJO = '#b8444c'
  const rounds = 8

  /** Las mostacillas del triángulo, ubicadas como las dibuja la app. */
  function objetivos(pointingUp = true) {
    return triangleBeads(rounds).map((bead) => {
      const p = triangleBeadPlacement(bead, pointingUp)
      return {
        key: triangleKey(bead),
        x: p.x,
        y: p.y,
        ditherRow: bead.round,
        ditherCol: bead.index + bead.sector * 3,
        ring: bead.round,
      }
    })
  }

  it('pinta todas las mostacillas de la pieza y ninguna otra', () => {
    const pintado = computeGradientFromTargets(objetivos(), [AZUL, DORADO], 'vertical')
    expect(Object.keys(pintado)).toHaveLength(triangleBeadCount(rounds))
    expect(Object.keys(pintado).every((k) => k.split(':').length === 3)).toBe(true)
    expect(new Set(Object.values(pintado))).toEqual(new Set([AZUL, DORADO]))
  })

  it('"desde el centro" deja el primer color en el medio y el último en el borde', () => {
    const pintado = computeGradientFromTargets(objetivos(), [AZUL, DORADO, ROJO], 'fromCenter', 0)
    // La vuelta 1 es el centro; la última, el borde de afuera.
    expect(pintado['0:1:0']).toBe(AZUL)
    expect(pintado[triangleKey({ sector: 0, round: rounds, index: 0 })]).toBe(ROJO)
  })

  it('"desde el centro" pinta cada vuelta entera de un solo color: son anillos', () => {
    const pintado = computeGradientFromTargets(objetivos(), [AZUL, DORADO, ROJO], 'fromCenter', 0)
    for (let round = 1; round <= rounds; round++) {
      const deLaVuelta = triangleBeads(rounds)
        .filter((b) => b.round === round)
        .map((b) => pintado[triangleKey(b)])
      expect(new Set(deLaVuelta).size, `la vuelta ${round} salió de más de un color`).toBe(1)
    }
  })

  it('"vertical" sigue la punta: dada vuelta la pieza, el degradado se da vuelta con ella', () => {
    const arriba = computeGradientFromTargets(objetivos(true), [AZUL, ROJO], 'vertical', 0)
    const abajo = computeGradientFromTargets(objetivos(false), [AZUL, ROJO], 'vertical', 0)
    // La punta de arriba y la de abajo son la misma mostacilla, y cambia de color.
    const punta = triangleKey({ sector: 0, round: rounds, index: 0 })
    expect(arriba[punta]).not.toBe(abajo[punta])
  })

  it('un solo color pinta todo de ese color', () => {
    const pintado = computeGradientFromTargets(objetivos(), [AZUL], 'fromCenter')
    expect(new Set(Object.values(pintado))).toEqual(new Set([AZUL]))
  })

  it('sin colores no toca nada', () => {
    expect(computeGradientFromTargets(objetivos(), [], 'vertical')).toEqual({})
  })
})

describe('El degradado del peyote triangular — por qué sigue las vueltas', () => {
  const AZUL = '#2f6fd0'
  const ROJO = '#b8444c'

  it('sin `ring` mediría la distancia al medio, y en un triángulo eso corta las vueltas', () => {
    const rounds = 8
    const porDistancia = triangleBeads(rounds).map((bead) => {
      const p = triangleBeadPlacement(bead, true)
      return { key: triangleKey(bead), x: p.x, y: p.y, ditherRow: bead.round, ditherCol: bead.index }
    })
    const pintado = computeGradientFromTargets(porDistancia, [AZUL, ROJO], 'fromCenter', 0)
    // Alguna vuelta sale de dos colores: las esquinas quedan más lejos del
    // centro que el medio de los lados. Es justo lo que `ring` evita.
    const cortada = Array.from({ length: rounds }, (_, i) => i + 1).some((round) => {
      const colores = triangleBeads(rounds)
        .filter((b) => b.round === round)
        .map((b) => pintado[triangleKey(b)])
      return new Set(colores).size > 1
    })
    expect(cortada).toBe(true)
  })
})
