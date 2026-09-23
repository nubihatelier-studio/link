import { describe, expect, it } from 'vitest'
import {
  beadsPerSide,
  parseTriangleKey,
  roundBeadCount,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleKey,
} from './triangleRound'

describe('Triángulo en vueltas — cuántas mostacillas', () => {
  it('cada vuelta lleva tres más que la anterior', () => {
    expect([1, 2, 3, 4].map((k) => roundBeadCount(k))).toEqual([3, 6, 9, 12])
  })

  it('el total va sumando esas vueltas', () => {
    expect(triangleBeadCount(1)).toBe(3)
    expect(triangleBeadCount(2)).toBe(9)
    expect(triangleBeadCount(4)).toBe(30)
    expect(triangleBeads(4)).toHaveLength(30)
  })
})

describe('Triángulo en vueltas — dónde queda cada mostacilla', () => {
  it('las del lado de abajo quedan acostadas y todas a la misma altura', () => {
    const abajo = triangleBeads(3).filter((b) => b.round === 3 && b.side === 2).map((b) => triangleBeadPlacement(b))
    expect(abajo).toHaveLength(3)
    expect(abajo.every((p) => Math.abs(p.y - abajo[0].y) < 1e-9)).toBe(true)
    expect(abajo.every((p) => Math.abs(Math.abs(p.angle) - 180) < 1e-9)).toBe(true)
  })

  it('las de los otros dos lados van giradas, cada una según su lado', () => {
    const [izq] = triangleBeads(2).filter((b) => b.round === 2 && b.side === 0).map((b) => triangleBeadPlacement(b))
    const [der] = triangleBeads(2).filter((b) => b.round === 2 && b.side === 1).map((b) => triangleBeadPlacement(b))
    expect(Math.round(izq.angle)).toBe(-60)
    expect(Math.round(der.angle)).toBe(60)
  })

  it('cada vuelta queda más afuera que la anterior', () => {
    const dist = (r: number) => {
      const p = triangleBeadPlacement({ round: r, side: 2, index: 0 })
      return Math.hypot(p.x, p.y)
    }
    expect(dist(1)).toBeLessThan(dist(2))
    expect(dist(2)).toBeLessThan(dist(3))
  })

  it('la clave de una mostacilla va y vuelve', () => {
    const bead = { round: 5, side: 1, index: 3 } as const
    expect(parseTriangleKey(triangleKey(bead))).toEqual(bead)
  })
})

describe('Triángulo en vueltas — las dos lecturas de cómo crece', () => {
  it('la del dibujo suma una por lado; la plana, las que caben de verdad', () => {
    expect(beadsPerSide(4, 'dibujo')).toBe(4)
    // 2√3·4 ≈ 13,9: lo que mide el lado de esa vuelta en mostacillas casi cuadradas.
    expect(beadsPerSide(4, 'plano')).toBe(14)
  })

  it('la plana lleva bastantes más mostacillas, que es lo que hay que ir a comprar', () => {
    expect(triangleBeadCount(8, 'dibujo')).toBe(108)
    expect(triangleBeadCount(8, 'plano')).toBeGreaterThan(300)
  })

  it('en las dos, una vuelta queda más afuera que la anterior', () => {
    for (const growth of ['dibujo', 'plano'] as const) {
      const dist = (r: number) => {
        const p = triangleBeadPlacement({ round: r, side: 2, index: 0 }, growth)
        return Math.hypot(p.x, p.y)
      }
      expect(dist(2)).toBeLessThan(dist(3))
    }
  })
})
