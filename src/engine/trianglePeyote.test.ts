import { describe, expect, it } from 'vitest'
import {
  beadsInRound,
  beadsPerSide,
  HOLE_RADIUS,
  roundDistance,
  parseTriangleKey,
  ROUND_PITCH,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleKey,
} from './trianglePeyote'

describe('Triángulo de peyote — medido contra una pieza terminada', () => {
  it('parte con las tres mostacillas del centro', () => {
    expect(beadsInRound(1)).toBe(1)
    expect(triangleBeads(1)).toHaveLength(3)
  })

  it('a las 8 vueltas el lado tiene lo que tiene su aro: unas 17', () => {
    expect(beadsPerSide(8)).toBeGreaterThanOrEqual(15)
    expect(beadsPerSide(8)).toBeLessThanOrEqual(18)
  })

  it('cada vuelta suma unas dos por lado — con una sola la pieza no queda plana', () => {
    for (const k of [3, 6, 10, 15]) {
      const suma = beadsInRound(k + 1) - beadsInRound(k)
      expect(suma).toBeGreaterThanOrEqual(1)
      expect(suma).toBeLessThanOrEqual(3)
    }
  })

  it('las filas van más juntas que el ancho de una mostacilla: en peyote se encajan', () => {
    expect(ROUND_PITCH).toBeLessThan(1)
    expect(ROUND_PITCH).toBeGreaterThan(0.4)
  })
})

describe('Triángulo de peyote — los tres lados', () => {
  it('son iguales', () => {
    const cuenta = [0, 0, 0]
    for (const b of triangleBeads(9)) cuenta[b.sector]++
    expect(cuenta[0]).toBe(cuenta[1])
    expect(cuenta[1]).toBe(cuenta[2])
    expect(cuenta[0] * 3).toBe(triangleBeadCount(9))
  })

  it('cada uno corre en su propia dirección, a un tercio de vuelta', () => {
    expect(triangleBeadPlacement({ sector: 0, round: 4, index: 0 }).angle).toBe(0)
    expect(triangleBeadPlacement({ sector: 1, round: 4, index: 0 }).angle).toBe(120)
    expect(triangleBeadPlacement({ sector: 2, round: 4, index: 0 }).angle).toBe(240)
  })

  it('las vueltas se van alejando del centro', () => {
    const d = (k: number) => {
      const p = triangleBeadPlacement({ sector: 0, round: k, index: 0 })
      return Math.hypot(p.x, p.y)
    }
    expect(d(1)).toBeLessThan(d(2))
    expect(d(5)).toBeLessThan(d(6))
  })
})

describe('Triángulo de peyote — los huecos, que la tejedora pidió respetar', () => {
  it('las tres del centro rodean el triangulito hueco, no lo tapan', () => {
    const centro = triangleBeads(1).map(triangleBeadPlacement)
    expect(centro).toHaveLength(3)
    // Quedan lo bastante afuera como para que se vea el hueco entre ellas.
    for (const p of centro) expect(Math.hypot(p.x, p.y)).toBeCloseTo(HOLE_RADIUS, 5)
  })

  it('en la costura sobra espacio: las dos mostacillas se tocan por la punta', () => {
    for (const k of [2, 5, 9, 14]) {
      const cabe = 2 * Math.sqrt(3) * roundDistance(k)
      const sobra = cabe - beadsInRound(k)
      expect(sobra).toBeGreaterThan(0)
      expect(sobra).toBeLessThan(1)
    }
  })
})

describe('Triángulo de peyote — la clave de una mostacilla', () => {
  it('va y vuelve', () => {
    const bead = { sector: 1, round: 6, index: 4 } as const
    expect(parseTriangleKey(triangleKey(bead))).toEqual(bead)
  })
})
