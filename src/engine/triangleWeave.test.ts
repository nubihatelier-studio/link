import { describe, expect, it } from 'vitest'
import { buildTriangleWeaveOrder, triangleThreadPath, triangleWeaveKeys } from './triangleWeave'
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

describe('Por dónde pasa la aguja', () => {
  const rounds = 7
  const orden = buildTriangleWeaveOrder(rounds)
  const camino = triangleThreadPath(orden, orden.length - 1)

  it('cada mostacilla por la que pasa ya estaba puesta antes de llegar ahí', () => {
    const puestas = new Set<string>()
    for (const parada of camino) {
      const llave = triangleKey(parada.bead)
      if (parada.kind === 'through') {
        expect(puestas.has(llave), `pasa por ${llave} antes de ensartarla`).toBe(true)
      } else {
        puestas.add(llave)
      }
    }
  })

  it('la aguja nunca salta: cada tramo va entre mostacillas que se tocan', () => {
    const vecinas = triangleNeighbourMap(rounds)
    for (let i = 1; i < camino.length; i++) {
      const a = triangleKey(camino[i - 1].bead)
      const b = triangleKey(camino[i].bead)
      expect(vecinas.get(a), `de ${a} a ${b} el hilo salta al aire`).toContain(b)
    }
  })

  it('entre las dos de una esquina no pasa por ninguna: se toman juntas', () => {
    for (const paso of orden.filter((p) => p.isCorner)) {
      const hasta = triangleThreadPath(orden, orden.indexOf(paso))
      const ultimas = hasta.slice(-2)
      expect(ultimas.map((p) => p.kind)).toEqual(['new', 'new'])
      expect(ultimas.map((p) => triangleKey(p.bead))).toEqual(paso.beads.map(triangleKey))
    }
  })

  it('ensarta cada mostacilla una sola vez, y el camino las trae todas', () => {
    const nuevas = camino.filter((p) => p.kind === 'new').map((p) => triangleKey(p.bead))
    expect(nuevas).toEqual(triangleWeaveKeys(orden))
  })

  it('al dar la vuelta pasa por la primera de la vuelta que termina, que quedó en la esquina', () => {
    // El primer paso de la vuelta 4 viene precedido por un paso por lo ya puesto.
    const iVuelta4 = orden.findIndex((p) => p.round === 4)
    const hasta = triangleThreadPath(orden, iVuelta4)
    const antesDeLaEsquina = hasta[hasta.length - 3]
    expect(antesDeLaEsquina.kind).toBe('through')
    expect(antesDeLaEsquina.round).toBe(3)
    // Es justo la primera que se ensartó en la vuelta 3.
    const primeraDeLa3 = orden.find((p) => p.round === 3)!.beads[0]
    expect(triangleKey(antesDeLaEsquina.bead)).toBe(triangleKey(primeraDeLa3))
  })

  it('al salir del aro del centro no pasa por nada: la aguja ya está ahí', () => {
    const hasta = triangleThreadPath(orden, 1)
    expect(hasta.filter((p) => p.kind === 'through')).toHaveLength(0)
  })

  it('usa cada mostacilla de la vuelta anterior exactamente una vez por vuelta', () => {
    for (let round = 3; round <= rounds; round++) {
      const iPrimero = orden.findIndex((p) => p.round === round)
      const iUltimo = orden.map((p) => p.round).lastIndexOf(round)
      const deEstaVuelta = triangleThreadPath(orden, iUltimo).filter((p) => p.step >= iPrimero)
      const pasadas = deEstaVuelta.filter((p) => p.kind === 'through' && p.round === round - 1).map((p) => triangleKey(p.bead))
      expect(new Set(pasadas).size).toBe(pasadas.length)
      expect(pasadas).toHaveLength(triangleBeadCount(round - 1) - triangleBeadCount(round - 2))
    }
  })
})

describe('El recorrido al revés', () => {
  const rounds = 7
  const alReves = buildTriangleWeaveOrder(rounds, false)
  const comoElReloj = buildTriangleWeaveOrder(rounds, true)

  it('ensarta exactamente las mismas mostacillas, en otro orden', () => {
    expect(new Set(triangleWeaveKeys(alReves))).toEqual(new Set(triangleWeaveKeys(comoElReloj)))
    expect(triangleWeaveKeys(alReves)).not.toEqual(triangleWeaveKeys(comoElReloj))
  })

  it('tiene los mismos pasos y las mismas esquinas: es el mismo tejido al espejo', () => {
    expect(alReves).toHaveLength(comoElReloj.length)
    expect(alReves.filter((p) => p.isCorner)).toHaveLength(comoElReloj.filter((p) => p.isCorner).length)
    for (let round = 2; round <= rounds; round++) {
      const pasos = alReves.filter((p) => p.round === round)
      expect(pasos.filter((p) => p.isCorner)).toHaveLength(3)
      expect(pasos.filter((p) => !p.isCorner)).toHaveLength(3 * (round - 2))
    }
  })

  it('sigue arrancando cada vuelta en una esquina', () => {
    for (let round = 2; round <= rounds; round++) {
      expect(alReves.find((p) => p.round === round)!.isCorner).toBe(true)
    }
  })

  it('las dos de una esquina siguen siendo las que se dan la mano en la costura', () => {
    const vecinas = triangleNeighbourMap(rounds)
    for (const paso of alReves.filter((p) => p.isCorner)) {
      const [a, b] = paso.beads.map(triangleKey)
      expect(vecinas.get(a)).toContain(b)
    }
  })

  it('va para el otro lado: la primera esquina de cada vuelta no es la misma', () => {
    for (let round = 2; round <= rounds; round++) {
      const a = alReves.find((p) => p.round === round)!.beads.map(triangleKey)
      const b = comoElReloj.find((p) => p.round === round)!.beads.map(triangleKey)
      // Es la misma costura, tomada al revés: misma pareja, otro orden de entrada.
      expect(new Set(a)).toEqual(new Set(b))
      expect(a).toEqual([...b].reverse())
    }
  })

  it('el hilo aguanta igual: ni salta al aire ni pasa por lo que no está puesto', () => {
    const vecinas = triangleNeighbourMap(rounds)
    const camino = triangleThreadPath(alReves, alReves.length - 1)
    const puestas = new Set<string>()
    for (let i = 0; i < camino.length; i++) {
      const llave = triangleKey(camino[i].bead)
      if (camino[i].kind === 'through') expect(puestas.has(llave), `pasa por ${llave} sin haberla puesto`).toBe(true)
      else puestas.add(llave)
      if (i > 0) {
        const antes = triangleKey(camino[i - 1].bead)
        expect(vecinas.get(antes), `de ${antes} a ${llave} salta al aire`).toContain(llave)
      }
    }
  })

  it('y sigue pasando por cada mostacilla de la vuelta anterior una sola vez', () => {
    for (let round = 3; round <= rounds; round++) {
      const iPrimero = alReves.findIndex((p) => p.round === round)
      const iUltimo = alReves.map((p) => p.round).lastIndexOf(round)
      const deEstaVuelta = triangleThreadPath(alReves, iUltimo).filter((p) => p.step >= iPrimero)
      const pasadas = deEstaVuelta.filter((p) => p.kind === 'through' && p.round === round - 1).map((p) => triangleKey(p.bead))
      expect(new Set(pasadas).size).toBe(pasadas.length)
      expect(pasadas).toHaveLength(triangleBeadCount(round - 1) - triangleBeadCount(round - 2))
    }
  })
})
