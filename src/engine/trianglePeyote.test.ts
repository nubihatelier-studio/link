import { describe, expect, it } from 'vitest'
import {
  beadsInRow,
  parseTriangleKey,
  ROW_HEIGHT,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleKey,
  triangleSectorOf,
} from './trianglePeyote'

describe('Triángulo de peyote — cuántas mostacillas', () => {
  it('la fila de arriba es la más larga y van bajando de a una', () => {
    expect([0, 1, 2, 3].map((r) => beadsInRow(4, r))).toEqual([4, 3, 2, 1])
  })

  it('el total es la suma de las filas', () => {
    expect(triangleBeadCount(13)).toBe(91)
    expect(triangleBeads(13)).toHaveLength(91)
  })
})

describe('Triángulo de peyote — la retícula queda pareja, no montada', () => {
  it('cada mostacilla tiene vecinas a la misma distancia, en tres direcciones', () => {
    const side = 9
    const pts = triangleBeads(side).map((b) => triangleBeadPlacement(b, side))
    const vecinas = (p: { x: number; y: number }) =>
      pts
        .map((q) => Math.hypot(q.x - p.x, q.y - p.y))
        .filter((d) => d > 1e-9)
        .sort((a, b) => a - b)
    // Una del medio: sus seis vecinas están todas a una mostacilla de distancia.
    const medio = triangleBeadPlacement({ row: 4, index: 2 }, side)
    const seis = vecinas(medio).slice(0, 6)
    expect(seis.every((d) => Math.abs(d - 1) < 1e-9)).toBe(true)
  })

  it('las filas se corren media mostacilla, como en peyote', () => {
    const a = triangleBeadPlacement({ row: 0, index: 0 }, 5)
    const b = triangleBeadPlacement({ row: 1, index: 0 }, 5)
    expect(b.x - a.x).toBeCloseTo(0.5, 10)
    expect(b.y - a.y).toBeCloseTo(ROW_HEIGHT, 10)
  })
})

describe('Triángulo de peyote — los tres sectores', () => {
  it('cada mostacilla se acuesta a lo largo del lado que tiene más cerca', () => {
    const side = 9
    // Arriba al medio: sector de arriba, acostada horizontal.
    expect(triangleBeadPlacement({ row: 0, index: 4 }, side).angle).toBe(0)
    // Abajo del todo: la punta, que ya no es del lado de arriba.
    expect(triangleSectorOf({ row: 8, index: 0 }, side)).not.toBe(0)
    // Los dos lados de abajo miran para distinto lado.
    expect(triangleSectorOf({ row: 6, index: 0 }, side)).not.toBe(
      triangleSectorOf({ row: 6, index: 2 }, side),
    )
  })

  it('los tres sectores se reparten la pieza', () => {
    const side = 12
    const sectores = new Set(triangleBeads(side).map((b) => triangleSectorOf(b, side)))
    expect(sectores).toEqual(new Set([0, 1, 2]))
  })
})

describe('Triángulo de peyote — la clave de una mostacilla', () => {
  it('va y vuelve', () => {
    expect(parseTriangleKey(triangleKey({ row: 7, index: 3 }))).toEqual({ row: 7, index: 3 })
  })
})
