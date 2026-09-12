import { describe, expect, it } from 'vitest'
import { bestPhase, countDistinctColors, dominantPeriod, MIN_GRID_STRENGTH, suggestGridForImage } from './imageToPattern'

// Miyuki Delica 11/0, the catalog default (src/data/beadTypes.ts).
const DELICA_W = 1.6
const DELICA_H = 1.3

describe('suggestGridForImage', () => {
  it('loom + Delica: a square photo comes out with more rows than cols, so the woven piece stays square', () => {
    const { cols, rows } = suggestGridForImage(400, 400, 'loom', DELICA_W, DELICA_H, 60)
    expect(rows).toBe(60)
    expect(cols).toBeLessThan(rows)
    // Physical size should be close to square (within one bead's width of rounding slack).
    const widthMm = cols * DELICA_W
    const heightMm = rows * DELICA_H
    expect(Math.abs(widthMm - heightMm)).toBeLessThan(DELICA_W)
  })

  it('peyote compacts rows further, so it needs even fewer columns than loom for the same square photo', () => {
    const loom = suggestGridForImage(400, 400, 'loom', DELICA_W, DELICA_H, 60)
    const peyote = suggestGridForImage(400, 400, 'peyote', DELICA_W, DELICA_H, 60)
    expect(peyote.cols).toBeLessThan(loom.cols)
  })

  it('a plain square-pixel bead (width == height) reduces to the old behavior: cols == rows for a square photo', () => {
    const { cols, rows } = suggestGridForImage(400, 400, 'loom', 1.5, 1.5, 60)
    expect(cols).toBe(rows)
  })

  it('never returns fewer than 4 in either dimension for an extreme aspect ratio', () => {
    const { cols, rows } = suggestGridForImage(4000, 100, 'peyote', DELICA_W, DELICA_H, 60)
    expect(cols).toBeGreaterThanOrEqual(4)
    expect(rows).toBeGreaterThanOrEqual(4)
  })

  it('a tall (portrait) photo yields more rows than columns', () => {
    const { cols, rows } = suggestGridForImage(300, 600, 'loom', DELICA_W, DELICA_H, 60)
    expect(rows).toBeGreaterThan(cols)
  })
})

describe('dominantPeriod — el paso de la grilla, por autocorrelación', () => {
  /** Un perfil de bordes como el de un gráfico: un pico cada `paso` píxeles. */
  function perfilConPaso(paso: number, largo: number, ruido = 0): number[] {
    const p: number[] = []
    let semilla = 12345
    for (let i = 0; i < largo; i++) {
      semilla = (semilla * 1103515245 + 12345) % 2147483648 // ruido reproducible, sin período propio
      const enBorde = i % paso === 0
      p.push((enBorde ? 40 : 4) + (ruido ? (semilla / 2147483648) * 10 * ruido : 0))
    }
    return p
  }

  // El paso vuelve con decimales a propósito (ver `dominantPeriod`): un paso
  // real rara vez cae en un número entero de píxeles, y redondearlo corría el
  // muestreo media mostacilla. En una grilla sintética de paso exacto, eso se
  // ve como 17.0015 en vez de 17.
  it('encuentra el paso de una grilla limpia', () => {
    expect(dominantPeriod(perfilConPaso(17, 220), 4, 70).period).toBeCloseTo(17, 1)
  })

  it('lo encuentra igual con ruido encima, que es donde fallaba buscar picos', () => {
    const { period, strength } = dominantPeriod(perfilConPaso(11, 300, 0.6), 4, 100)
    expect(period).toBeCloseTo(11, 1)
    expect(strength).toBeGreaterThan(MIN_GRID_STRENGTH)
  })

  it('una imagen sin grilla (un degradado) no da una repetición fuerte', () => {
    const degradado = Array.from({ length: 300 }, (_, i) => i * 0.5)
    expect(dominantPeriod(degradado, 4, 100).strength).toBeLessThan(MIN_GRID_STRENGTH)
  })
})

describe('bestPhase — caer en el centro de la mostacilla, no en el borde', () => {
  it('elige el corrimiento que aterriza en el centro', () => {
    // Costo mínimo a medio paso: es donde está el centro si la grilla arranca en un borde.
    const pitch = 12
    const costo = (offset: number) => Math.abs(((offset % pitch) + pitch) % pitch - pitch / 2)
    expect(bestPhase(pitch, costo, 12)).toBeCloseTo(pitch / 2, 1)
  })

  it('si ya está centrada, no la mueve', () => {
    const pitch = 10
    const costo = (offset: number) => Math.min(offset, pitch - offset) === 0 ? 0 : 5
    expect(bestPhase(pitch, costo, 10)).toBe(0)
  })
})

describe('countDistinctColors — cuántos colores tiene de verdad la imagen', () => {
  const AZUL = { r: 30, g: 60, b: 180 }
  const DORADO = { r: 200, g: 165, b: 60 }
  const BLANCO = { r: 245, g: 245, b: 240 }
  /** Repite unos colores, con pequeñas variaciones como las del borde de una mostacilla. */
  function pixeles(base: { r: number; g: number; b: number }[], n: number) {
    const out = []
    for (let i = 0; i < n; i++) {
      const c = base[i % base.length]
      const jitter = (i % 3) - 1
      out.push({ r: c.r + jitter, g: c.g + jitter, b: c.b + jitter })
    }
    return out
  }

  it('un gráfico de dos colores responde dos, no doce', () => {
    expect(countDistinctColors(pixeles([AZUL, DORADO], 400))).toBe(2)
  })

  it('tres colores, tres', () => {
    expect(countDistinctColors(pixeles([AZUL, DORADO, BLANCO], 600))).toBe(3)
  })

  it('ignora un puñado de píxeles de borde: no son un color de la paleta', () => {
    const conBordes = [...pixeles([AZUL, DORADO], 600), { r: 115, g: 112, b: 120 }, { r: 118, g: 110, b: 118 }]
    expect(countDistinctColors(conBordes)).toBe(2)
  })

  it('nunca propone menos de dos ni más del techo', () => {
    expect(countDistinctColors(pixeles([AZUL], 100))).toBe(2)
    const muchos = Array.from({ length: 900 }, (_, i) => ({ r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 17) % 256 }))
    expect(countDistinctColors(muchos)).toBeLessThanOrEqual(12)
  })
})
