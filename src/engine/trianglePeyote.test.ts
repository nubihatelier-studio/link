import { describe, expect, it } from 'vitest'
import {
  beadsInRound,
  parseTriangleKey,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleKey,
} from './trianglePeyote'

describe('Triángulo de peyote — cada vuelta lleva las que quepan', () => {
  it('una vuelta lejos del centro lleva más que una cercana', () => {
    const n = [1, 2, 3, 4, 5].map(beadsInRound)
    expect(n).toEqual([...n].sort((a, b) => a - b))
    expect(n[0]).toBeLessThan(n[4])
  })

  it('crece parejo: cada vuelta suma unas tres por lado', () => {
    for (const k of [2, 5, 9]) {
      expect(beadsInRound(k + 1) - beadsInRound(k)).toBeGreaterThanOrEqual(2)
      expect(beadsInRound(k + 1) - beadsInRound(k)).toBeLessThanOrEqual(4)
    }
  })

  it('el total son los tres lados de todas las vueltas', () => {
    const rounds = 6
    expect(triangleBeads(rounds)).toHaveLength(triangleBeadCount(rounds))
    expect(triangleBeadCount(rounds)).toBe(
      3 * [1, 2, 3, 4, 5, 6].reduce((t, k) => t + beadsInRound(k), 0),
    )
  })
})

describe('Triángulo de peyote — los tres lados', () => {
  it('son iguales: la misma cantidad de mostacillas en cada uno', () => {
    const cuenta = [0, 0, 0]
    for (const b of triangleBeads(8)) cuenta[b.sector]++
    expect(cuenta[0]).toBe(cuenta[1])
    expect(cuenta[1]).toBe(cuenta[2])
  })

  it('cada uno corre en su propia dirección, a un tercio de vuelta del otro', () => {
    expect(triangleBeadPlacement({ sector: 0, round: 3, index: 0 }).angle).toBe(0)
    expect(triangleBeadPlacement({ sector: 1, round: 3, index: 0 }).angle).toBe(120)
    expect(triangleBeadPlacement({ sector: 2, round: 3, index: 0 }).angle).toBe(240)
  })

  it('las vueltas se alejan del centro', () => {
    const d = (k: number) => {
      const p = triangleBeadPlacement({ sector: 0, round: k, index: 0 })
      return Math.hypot(p.x, p.y)
    }
    expect(d(1)).toBeLessThan(d(2))
    expect(d(2)).toBeLessThan(d(3))
  })
})

describe('Triángulo de peyote — el huequito de la costura', () => {
  it('lo que sobra en una fila no alcanza para otra mostacilla', () => {
    for (const k of [3, 7, 12]) {
      const cabe = 2 * Math.sqrt(3) * k * 0.87
      const sobra = cabe - beadsInRound(k)
      expect(sobra).toBeGreaterThanOrEqual(0)
      expect(sobra).toBeLessThan(1)
    }
  })
})

describe('Triángulo de peyote — la clave de una mostacilla', () => {
  it('va y vuelve', () => {
    const bead = { sector: 2, round: 4, index: 5 } as const
    expect(parseTriangleKey(triangleKey(bead))).toEqual(bead)
  })
})
