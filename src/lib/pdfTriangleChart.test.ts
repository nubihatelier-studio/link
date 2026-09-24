import { describe, expect, it } from 'vitest'
import { rotatedBeadPath } from './pdfTriangleChart'

/** Recorre el camino y devuelve por dónde pasó el lápiz, en milímetros de la hoja. */
function recorrer(path: ReturnType<typeof rotatedBeadPath>) {
  let [x, y] = path.start
  const puntos: [number, number][] = [[x, y]]
  for (const seg of path.segments) {
    // De una curva sólo interesa dónde termina; los tiradores quedan dentro del contorno.
    const [dx, dy] = seg.length === 2 ? seg : [seg[4], seg[5]]
    x += dx
    y += dy
    puntos.push([x, y])
  }
  return puntos
}

describe('rotatedBeadPath', () => {
  it('cierra el contorno: termina donde empezó', () => {
    const path = rotatedBeadPath(50, 60, 4, 3.6, 0.6, 120)
    const puntos = recorrer(path)
    const [fx, fy] = puntos[puntos.length - 1]
    expect(fx).toBeCloseTo(path.start[0], 6)
    expect(fy).toBeCloseTo(path.start[1], 6)
  })

  it('sin girar, cabe justo en el rectángulo de la mostacilla', () => {
    const w = 4
    const h = 3
    const puntos = recorrer(rotatedBeadPath(50, 60, w, h, 0.5, 0))
    const xs = puntos.map((p) => p[0])
    const ys = puntos.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(50 - w / 2, 6)
    expect(Math.max(...xs)).toBeCloseTo(50 + w / 2, 6)
    expect(Math.min(...ys)).toBeCloseTo(60 - h / 2, 6)
    expect(Math.max(...ys)).toBeCloseTo(60 + h / 2, 6)
  })

  it('girada 90°, el ancho y el alto se cambian de lugar', () => {
    const w = 4
    const h = 3
    const puntos = recorrer(rotatedBeadPath(50, 60, w, h, 0.5, 90))
    const ancho = Math.max(...puntos.map((p) => p[0])) - Math.min(...puntos.map((p) => p[0]))
    const alto = Math.max(...puntos.map((p) => p[1])) - Math.min(...puntos.map((p) => p[1]))
    expect(ancho).toBeCloseTo(h, 6)
    expect(alto).toBeCloseTo(w, 6)
  })

  it('la mostacilla queda centrada donde se le pidió', () => {
    const puntos = recorrer(rotatedBeadPath(120, 33, 4, 3.6, 0.6, 240))
    const cx = (Math.max(...puntos.map((p) => p[0])) + Math.min(...puntos.map((p) => p[0]))) / 2
    const cy = (Math.max(...puntos.map((p) => p[1])) + Math.min(...puntos.map((p) => p[1]))) / 2
    expect(cx).toBeCloseTo(120, 6)
    expect(cy).toBeCloseTo(33, 6)
  })

  it('un radio más grande que la mitad del lado se recorta, no se desborda', () => {
    const puntos = recorrer(rotatedBeadPath(50, 60, 4, 3, 99, 0))
    expect(Math.max(...puntos.map((p) => p[0]))).toBeCloseTo(52, 6)
    expect(Math.min(...puntos.map((p) => p[1]))).toBeCloseTo(58.5, 6)
  })
})
