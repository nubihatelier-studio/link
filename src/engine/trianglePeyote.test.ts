import { describe, expect, it } from 'vitest'
import {
  beadsInRound,
  triangleBeadAt,
  beadsPerSide,
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

  it('la vuelta k lleva k por lado: la regla que dio la tejedora', () => {
    expect([1, 2, 3, 4, 5].map(beadsInRound)).toEqual([1, 2, 3, 4, 5])
    expect(beadsPerSide(2)).toBe(2)
  })

  it('las vueltas van más juntas que el ancho de una mostacilla: en peyote se encajan', () => {
    expect(ROUND_PITCH).toBeLessThan(1)
    expect(ROUND_PITCH).toBeGreaterThan(0.2)
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

describe('Triángulo de peyote — el huequito del centro', () => {
  it('las tres primeras dejan un espacio en el medio', () => {
    const centro = triangleBeads(1).map(triangleBeadPlacement)
    // Ninguna de las tres cae en el centro: lo rodean.
    for (const p of centro) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.2)
  })
})

describe('Triángulo de peyote — la clave de una mostacilla', () => {
  it('va y vuelve', () => {
    const bead = { sector: 1, round: 6, index: 4 } as const
    expect(parseTriangleKey(triangleKey(bead))).toEqual(bead)
  })
})

describe('Triángulo de peyote — tocar una mostacilla', () => {
  it('el centro de una mostacilla devuelve esa mostacilla', () => {
    for (const bead of [
      { sector: 0, round: 1, index: 0 },
      { sector: 1, round: 4, index: 2 },
      { sector: 2, round: 7, index: 6 },
    ] as const) {
      const p = triangleBeadPlacement(bead)
      expect(triangleBeadAt(p.x, p.y, 8)).toEqual(bead)
    }
  })

  it('un punto lejos de la pieza no devuelve ninguna', () => {
    expect(triangleBeadAt(50, 50, 8)).toBeNull()
  })

  it('el triangulito hueco del centro no es de nadie', () => {
    expect(triangleBeadAt(0, 0, 8, 0.3)).toBeNull()
  })

  it('un punto corrido pero dentro de la mostacilla igual la encuentra', () => {
    const p = triangleBeadPlacement({ sector: 0, round: 5, index: 2 })
    expect(triangleBeadAt(p.x + 0.2, p.y - 0.15, 8)).toEqual({ sector: 0, round: 5, index: 2 })
  })
})
