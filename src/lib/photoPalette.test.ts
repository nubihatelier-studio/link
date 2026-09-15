import { describe, expect, it } from 'vitest'
import { paletteFromPixels, suggestPhotoColorCount, visiblePixels } from './photoPalette'
import { describeColor } from './colorName'
import type { RGB } from './color'

/** Una "foto": bloques de color con luz y sombra (el mismo color, más claro y más oscuro). */
function photo(blocks: { rgb: RGB; n: number }[]): RGB[] {
  const out: RGB[] = []
  for (const { rgb, n } of blocks) {
    for (let i = 0; i < n; i++) {
      const light = (i % 5) - 2 // -2..2: sombra a luz
      out.push({ r: rgb.r + light * 6, g: rgb.g + light * 6, b: rgb.b + light * 6 })
    }
  }
  return out
}

const ROSADO = { r: 220, g: 120, b: 160 }
const VERDE = { r: 60, g: 130, b: 70 }
const AMARILLO = { r: 235, g: 205, b: 70 }
const FONDO = { r: 245, g: 243, b: 238 }

describe('paleta desde una foto', () => {
  it('cuenta los colores que la foto tiene de verdad, sin separar luz y sombra', () => {
    const pixels = photo([{ rgb: FONDO, n: 900 }, { rgb: ROSADO, n: 500 }, { rgb: VERDE, n: 400 }, { rgb: AMARILLO, n: 200 }])
    expect(suggestPhotoColorCount(pixels)).toBe(4)
  })

  it('devuelve los colores principales, del que más ocupa al que menos', () => {
    const pixels = photo([{ rgb: FONDO, n: 900 }, { rgb: ROSADO, n: 500 }, { rgb: VERDE, n: 400 }, { rgb: AMARILLO, n: 200 }])
    const palette = paletteFromPixels(pixels, 4)
    expect(palette).toHaveLength(4)
    expect(palette.map((c) => c.share)).toEqual(palette.map((c) => c.share).sort((a, b) => b - a))
    expect(palette.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 5)
    // El fondo es lo más grande: aparece primero, para descartarlo fácil.
    expect(palette[0].share).toBeCloseTo(900 / 2000, 1)
  })

  it('nunca pasa de 12 ni baja de 2, y una foto vacía no da colores', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 17) % 256 }))
    expect(paletteFromPixels(many, 40).length).toBeLessThanOrEqual(12)
    expect(suggestPhotoColorCount(photo([{ rgb: ROSADO, n: 100 }]))).toBe(2)
    expect(paletteFromPixels([], 5)).toEqual([])
  })
})

describe('paleta desde una foto — transparencias', () => {
  /** Píxeles RGBA como los entrega el canvas. */
  function rgba(blocks: { rgba: [number, number, number, number]; n: number }[]): number[] {
    return blocks.flatMap(({ rgba: px, n }) => Array.from({ length: n }, () => px).flat())
  }

  it('un rojo semitransparente se lee rosado, como se ve sobre blanco', () => {
    const [px] = visiblePixels([200, 40, 40, 77])
    expect(px.r).toBe(255 - Math.round((255 - 200) * 0.302))
    expect(px.g).toBeGreaterThan(170)
    expect(px.b).toBeGreaterThan(170)
  })

  it('el fondo vacío de un PNG queda fuera, pero un color al 40% no', () => {
    expect(visiblePixels([0, 0, 0, 0, 200, 40, 40, 102])).toHaveLength(1)
  })

  it('una tapa rosada dibujada con rojo transparente sale rosada y es lo que más ocupa', () => {
    const pixels = visiblePixels(rgba([
      { rgba: [200, 40, 40, 70], n: 700 }, // la tapa: rojo al ~27%
      { rgba: [196, 58, 48, 255], n: 280 }, // el costado rojo
      { rgba: [150, 40, 35, 255], n: 20 },
      { rgba: [0, 0, 0, 0], n: 500 }, // fondo vacío
    ]))
    const palette = paletteFromPixels(pixels, suggestPhotoColorCount(pixels))
    expect(palette[0].share).toBeGreaterThan(0.6)
    expect(describeColor(palette[0].hex)).toMatch(/rosad/i)
  })
})
