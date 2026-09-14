import { describe, expect, it } from 'vitest'
import {
  countDistinctColors,
  dominantPeriod,
  findBeadGrid,
  MIN_GRID_STRENGTH,
  sampleGrid,
  staggerAlignment,
  suggestGridForImage,
  type BeadGrid,
  type PixelImage,
} from './imageToPattern'

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

describe('findBeadGrid — gráficos rectos y escalonados', () => {
  const AZUL = [50, 70, 190]
  const DORADO = [214, 180, 90]

  /** Un color por mostacilla, repartido sin ningún período propio que confunda la grilla. */
  function motivo(fila: number, col: number): number[] {
    const h = Math.sin(fila * 12.9898 + col * 78.233) * 43758.5453
    return h - Math.floor(h) < 0.4 ? DORADO : AZUL
  }

  /**
   * Un gráfico dibujado como los que se importan de verdad: margen de papel,
   * contorno oscuro y cada mostacilla sombreada — clara arriba, oscura abajo,
   * que es lo que hacía repetir el brillo cada media mostacilla. Con
   * `altas` = 1 las columnas impares suben media mostacilla (como el gráfico
   * de prueba); con 0, las pares; sin `altas`, el gráfico es recto.
   */
  function grafico(opts: { cols: number; rows: number; pitchX: number; pitchY: number; altas?: 0 | 1 }): PixelImage {
    const margen = 12
    const { cols, rows, pitchX, pitchY, altas } = opts
    const width = Math.ceil(margen * 2 + cols * pitchX)
    const height = Math.ceil(margen * 2 + (rows + 0.5) * pitchY)
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const col = Math.floor((x - margen) / pitchX)
        if (col < 0 || col >= cols) continue
        const baja = altas !== undefined && col % 2 !== altas
        const dentro = y - margen - (baja ? pitchY / 2 : 0)
        const fila = Math.floor(dentro / pitchY)
        if (dentro < 0 || fila >= rows) continue
        const enX = (x - margen) / pitchX - col
        const enY = dentro / pitchY - fila
        const borde = enX < 0.08 || enX > 0.92 || enY < 0.06 || enY > 0.94
        // Brillo arriba, sombra abajo: el sombreado de un gráfico real.
        const luz = borde ? 0.35 : enY < 0.55 ? 1.1 - enY * 0.3 : 0.55
        const [r, g, b] = motivo(fila, col)
        const o = (y * width + x) * 4
        data[o] = r * luz
        data[o + 1] = g * luz
        data[o + 2] = b * luz
      }
    }
    return { data, width, height }
  }

  /** Los colores leídos, como 'D' (dorado) o 'A' (azul), para comparar con el motivo. */
  function leido(img: PixelImage, grid: BeadGrid, rows: number, technique: 'loom' | 'peyote') {
    const px = sampleGrid(img, grid, grid.cols, rows, technique)
    return px.map((p) => (p.r > p.b ? 'D' : 'A')).join('')
  }
  function esperado(cols: number, rows: number, primeraFila: (col: number) => number) {
    let out = ''
    for (let fila = 0; fila < rows; fila++) for (let col = 0; col < cols; col++) out += motivo(fila + primeraFila(col), col) === DORADO ? 'D' : 'A'
    return out
  }

  it('un gráfico escalonado y sombreado: 13 × 40, no el doble de filas', () => {
    const img = grafico({ cols: 13, rows: 40, pitchX: 17, pitchY: 21.6, altas: 1 })
    const grid = findBeadGrid(img)!
    expect(grid).not.toBeNull()
    expect(grid.cols).toBe(13)
    expect(grid.rows).toBe(40)
    expect(grid.pitchY).toBeCloseTo(21.6, 0)
    // Las impares arriba: empiezan media mostacilla antes que las pares.
    expect(grid.staggerY).toBeLessThan(-21.6 * 0.35)
    expect(grid.staggerY).toBeGreaterThan(-21.6 * 0.65)
  })

  it('cada columna se lee a su altura: el motivo sale mostacilla por mostacilla', () => {
    const img = grafico({ cols: 13, rows: 40, pitchX: 17, pitchY: 21.6, altas: 1 })
    const grid = findBeadGrid(img)!
    expect(leido(img, grid, 40, 'loom')).toBe(esperado(13, 40, () => 0))
  })

  it('un gráfico sombreado de dos colores cuenta dos: la sombra no es un color aparte', () => {
    for (const [pitchX, pitchY] of [[17, 21.6], [8, 6.5]]) {
      const img = grafico({ cols: 14, rows: 25, pitchX, pitchY, altas: 1 })
      const grid = findBeadGrid(img)!
      expect(countDistinctColors(sampleGrid(img, grid, 14, 25, 'loom'))).toBe(2)
    }
  })

  it('en peyote, un gráfico con las columnas altas al revés se corre una mostacilla y pierde una fila', () => {
    // 13 columnas: el tejido deja altas las pares (la primera y la última), el gráfico trae altas las impares.
    const img = grafico({ cols: 13, rows: 40, pitchX: 17, pitchY: 21.6, altas: 1 })
    const grid = findBeadGrid(img)!
    expect(staggerAlignment(grid, 'peyote')).toEqual({ rows: 39, shiftedParity: 1 })
    expect(leido(img, grid, 39, 'peyote')).toBe(esperado(13, 39, (col) => (col % 2 === 1 ? 1 : 0)))
  })

  it('en peyote, un gráfico que ya calza con el tejido se lee entero, sin correr nada', () => {
    const img = grafico({ cols: 13, rows: 40, pitchX: 17, pitchY: 21.6, altas: 0 })
    const grid = findBeadGrid(img)!
    expect(grid.staggerY).toBeGreaterThan(0)
    expect(staggerAlignment(grid, 'peyote')).toEqual({ rows: 40, shiftedParity: null })
    expect(leido(img, grid, 40, 'peyote')).toBe(esperado(13, 40, () => 0))
  })

  it('un gráfico recto sigue siendo recto', () => {
    const img = grafico({ cols: 20, rows: 30, pitchX: 14, pitchY: 12 })
    const grid = findBeadGrid(img)!
    expect(grid.cols).toBe(20)
    expect(grid.rows).toBe(30)
    expect(grid.staggerY).toBe(0)
    expect(staggerAlignment(grid, 'peyote')).toEqual({ rows: 30, shiftedParity: null })
    expect(leido(img, grid, 30, 'loom')).toBe(esperado(20, 30, () => 0))
  })

  it('quien teje manda: forzar recto o escalonado pasa por encima de lo detectado', () => {
    const escalonado = grafico({ cols: 13, rows: 40, pitchX: 17, pitchY: 21.6, altas: 1 })
    expect(findBeadGrid(escalonado, 'straight')!.staggerY).toBe(0)
    const recto = grafico({ cols: 20, rows: 30, pitchX: 14, pitchY: 12 })
    const forzado = findBeadGrid(recto, 'staggered')!
    expect(Math.abs(forzado.staggerY)).toBeCloseTo(forzado.pitchY / 2, 1)
  })

  it('una imagen sin grilla no inventa una', () => {
    const width = 200
    const height = 200
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = (i % width) / 2
      data[i * 4 + 1] = 100
      data[i * 4 + 2] = Math.floor(i / width)
      data[i * 4 + 3] = 255
    }
    expect(findBeadGrid({ data, width, height })).toBeNull()
  })
})
