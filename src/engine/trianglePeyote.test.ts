import { describe, expect, it } from 'vitest'
import {
  ROUND_PITCH,
  beadsInRound,
  beadsPerSide,
  parseTriangleKey,
  triangleBeadAt,
  triangleBeadCount,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
  triangleKey,
  triangleNeighbourMap,
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
    const centro = triangleBeads(1).map((b) => triangleBeadPlacement(b))
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
    expect(triangleBeadAt(0, 0, 8, false, 0.3)).toBeNull()
  })

  it('un punto corrido pero dentro de la mostacilla igual la encuentra', () => {
    const p = triangleBeadPlacement({ sector: 0, round: 5, index: 2 })
    expect(triangleBeadAt(p.x + 0.2, p.y - 0.15, 8)).toEqual({ sector: 0, round: 5, index: 2 })
  })
})

describe('triangleNeighbourMap', () => {
  it('cada mostacilla se traba con las de antes y después en su vuelta, y con las de las vueltas vecinas', () => {
    const vecinas = triangleNeighbourMap(8)
    expect(new Set(vecinas.get('0:5:2'))).toEqual(
      new Set(['0:5:1', '0:5:3', '0:6:2', '0:6:3', '0:4:1', '0:4:2']),
    )
  })

  it('dos vueltas más allá no cuenta: si contara, una vuelta de otro color no frenaría el balde', () => {
    expect(triangleNeighbourMap(8).get('0:5:2')).not.toContain('0:7:3')
    expect(triangleNeighbourMap(8).get('0:5:2')).not.toContain('0:3:1')
  })

  it('una vuelta da la vuelta entera: la última de un sector sigue en la primera del siguiente', () => {
    const vecinas = triangleNeighbourMap(8)
    expect(vecinas.get('0:6:5')).toContain('1:6:0')
    expect(vecinas.get('1:6:0')).toContain('0:6:5')
    expect(vecinas.get('2:4:3')).toContain('0:4:0')
  })

  it('las tres del centro se tocan entre ellas', () => {
    const vecinas = triangleNeighbourMap(5)
    expect(new Set(vecinas.get('0:1:0'))).toEqual(new Set(['1:1:0', '2:1:0', '0:2:0', '0:2:1']))
  })

  it('la pieza entera es un solo tejido: desde una mostacilla se llega a todas', () => {
    const rounds = 7
    const vecinas = triangleNeighbourMap(rounds)
    const vistas = new Set<string>(['0:1:0'])
    const pila = ['0:1:0']
    while (pila.length) {
      for (const v of vecinas.get(pila.pop()!) ?? []) {
        if (vistas.has(v)) continue
        vistas.add(v)
        pila.push(v)
      }
    }
    expect(vistas.size).toBe(triangleBeadCount(rounds))
  })

  it('la vecindad es mutua: si A se traba con B, B se traba con A', () => {
    const vecinas = triangleNeighbourMap(6)
    for (const [key, cerca] of vecinas) {
      for (const otra of cerca) expect(vecinas.get(otra)).toContain(key)
    }
  })
})

describe('Triángulo de peyote — hacia dónde mira la punta', () => {
  it('con la punta hacia arriba la pieza queda media vuelta girada, no espejada', () => {
    for (const bead of triangleBeads(5)) {
      const abajo = triangleBeadPlacement(bead)
      const arriba = triangleBeadPlacement(bead, true)
      expect(arriba.x).toBeCloseTo(-abajo.x, 10)
      expect(arriba.y).toBeCloseTo(-abajo.y, 10)
    }
  })

  it('mide lo mismo de un lado que del otro: girar no cambia el porte', () => {
    const abajo = triangleBoundsUnits(9)
    const arriba = triangleBoundsUnits(9, true)
    expect(arriba.width).toBeCloseTo(abajo.width, 10)
    expect(arriba.height).toBeCloseTo(abajo.height, 10)
  })

  it('apuntando hacia abajo la vuelta 1 queda arriba del centro; hacia arriba, abajo', () => {
    // El sector 0 es el lado de arriba cuando la punta va hacia abajo.
    expect(triangleBeadPlacement({ sector: 0, round: 1, index: 0 }).y).toBeLessThan(0)
    expect(triangleBeadPlacement({ sector: 0, round: 1, index: 0 }, true).y).toBeGreaterThan(0)
  })

  it('tocar una mostacilla respeta hacia dónde apunta', () => {
    const bead = { sector: 1 as const, round: 4, index: 2 }
    const p = triangleBeadPlacement(bead, true)
    expect(triangleBeadAt(p.x, p.y, 6, true)).toEqual(bead)
    // En el mismo punto, con la pieza al revés, cae otra mostacilla (o ninguna).
    expect(triangleBeadAt(p.x, p.y, 6, false)).not.toEqual(bead)
  })
})
