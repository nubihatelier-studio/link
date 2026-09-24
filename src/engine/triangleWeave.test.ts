import { describe, expect, it } from 'vitest'
import { buildTriangleWeaveOrder, triangleWeaveKeys } from './triangleWeave'
import { triangleBeadCount, triangleKey, triangleNeighbourMap } from './trianglePeyote'

describe('En qué orden se teje un peyote triangular', () => {
  it('empieza por las tres del centro, ensartadas juntas', () => {
    const [primero] = buildTriangleWeaveOrder(5)
    expect(primero.round).toBe(1)
    expect(primero.beads.map(triangleKey)).toEqual(['0:1:0', '1:1:0', '2:1:0'])
  })

  it('ensarta todas las mostacillas de la pieza, y ninguna dos veces', () => {
    for (const rounds of [1, 2, 3, 7, 12]) {
      const llaves = triangleWeaveKeys(buildTriangleWeaveOrder(rounds))
      expect(llaves).toHaveLength(triangleBeadCount(rounds))
      expect(new Set(llaves).size).toBe(llaves.length)
    }
  })

  it('va vuelta por vuelta, sin volver atrás', () => {
    const vueltas = buildTriangleWeaveOrder(8).map((p) => p.round)
    expect(vueltas).toEqual([...vueltas].sort((a, b) => a - b))
  })

  it('la segunda vuelta son tres esquinas de dos mostacillas y nada más', () => {
    const segunda = buildTriangleWeaveOrder(2).filter((p) => p.round === 2)
    expect(segunda).toHaveLength(3)
    expect(segunda.every((p) => p.isCorner && p.beads.length === 2)).toBe(true)
  })

  it('cada vuelta lleva tres esquinas de dos, y entre ellas una por hueco', () => {
    const orden = buildTriangleWeaveOrder(6)
    for (let round = 2; round <= 6; round++) {
      const pasos = orden.filter((p) => p.round === round)
      const esquinas = pasos.filter((p) => p.isCorner)
      const sueltas = pasos.filter((p) => !p.isCorner)
      expect(esquinas).toHaveLength(3)
      expect(esquinas.every((p) => p.beads.length === 2)).toBe(true)
      // Un hueco menos que la vuelta, por cada uno de los tres lados.
      expect(sueltas).toHaveLength(3 * (round - 2))
      expect(sueltas.every((p) => p.beads.length === 1)).toBe(true)
    }
  })

  it('las dos de una esquina son las que se dan la mano en la costura', () => {
    const vecinas = triangleNeighbourMap(6)
    for (const paso of buildTriangleWeaveOrder(6).filter((p) => p.isCorner)) {
      const [a, b] = paso.beads.map(triangleKey)
      expect(vecinas.get(a)).toContain(b)
    }
  })

  it('cada vuelta arranca en una esquina, que es donde queda la aguja', () => {
    const orden = buildTriangleWeaveOrder(7)
    for (let round = 2; round <= 7; round++) {
      expect(orden.find((p) => p.round === round)!.isCorner).toBe(true)
    }
  })

  it('cada mostacilla nueva se traba con alguna de las ya ensartadas: el hilo nunca salta al aire', () => {
    const rounds = 7
    const vecinas = triangleNeighbourMap(rounds)
    const puestas = new Set<string>()
    for (const paso of buildTriangleWeaveOrder(rounds)) {
      const llaves = paso.beads.map(triangleKey)
      if (paso.round > 1) {
        const seTraba = llaves.some((k) => (vecinas.get(k) ?? []).some((v) => puestas.has(v)))
        expect(seTraba, `la vuelta ${paso.round} empieza en el aire`).toBe(true)
      }
      for (const k of llaves) puestas.add(k)
    }
  })

  it('una pieza de una sola vuelta son sólo las tres del centro', () => {
    expect(buildTriangleWeaveOrder(1)).toHaveLength(1)
    expect(buildTriangleWeaveOrder(0)).toEqual([])
  })
})
